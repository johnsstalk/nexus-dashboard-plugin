import {
	DashboardConfig,
	DividerBlockConfig,
	SectionConfig,
	CardConfig,
	LinksConfig,
	LinkItem,
	RowConfig,
	ColumnConfig,
	RecentlyConfig,
	VaultListConfig,
	VaultActivityConfig,
	SearchConfig,
	StatsBlockConfig,
	SearchBlockConfig,
	HeatmapConfig,
	TimelineConfig,
	ClockConfig,
	FileTypeChartConfig,
} from "./types";
import {
	ensureExtension as ensureExt,
	safeParseInt,
	splitCsv,
	applyListConfigKV,
} from "./utils";

function finalizeCard(partial: Partial<CardConfig>): CardConfig {
	return {
		type: partial.type ?? "big",
		label: partial.label ?? "",
		desc: partial.desc,
		path: partial.path ?? "",
		icon: partial.icon ?? "MOC",
	};
}

function finalizeLinkItem(partial: Partial<LinkItem>): LinkItem {
	return {
		url: partial.url ?? "",
		label: partial.label,
		icon: partial.icon,
		desc: partial.desc,
	};
}

type ParseContext =
	| "root"
	| "header"
	| "stats"
	| "divider"
	| "section"
	| "cards"
	| "graph"
	| "links"
	| "row"
	| "column"
	| "search"
	| "recently"
	| "vaultlist"
	| "vault-activity"
	| "section-divider"
	| "heatmap"
	| "timeline"
	| "clock"
	| "filetypes";

