import {
	DashboardConfig,
	DashboardBlock,
	DividerBlockConfig,
	SectionConfig,
	CardConfig,
	LinksConfig,
	LinkItem,
	RowConfig,
	TabsConfig,
	TabItem,
	RecentlyConfig,
	SearchConfig,
} from "./types";

/** Auto-append .md to extension-free paths */
function ensureExt(path: string): string {
	return /\.\w{1,10}$/.test(path) ? path : path + ".md";
}

type ParseContext = "root" | "header" | "stats" | "divider" | "section" | "cards" | "graph" | "links" | "row" | "tabs" | "search" | "recently";

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
	let currentRow: RowConfig | null = null;
	let currentTabs: TabsConfig | null = null;
	let currentTab: TabItem | null = null;
	let currentSearch: SearchConfig | null = null;
	let currentRecently: RecentlyConfig | null = null;

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i].replace(/\r$/, "");
		const t = line.trim();
		if (!t || t.startsWith("#")) continue;

		// ── Context switches ──────────────────────────────
		if (t === "header:") {
			flushCurrent();
			context = "header";
			continue;
		}
		if (t.startsWith("stats:") && t.length > 6) {
			flushCurrent();
			const val = t.slice(6).trim();
			config.stats.enabled = val === "true";
			context = "stats";
			continue;
		}
		if (t === "stats:") {
			flushCurrent();
			context = "stats";
			continue;
		}
		if (t === "graph:") {
			flushCurrent();
			context = "graph";
			continue;
		}
		if (t === "divider:") {
			flushCurrent();
			context = "divider";
			currentDivider = { kind: "divider", title: "", type: undefined };
			continue;
		}
		if (t === "section:") {
			flushCurrent();
			context = "section";
			currentSection = { kind: "section", columns: 2, cards: [] };
			continue;
		}
		if (t === "cards:") {
			context = "cards";
			continue;
		}

		// ── New block types ──────────────────────────────
		if (t === "links:") {
			flushCurrent();
			context = "links";
			currentLinks = { kind: "links", items: [] };
			continue;
		}
		if (t === "row:") {
			flushCurrent();
			// Pre-process: collect all indented children
			const childLines = collectIndentedLines(lines, i + 1);
			const childBlocks = parseChildBlocks(childLines);
			currentRow = { kind: "row", children: childBlocks };
			config.blocks.push(currentRow);
			currentRow = null;
			// Skip lines we consumed
			i += childLines.length;
			context = "root";
			continue;
		}
		if (t === "tabs:") {
			flushCurrent();
			// Pre-process: collect all indented children
			const childLines = collectIndentedLines(lines, i + 1);
			const tabItems = parseTabItems(childLines);
			currentTabs = { kind: "tabs", items: tabItems };
			config.blocks.push(currentTabs);
			currentTabs = null;
			i += childLines.length;
			context = "root";
			continue;
		}
		if (t === "search:") {
			flushCurrent();
			context = "search";
			currentSearch = { show: true };
			continue;
		}
		if (t === "recently:" && !isRootRecentlyContext(lines, i)) {
			flushCurrent();
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
				if (currentLinks) applyLinksKV(currentLinks, kv);
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

	return config;

	function flushCurrent() {
		flushCard();
		flushSection();
		flushDivider();
		flushLinks();
		flushSearch();
		flushRecently();
	}

	function flushCard() {
		if (currentSection && currentCard) {
			currentSection.cards.push(currentCard as CardConfig);
			currentCard = null;
		}
	}

	function flushSection() {
		flushCard();
		if (currentSection) {
			config.blocks.push(currentSection);
			currentSection = null;
		} else if (currentCard) {
			const implicitSection: SectionConfig = { kind: "section", columns: 2, cards: [currentCard as CardConfig] };
			config.blocks.push(implicitSection);
			currentCard = null;
		}
	}

	function flushDivider() {
		if (currentDivider) {
			config.blocks.push(currentDivider);
			currentDivider = null;
		}
	}

	function flushLinks() {
		if (currentLinks) {
			config.blocks.push(currentLinks);
			currentLinks = null;
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

// ── Indent-based child extraction ────────────────────────

/** Collect lines that are indented more than the starting position */
function collectIndentedLines(allLines: string[], startIdx: number): string[] {
	const collected: string[] = [];
	if (startIdx >= allLines.length) return collected;

	// Determine base indent from first non-empty line
	let baseIndent = -1;
	for (let j = startIdx; j < allLines.length; j++) {
		const raw = allLines[j].replace(/\r$/, "");
		if (raw.trim() === "" || raw.trim().startsWith("#")) continue;
		baseIndent = raw.search(/\S/);
		break;
	}
	if (baseIndent === -1) return collected;

	for (let j = startIdx; j < allLines.length; j++) {
		const raw = allLines[j].replace(/\r$/, "");
		const trimmedLine = raw.trim();
		if (trimmedLine === "" || trimmedLine.startsWith("#")) {
			collected.push(raw);
			continue;
		}
		const indent = raw.search(/\S/);
		if (indent > baseIndent) {
			collected.push(raw);
		} else {
			break;
		}
	}
	return collected;
}

/** Parse collected indented lines as child blocks for Row */
function parseChildBlocks(childLines: string[]): DashboardBlock[] {
	const blocks: DashboardBlock[] = [];
	if (childLines.length === 0) return blocks;

	// Determine the base indent level
	let baseIndent = -1;
	for (const raw of childLines) {
		const t = raw.trim();
		if (t === "" || t.startsWith("#")) continue;
		baseIndent = raw.search(/\S/);
		break;
	}
	if (baseIndent === -1) return blocks;

	// Strip base indent and rejoin as a string for parseDashboard
	const stripped = childLines.map((line) => {
		if (line.trim() === "") return "";
		return line.slice(baseIndent);
	}).join("\n");

	const childConfig = parseDashboard(stripped);
	return childConfig.blocks;
}

/** Parse collected indented lines as tab items for Tabs */
function parseTabItems(childLines: string[]): TabItem[] {
	const items: TabItem[] = [];
	if (childLines.length === 0) return items;

	// Determine base indent
	let baseIndent = -1;
	for (const raw of childLines) {
		const t = raw.trim();
		if (t === "" || t.startsWith("#")) continue;
		baseIndent = raw.search(/\S/);
		break;
	}
	if (baseIndent === -1) return items;

	// Split into tab entries: each "- label:" starts a new tab
	let currentTabLabel = "";
	let currentTabLines: string[] = [];
	let tabIndent = -1;

	for (const raw of childLines) {
		const t = raw.trim();
		if (t === "" || t.startsWith("#")) {
			if (currentTabLabel) currentTabLines.push(raw);
			continue;
		}
		const indent = raw.search(/\S/);

		// Check if this is a tab entry (- label: ...)
		if (t.startsWith("- label:") || t.startsWith("- label :")) {
			// Save previous tab
			if (currentTabLabel) {
				const tabBlocks = parseChildBlocks(currentTabLines);
				items.push({
					id: `tab-${items.length}`,
					label: currentTabLabel,
					blocks: tabBlocks,
				});
			}
			currentTabLabel = parseValue(t, t.startsWith("- label:") ? "- label:" : "- label :");
			currentTabLines = [];
			tabIndent = indent;
		} else if (currentTabLabel && indent > tabIndent) {
			currentTabLines.push(raw);
		} else if (currentTabLabel && indent <= tabIndent) {
			// End of current tab's content
			const tabBlocks = parseChildBlocks(currentTabLines);
			items.push({
				id: `tab-${items.length}`,
				label: currentTabLabel,
				blocks: tabBlocks,
			});
			currentTabLabel = "";
			currentTabLines = [];
		}
	}

	// Flush last tab
	if (currentTabLabel) {
		const tabBlocks = parseChildBlocks(currentTabLines);
		items.push({
			id: `tab-${items.length}`,
			label: currentTabLabel,
			blocks: tabBlocks,
		});
	}

	return items;
}

/** Determine if `recently:` at this line is the root-level boolean form */
function isRootRecentlyContext(allLines: string[], currentIdx: number): boolean {
	// Check if the next non-empty line is indented (block form) or not (boolean form)
	for (let j = currentIdx + 1; j < allLines.length; j++) {
		const t = allLines[j].replace(/\r$/, "").trim();
		if (t === "" || t.startsWith("#")) continue;
		// If next line is indented, it's the block form
		const indent = allLines[j].search(/\S/);
		return indent <= 0;
	}
	return true;
}

// ── KV apply helpers ─────────────────────────────────────

function applyKV(target: Record<string, any>, kv: { key: string; value: string }) {
	target[kv.key] = kv.value;
}

function applyDividerKV(divider: DividerBlockConfig, kv: { key: string; value: string }) {
	if (kv.key === "title") divider.title = kv.value;
	if (kv.key === "type") divider.type = kv.value;
}

function applySectionKV(section: SectionConfig, kv: { key: string; value: string }) {
	if (kv.key === "columns" || kv.key === "grid") {
		const n = parseInt(kv.value, 10);
		section.columns = (Number.isFinite(n) && n >= 1 && n <= 4 ? n : 2) as 1 | 2 | 3 | 4;
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
		links.columns = (Number.isFinite(n) && n >= 1 && n <= 4 ? n : 3) as 1 | 2 | 3 | 4;
	}
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
