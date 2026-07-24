import {
	DashboardConfig,
	DividerBlockConfig,
	SectionConfig,
	CardConfig,
	LinksConfig,
	LinkItem,
	RowConfig,
	StackConfig,
	RecentlyConfig,
	SearchConfig,
} from "./types";
import { ensureExtension as ensureExt } from "./utils";

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

type ParseContext = "root" | "header" | "stats" | "divider" | "section" | "cards" | "graph" | "links" | "row" | "stack" | "search" | "recently" | "section-divider";

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
	let currentStack: StackConfig | null = null;
	let stackInsideRow = false;
	let stackIndent = -1;
	let currentSearch: SearchConfig | null = null;
	let currentRecently: RecentlyConfig | null = null;

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i].replace(/\r$/, "");
		const indent = line.search(/\S/);
		let t = line.trim();
		if (!t || t.startsWith("#")) continue;

		// Strip YAML list prefix for known keywords (e.g. "- section:" → "section:")
		if (t.startsWith("- ")) {
			const stripped = t.slice(2);
			if (/^(header|stats|graph|divider|section|links|row|stack|search|recently):/.test(stripped)) {
				t = stripped;
			}
		}

		// ── Context switches ──────────────────────────────
		if (t === "header:") {
			flushCurrent();
			flushStack();
			context = "header";
			continue;
		}
		if (t.startsWith("stats:") && t.length > 6) {
			flushCurrent();
			flushStack();
			const val = t.slice(6).trim();
			config.stats.enabled = val === "true";
			context = "stats";
			continue;
		}
		if (t === "stats:") {
			flushCurrent();
			flushStack();
			context = "stats";
			continue;
		}
		if (t === "graph:") {
			flushCurrent();
			flushStack();
			context = "graph";
			continue;
		}
		if (t === "divider:") {
			if (context === "section" || context === "cards") {
				if (currentSection && currentSection.divider) {
					// Already has a divider — flush section first, create standalone divider
					flushCurrent();
					flushStack();
					context = "divider";
					currentDivider = { kind: "divider", title: "", type: undefined };
					continue;
				}
				// First divider for this section — attach it
				currentSection.divider = { kind: "divider", title: "", type: undefined };
				context = "section-divider";
				continue;
			}
			flushCurrent();
			flushStack();
			context = "divider";
			currentDivider = { kind: "divider", title: "", type: undefined };
			continue;
		}

		// ── Section inside stack (before root section:) ───
		if (t === "section:" && context === "stack") {
			flushCard();
			currentSection = { kind: "section", columns: 2, cards: [] };
			context = "section";
			continue;
		}

		// ── Row inside stack (nested, before root row:) ───
		if (t === "row:" && context === "stack") {
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
			const pendingDivider = (context === "divider" && currentDivider) ? currentDivider : null;
			if (pendingDivider) {
				currentDivider = null;
			}
			flushCurrent();
			if (stackInsideRow && currentRow && currentStack && currentStack.children.length > 0 && indent <= stackIndent) {
				flushStack();
			}
			context = "section";
			currentSection = { kind: "section", columns: 2, cards: [] };
			if (pendingDivider) {
				currentSection.divider = pendingDivider;
			}
			continue;
		}
		if (t === "cards:") {
			if (context !== "tab-section") {
				context = "cards";
			}
			continue;
		}

		// ── Links block ─────────────────────────────────
		if (t === "links:") {
			const pendingDivider = (context === "divider" && currentDivider) ? currentDivider : null;
			if (pendingDivider) {
				currentDivider = null;
			}
			flushCurrent();
			flushStack();
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
			flushStack();
			context = "row";
			currentRow = { kind: "row", children: [] };
			currentRowSectionsRemaining = 2; // default, overridden by columns:
			continue;
		}

		// ── Stack inside row (nested, before root stack:) ───
		if (t === "stack:" && context === "row") {
			flushCard();
			flushSection();
			stackInsideRow = true;
			stackIndent = indent;
			currentRowSectionsRemaining--;
			context = "stack";
			currentStack = { kind: "stack", children: [] };
				continue;
		}

		// ── Stack marker ────────────────────────────────
		if (t === "stack:") {
			flushCurrent();
			flushStack();
			// If still inside a row (multiple stacks in a row), maintain row context
			if (currentRow && currentRowSectionsRemaining > 0) {
				stackInsideRow = true;
				stackIndent = indent;
				currentRowSectionsRemaining--;
			}
			context = "stack";
			currentStack = { kind: "stack", children: [] };
			continue;
		}



		// ── Search block ────────────────────────────────
		if (t === "search:") {
			flushCurrent();
			flushStack();
			context = "search";
			currentSearch = { show: true };
			continue;
		}
		if (t === "recently:" && !isRootRecentlyContext(lines, i)) {
			flushCurrent();
			flushStack();
			context = "recently";
			currentRecently = { kind: "recently", show: true };
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
			} else {
				applyKV(config.header, kv);
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
					config.graph.exclude = kv.value.split(",").map((s) => s.trim()).filter((s) => s.length > 0);
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
						const n = parseInt(kv.value, 10);
						currentRowSectionsRemaining = Number.isFinite(n) && n >= 1 && n <= 4 ? n : 2;
					}
				}
				break;
		case "stack":
			if (currentStack) {
				if (kv.key === "spacing") currentStack.spacing = kv.value;
				if (kv.key === "align") currentStack.align = kv.value as "left" | "center" | "right" | "stretch";

			}
			break;
			case "row-card":
				if (currentCard) applyCardKV(currentCard, kv);
				break;
			case "search":
				if (currentSearch) applySearchKV(currentSearch, kv);
				break;
			case "recently":
				if (currentRecently) applyRecentlyKV(currentRecently, kv);
				break;
		}
	}

	// Flush trailing block
	flushCurrent();
	flushStack();
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
			if (currentStack) {
				currentStack.children.push(currentSection);
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
			const implicitSection: SectionConfig = { kind: "section", columns: 2, cards: [finalizeCard(currentCard)] };
			if (currentStack) {
				currentStack.children.push(implicitSection);
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
				if (currentStack) {
					currentStack.children.push(currentRow);
				} else {
					config.blocks.push(currentRow);
				}
			}
			currentRow = null;
			currentRowSectionsRemaining = 0;
		}
	}

	function flushStack() {
		if (currentStack) {
			flushSection();
			if (currentStack.children.length > 0) {
				if (stackInsideRow && currentRow) {
					currentRow.children.push(currentStack);
					currentStack = null;
					if (currentRowSectionsRemaining === 0) {
						flushRow();
					}
				} else {
					config.blocks.push(currentStack);
				}
			}
			if (currentStack) {
				currentStack = null;
				stackInsideRow = false;
				stackIndent = -1;
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
}

// ── KV apply helpers ─────────────────────────────────────

function applyKV(target: Record<string, string>, kv: { key: string; value: string }) {
	target[kv.key] = kv.value;
}

function applyDividerKV(divider: DividerBlockConfig, kv: { key: string; value: string }) {
	if (kv.key === "title") divider.title = kv.value;
	if (kv.key === "type") divider.type = kv.value;
}

function applySectionKV(section: SectionConfig, kv: { key: string; value: string }) {
	if (kv.key === "columns" || kv.key === "grid") {
		const n = parseInt(kv.value, 10);
		section.columns = Number.isFinite(n) && n >= 1 ? n : 2;
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
		const n = parseInt(kv.value, 10);
		links.columns = Number.isFinite(n) && n >= 1 ? n : 3;
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

function applyRecentlyKV(recently: RecentlyConfig, kv: { key: string; value: string }) {
	if (kv.key === "show") recently.show = kv.value === "true";
	if (kv.key === "count") {
		const n = parseInt(kv.value, 10);
		recently.count = Number.isFinite(n) && n > 0 ? n : undefined;
	}
	if (kv.key === "path") recently.path = kv.value;
	if (kv.key === "tags") {
		recently.tags = kv.value.split(",").map((s) => s.trim()).filter((s) => s.length > 0);
	}
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
	const value = line.slice(idx + 1).trim().replace(/^["']|["']$/g, "");
	return { key, value };
}

function parseValue(line: string, prefix: string): string {
	return line.slice(prefix.length).trim().replace(/^["']|["']$/g, "");
}

export function buildDefaultConfig(): DashboardConfig {
	return {
		header: { text: "", font: "ANSI Shadow", color: "#8A5CF6", size: 1, enabled: false },
		stats: { enabled: false, items: [] },
		blocks: [],
		recently: false,
		graph: { enabled: false, exclude: [] },
	};
}