export function parseDashboard(raw: string): DashboardConfig {
	const trimmed = raw.trim();
	if (!trimmed) {
		return buildDefaultConfig();
	}

	const config: DashboardConfig = {
		header: { text: "", font: "", color: "", size: 1, enabled: false },
		stats: { enabled: false, items: [] },
		blocks: [],
		recently: false,
		graph: { enabled: false, exclude: [] },
	};

	const lines = trimmed.split("\n");
	let context: ParseContext = "root";
	let currentDivider: DividerBlockConfig | null = null;
	let currentSection: SectionConfig | null = null;
	let currentCard: Partial<CardConfig> | null = null;
	let currentLinks: LinksConfig | null = null;
	let currentLinkItem: Partial<LinkItem> | null = null;
	let currentRow: RowConfig | null = null;
	let currentRowSectionsRemaining: number = 0;
	let currentColumn: ColumnConfig | null = null;
	let columnInsideRow = false;
	let columnIndent = -1;
	let currentSearch: SearchConfig | null = null;
	let currentRecently: RecentlyConfig | null = null;
	let currentVaultList: VaultListConfig | null = null;
	let currentVaultActivity: VaultActivityConfig | null = null;
	let currentHeatmap: HeatmapConfig | null = null;
	let currentTimeline: TimelineConfig | null = null;
	let currentClock: ClockConfig | null = null;
	let currentFileTypeChart: FileTypeChartConfig | null = null;

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i].replace(/\r$/, "");
		const indent = line.search(/\S/);
		let t = line.trim();
		if (!t || t.startsWith("#")) continue;

		// Strip YAML list prefix for known keywords (e.g. "- section:" → "section:")
		if (t.startsWith("- ")) {
			const stripped = t.slice(2);
			if (
				/^(header|stats|graph|divider|section|links|row|column|search|recently|vaultlist|vault-activity):/.test(
					stripped,
				)
			) {
				t = stripped;
			}
		}

		// ── Context switches ──────────────────────────────
		if (t === "header:") {
			flushCurrent();
			flushColumn();
			context = "header";
			continue;
		}
		if (t.startsWith("stats:") && t.length > 6) {
			flushCurrent();
			flushColumn();
			const val = t.slice(6).trim();
			config.stats.enabled = val === "true";
			context = "stats";
			continue;
		}
		if (t === "stats:") {
			flushCurrent();
			flushColumn();
			context = "stats";
			continue;
		}
		if (t === "graph:") {
			flushCurrent();
			flushColumn();
			context = "graph";
			continue;
		}
		if (t === "divider:") {
			if (context === "section" || context === "cards") {
				if (currentSection && currentSection.divider) {
					// Already has a divider — flush section first, create standalone divider
					flushCurrent();
					flushColumn();
					context = "divider";
					currentDivider = { kind: "divider", title: "", type: undefined };
					continue;
				}
				// First divider for this section — attach it
				if (currentSection) {
					currentSection.divider = { kind: "divider", title: "", type: undefined };
				}
				context = "section-divider";
				continue;
			}
			flushCurrent();
			flushColumn();
			context = "divider";
			currentDivider = { kind: "divider", title: "", type: undefined };
			continue;
		}

		// ── Section inside column (before root section:) ───
		if (t === "section:" && context === "column") {
			flushCard();
			currentSection = { kind: "section", columns: 2, cards: [] };
			context = "section";
			continue;
		}

		// ── Row inside column (nested, before root row:) ───
		if (t === "row:" && context === "column") {
			flushCard();
			flushSection();
			context = "row";
			currentRow = { kind: "row", children: [] };
			currentRowSectionsRemaining = 2;
			continue;
		}

		if (t === "section:") {
			// If a divider was just defined (context === "divider"), attach it to this section
			// instead of flushing it as a standalone divider
			const pendingDivider = context === "divider" && currentDivider ? currentDivider : null;
			if (pendingDivider) {
				currentDivider = null;
			}
			flushCurrent();
			if (
				columnInsideRow &&
				currentRow &&
				currentColumn &&
				currentColumn.children.length > 0 &&
				indent <= columnIndent
			) {
				flushColumn();
			}
			context = "section";
			currentSection = { kind: "section", columns: 2, cards: [] };
			if (pendingDivider) {
				currentSection.divider = pendingDivider;
			}
			continue;
		}
		if (t === "cards:") {
			if (context !== "section") {
				context = "cards";
			}
			continue;
		}

		// ── Links block ─────────────────────────────────
		if (t === "links:") {
			const pendingDivider = context === "divider" && currentDivider ? currentDivider : null;
			if (pendingDivider) {
				currentDivider = null;
			}
			flushCurrent();
			flushColumn();
			context = "links";
			currentLinks = { kind: "links", items: [] };
			if (pendingDivider) {
				currentLinks.title = pendingDivider.title;
			}
			continue;
		}

		// ── Row marker ──────────────────────────────────
		if (t === "row:") {
			flushCurrent();
			flushColumn();
			context = "row";
			currentRow = { kind: "row", children: [] };
			currentRowSectionsRemaining = 2; // default, overridden by columns:
			continue;
		}

		// ── Column inside row (nested, before root column:) ───
		if (t === "column:" && context === "row") {
			flushCard();
			flushSection();
			columnInsideRow = true;
			columnIndent = indent;
			currentRowSectionsRemaining--;
			context = "column";
			currentColumn = { kind: "column", children: [] };
			continue;
		}

		// ── Column marker ────────────────────────────────
		if (t === "column:") {
			flushCurrent();
			flushColumn();
			// If still inside a row (multiple columns in a row), maintain row context
			if (currentRow && currentRowSectionsRemaining > 0) {
				columnInsideRow = true;
				columnIndent = indent;
				currentRowSectionsRemaining--;
			}
			context = "column";
			currentColumn = { kind: "column", children: [] };
			continue;
		}

		// ── Search block ────────────────────────────────
		if (t === "search:") {
			flushCurrent();
			flushColumn();
			context = "search";
			currentSearch = { show: true };
			continue;
		}
		if (t === "vault-activity:") {
			flushCurrent();
			flushColumn();
			context = "vault-activity";
			currentVaultActivity = { kind: "vault-activity", show: true };
			continue;
		}
		if (t === "recently:" && !isRootRecentlyContext(lines, i)) {
			flushCurrent();
			flushColumn();
			context = "recently";
			currentRecently = { kind: "recently", show: true };
			continue;
		}
		if (t === "vaultlist:") {
			flushCurrent();
			flushColumn();
			context = "vaultlist";
			currentVaultList = { kind: "vaultlist", show: true };
			continue;
		}
		if (t === "heatmap:") {
			flushCurrent();
			flushColumn();
			context = "heatmap";
			currentHeatmap = { kind: "heatmap", show: true };
			continue;
		}
		if (t === "timeline:") {
			flushCurrent();
			flushColumn();
			context = "timeline";
			currentTimeline = { kind: "timeline", show: true };
			continue;
		}
		if (t === "clock:") {
			flushCurrent();
			flushColumn();
			context = "clock";
			currentClock = { kind: "clock", show: true };
			continue;
		}
		if (t === "filetypes:") {
			flushCurrent();
			flushColumn();
			context = "filetypes";
			currentFileTypeChart = { kind: "filetypes", show: true };
			continue;
		}

		// ── New card entry ────────────────────────────────
		if (t.startsWith("- type:")) {
			flushCard();
			currentCard = { type: parseValue(t, "- type:") === "mini" ? "mini" : "big" };
			context = "cards";
			continue;
		}

		// ── New link item entry ────────────────────────────
		if (t.startsWith("- url:") && context === "links") {
			flushLinkItem();
			currentLinkItem = { url: parseValue(t, "- url:") };
			continue;
		}

		// ── Key-value parsing ─────────────────────────────
		const kv = splitKV(t);
		if (!kv) continue;

		// Root-level keys recognized in ANY context
		if (kv.key === "recently") {
			if (kv.value === "true") {
				config.recently = true;
			} else if (kv.value === "false" || kv.value === "") {
				config.recently = false;
			}
			continue;
		}

		switch (context) {
			case "header":
				if (!config.header.enabled) {
					config.header = { text: "", font: "", color: "", size: 1, enabled: true };
				}
				if (kv.key === "size") {
					if (kv.value === "small") {
						config.header.size = 0.6;
					} else if (kv.value === "normal") {
						config.header.size = 1;
					} else {
						const n = Number(kv.value);
						config.header.size = Number.isFinite(n) && n > 0 ? n : 1;
					}
				} else if (kv.key === "mobileSize") {
					const n = Number(kv.value);
					config.header.mobileSize = Number.isFinite(n) && n > 0 ? n : undefined;
				} else if (kv.key === "text" || kv.key === "font" || kv.key === "color" || kv.key === "align") {
					(config.header as unknown as Record<string, string | number | boolean | undefined>)[kv.key] =
						kv.value;
				}
				break;
			case "stats":
				if (kv.key === "show") {
					config.stats.enabled = kv.value === "true";
				}
				break;
			case "divider":
				if (currentDivider) applyDividerKV(currentDivider, kv);
				break;
			case "section-divider":
				if (kv.key === "title" || kv.key === "type") {
					if (currentSection?.divider) applyDividerKV(currentSection.divider, kv);
				} else {
					// Not a divider key — revert to section context
					context = "section";
					if (currentSection) applySectionKV(currentSection, kv);
				}
				break;
			case "section":
				if (currentSection) applySectionKV(currentSection, kv);
				break;
			case "cards":
				if (currentCard) applyCardKV(currentCard, kv);
				break;
		case "graph":
			if (kv.key === "exclude") {
				config.graph.exclude = splitCsv(kv.value);
			} else if (kv.key === "showGraph") {
					config.graph.enabled = kv.value === "true";
				}
				break;
			case "links":
				if (currentLinkItem) {
					applyLinkItemKV(currentLinkItem, kv);
				} else if (currentLinks) {
					applyLinksKV(currentLinks, kv);
				}
				break;
		case "row":
			if (currentRow) {
				applyRowKV(currentRow, kv);
				if (kv.key === "columns") {
					currentRowSectionsRemaining = safeParseInt(kv.value, 2, 1, 4) ?? 2;
				}
			}
				break;
			case "column":
				if (currentColumn) {
					if (kv.key === "spacing") currentColumn.spacing = kv.value;
					if (kv.key === "align")
						currentColumn.align = kv.value as "left" | "center" | "right" | "stretch";
				}
				break;
			case "search":
				if (currentSearch) applySearchKV(currentSearch, kv);
				break;
		case "recently":
			if (currentRecently) applyListConfigKV(currentRecently, kv);
			break;
		case "vaultlist":
			if (currentVaultList) applyListConfigKV(currentVaultList, kv);
				break;
			case "heatmap":
				if (currentHeatmap) applyHeatmapKV(currentHeatmap, kv);
				break;
			case "timeline":
				if (currentTimeline) applyTimelineKV(currentTimeline, kv);
				break;
			case "clock":
				if (currentClock) applyClockKV(currentClock, kv);
				break;
			case "filetypes":
				if (currentFileTypeChart) applyFileTypeChartKV(currentFileTypeChart, kv);
				break;
		case "vault-activity":
			if (currentVaultActivity) {
				applyListConfigKV(currentVaultActivity, kv, {
					label: (val, t) => {
						(t as VaultActivityConfig).label = val;
					},
				});
			}
				break;
		}
	}

	// Flush trailing block
	flushCurrent();
	flushColumn();
	flushRow();

	return config;

	function flushCurrent() {
		flushCard();
		flushLinkItem();
		flushLinks();
		flushSection();
		flushDivider();
		flushSearch();
		flushRecently();
		flushVaultList();
		flushVaultActivity();
		flushHeatmap();
		flushTimeline();
		flushClock();
		flushFileTypeChart();
	}

	function flushCard() {
		if (currentSection && currentCard) {
			currentSection.cards.push(finalizeCard(currentCard));
			currentCard = null;
		}
	}

	function flushLinkItem() {
		if (currentLinks && currentLinkItem) {
			if (currentLinkItem.url) {
				currentLinks.items.push(finalizeLinkItem(currentLinkItem));
			}
			currentLinkItem = null;
		}
	}

	function flushLinks() {
		flushLinkItem();
		if (currentLinks) {
			config.blocks.push(currentLinks);
			currentLinks = null;
		}
	}

	function flushSection() {
		flushCard();
		if (currentSection) {
			if (currentColumn) {
				currentColumn.children.push(currentSection);
			} else if (currentRow && currentRowSectionsRemaining > 0) {
				currentRow.children.push(currentSection);
				currentRowSectionsRemaining--;
				if (currentRowSectionsRemaining === 0) {
					flushRow();
				}
			} else {
				config.blocks.push(currentSection);
			}
			currentSection = null;
		} else if (currentCard) {
			const implicitSection: SectionConfig = {
				kind: "section",
				columns: 2,
				cards: [finalizeCard(currentCard)],
			};
			if (currentColumn) {
				currentColumn.children.push(implicitSection);
			} else if (currentRow && currentRowSectionsRemaining > 0) {
				currentRow.children.push(implicitSection);
				currentRowSectionsRemaining--;
				if (currentRowSectionsRemaining === 0) {
					flushRow();
				}
			} else {
				config.blocks.push(implicitSection);
			}
			currentCard = null;
		}
	}

	function flushDivider() {
		if (currentDivider) {
			config.blocks.push(currentDivider);
			currentDivider = null;
		}
	}

	function flushRow() {
		if (currentRow) {
			if (currentRow.children.length > 0) {
				if (currentColumn) {
					currentColumn.children.push(currentRow);
				} else {
					config.blocks.push(currentRow);
				}
			}
			currentRow = null;
			currentRowSectionsRemaining = 0;
		}
	}

	function flushColumn() {
		if (currentColumn) {
			flushSection();
			if (currentColumn.children.length > 0) {
				if (columnInsideRow && currentRow) {
					currentRow.children.push(currentColumn);
					currentColumn = null;
					if (currentRowSectionsRemaining === 0) {
						flushRow();
					}
				} else {
					config.blocks.push(currentColumn);
				}
			}
			if (currentColumn) {
				currentColumn = null;
				columnInsideRow = false;
				columnIndent = -1;
			}
		}
	}

	function flushSearch() {
		if (currentSearch) {
			config.search = currentSearch;
			currentSearch = null;
		}
	}

	function flushRecently() {
		if (currentRecently) {
			config.blocks.push(currentRecently);
			currentRecently = null;
		}
	}

	function flushVaultList() {
		if (currentVaultList) {
			config.blocks.push(currentVaultList);
			currentVaultList = null;
		}
	}

	function flushVaultActivity() {
		if (currentVaultActivity) {
			config.blocks.push(currentVaultActivity);
			currentVaultActivity = null;
		}
	}

	function flushHeatmap() {
		if (currentHeatmap) {
			config.blocks.push(currentHeatmap);
			currentHeatmap = null;
		}
	}

	function flushTimeline() {
		if (currentTimeline) {
			config.blocks.push(currentTimeline);
			currentTimeline = null;
		}
	}

	function flushClock() {
		if (currentClock) {
			config.blocks.push(currentClock);
			currentClock = null;
		}
	}

	function flushFileTypeChart() {
		if (currentFileTypeChart) {
			config.blocks.push(currentFileTypeChart);
			currentFileTypeChart = null;
		}
	}
}

// ── KV apply helpers ─────────────────────────────────────

function applyDividerKV(divider: DividerBlockConfig, kv: { key: string; value: string }) {
	if (kv.key === "title") divider.title = kv.value;
	if (kv.key === "type") divider.type = kv.value;
}

function applySectionKV(section: SectionConfig, kv: { key: string; value: string }) {
	if (kv.key === "columns" || kv.key === "grid") {
		section.columns = safeParseInt(kv.value, 2, 1) ?? 2;
	}
}

function applyCardKV(card: Partial<CardConfig>, kv: { key: string; value: string }) {
	if (kv.key === "label") card.label = kv.value;
	if (kv.key === "desc") card.desc = kv.value;
	if (kv.key === "path") card.path = ensureExt(kv.value);
	if (kv.key === "icon") card.icon = kv.value;
	if (kv.key === "type") card.type = kv.value === "mini" ? "mini" : "big";
}

function applyLinksKV(links: LinksConfig, kv: { key: string; value: string }) {
	if (kv.key === "title") links.title = kv.value;
	if (kv.key === "columns") {
		links.columns = safeParseInt(kv.value, 3, 1);
	}
}

function applyLinkItemKV(item: Partial<LinkItem>, kv: { key: string; value: string }) {
	if (kv.key === "url") item.url = kv.value;
	if (kv.key === "label") item.label = kv.value;
	if (kv.key === "icon") item.icon = kv.value;
	if (kv.key === "desc") item.desc = kv.value;
}

function applyRowKV(row: RowConfig, kv: { key: string; value: string }) {
	if (kv.key === "proportion") row.proportion = kv.value;
	if (kv.key === "align") row.align = kv.value as "top" | "center" | "stretch";
	if (kv.key === "gap") row.gap = kv.value;
}

function applySearchKV(search: SearchConfig, kv: { key: string; value: string }) {
	if (kv.key === "show") search.show = kv.value === "true";
	if (kv.key === "default") search.default = kv.value as "vault" | "cards";
	if (kv.key === "placeholder") search.placeholder = kv.value;
}

// applyListConfigKV (from utils) handles: applyRecentlyKV, applyVaultListKV, applyVaultActivityKV

function applyHeatmapKV(heatmap: HeatmapConfig, kv: { key: string; value: string }) {
	if (kv.key === "show") heatmap.show = kv.value === "true";
	if (kv.key === "weeks") {
		const n = parseInt(kv.value, 10);
		heatmap.weeks = Number.isFinite(n) && n > 0 ? n : undefined;
	}
	if (kv.key === "label") heatmap.label = kv.value;
}

function applyTimelineKV(timeline: TimelineConfig, kv: { key: string; value: string }) {
	if (kv.key === "show") timeline.show = kv.value === "true";
	if (kv.key === "count") {
		const n = parseInt(kv.value, 10);
		timeline.count = Number.isFinite(n) && n > 0 ? n : undefined;
	}
	if (kv.key === "label") timeline.label = kv.value;
	if (kv.key === "exclude") {
		timeline.exclude = splitCsv(kv.value);
	}
}

function applyClockKV(clock: ClockConfig, kv: { key: string; value: string }) {
	if (kv.key === "show") clock.show = kv.value === "true";
	if (kv.key === "timezone") clock.timezone = kv.value;
	if (kv.key === "showDate") clock.showDate = kv.value === "true";
	if (kv.key === "showSeconds") clock.showSeconds = kv.value === "true";
	if (kv.key === "format") clock.format = kv.value as "12h" | "24h";
	if (kv.key === "label") clock.label = kv.value;
}

function applyFileTypeChartKV(chart: FileTypeChartConfig, kv: { key: string; value: string }) {
	if (kv.key === "show") chart.show = kv.value === "true";
	if (kv.key === "max") {
		const n = parseInt(kv.value, 10);
		chart.max = Number.isFinite(n) && n > 0 ? n : undefined;
	}
	if (kv.key === "label") chart.label = kv.value;
}

// ── Recently context detection ───────────────────────────

/** Determine if `recently:` at this line is the root-level boolean form */
function isRootRecentlyContext(allLines: string[], currentIdx: number): boolean {
	for (let j = currentIdx + 1; j < allLines.length; j++) {
		const raw = allLines[j].replace(/\r$/, "");
		const t = raw.trim();
		if (t === "" || t.startsWith("#")) continue;
		const nextIndent = raw.search(/\S/);
		const currentRaw = allLines[currentIdx].replace(/\r$/, "");
		const currentIndent = currentRaw.search(/\S/);
		if (nextIndent > currentIndent && /^(show|count|path|tags):/.test(t)) {
			return false;
		}
		return true;
	}
	return true;
}

// ── Utility ──────────────────────────────────────────────

function splitKV(line: string): { key: string; value: string } | null {
	const idx = line.indexOf(":");
	if (idx === -1) return null;
	const key = line.slice(0, idx).trim();
	const value = line
		.slice(idx + 1)
		.trim()
		.replace(/^["']|["']$/g, "");
	return { key, value };
}

function parseValue(line: string, prefix: string): string {
	return line
		.slice(prefix.length)
		.trim()
		.replace(/^["']|["']$/g, "");
}

export function buildDefaultConfig(): DashboardConfig {
	const config: DashboardConfig = {
		header: { text: "", font: "ANSI Shadow", color: "#8A5CF6", size: 1, enabled: false },
		stats: { enabled: false, items: [] },
		blocks: [],
		recently: false,
		graph: { enabled: false, exclude: [] },
	};

	// Default 2-row, 3-column layout for fresh users:
	// Row 1: Stats | Clock | Search
	// Row 2: Timeline | MOC Cards | Heatmap
	config.blocks.push(
		{
			kind: "row",
			columns: 3,
			proportion: "33/33/34",
			children: [
				{ kind: "column", children: [{ kind: "stats", config: config.stats } as StatsBlockConfig] },
				{ kind: "column", children: [] },
				{ kind: "column", children: [{ kind: "search", config: { show: true } } as SearchBlockConfig] },
			],
		},
		{
			kind: "row",
			columns: 3,
			proportion: "33/34/33",
			children: [
				{ kind: "column", children: [] },
				{ kind: "column", children: [] },
				{ kind: "column", children: [] },
			],
		},
	);

	return config;
}
