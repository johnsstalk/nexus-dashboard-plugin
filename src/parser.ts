import {
	DashboardConfig,
	SectionConfig,
	CardConfig,
} from "./types";

export function parseDashboard(raw: string): DashboardConfig {
	const trimmed = raw.trim();
	if (!trimmed) {
		return buildDefaultConfig();
	}

	const config: DashboardConfig = {
		header: { text: "", font: "ANSI Shadow", color: "#8A5CF6", size: "normal", enabled: false },
		stats: { enabled: false, items: [] },
		sections: [],
		recently: false,
		graph: { enabled: false, exclude: [] },
	};

	const lines = trimmed.split("\n");
	let context: "root" | "header" | "stats" | "section" | "cards" | "graph" = "root";
	let currentSection: SectionConfig | null = null;
	let currentCard: Partial<CardConfig> | null = null;

	for (const rawLine of lines) {
		const line = rawLine.replace(/\r$/, "");
		const t = line.trim();
		if (!t || t.startsWith("#")) continue;

		// ── Context switches ──────────────────────────────
		if (t === "header:") {
			flushCard();
			context = "header";
			continue;
		}
		if (t.startsWith("stats:") && t.length > 6) {
			flushCard();
			const val = t.slice(6).trim();
			config.stats.enabled = val === "true";
			context = "stats";
			continue;
		}
		if (t === "stats:") {
			flushCard();
			context = "stats";
			continue;
		}
		if (t === "graph:") {
			flushCard();
			context = "graph";
			continue;
		}
		if (t === "section:") {
			flushSection();
			context = "section";
			currentSection = { title: "", divider: false, columns: 2, cards: [] };
			continue;
		}
		if (t === "cards:") {
			context = "cards";
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
			config.recently = kv.value === "true";
			continue;
		}
		if (kv.key === "toolbar") {
			config.toolbar = kv.value === "true";
			continue;
		}
		if (kv.key === "greeting") {
			config.greeting = kv.value === "true";
			continue;
		}

		switch (context) {
			case "root":
				applyRootKV(config, kv);
				break;
			case "header":
				if (!config.header.enabled) {
					config.header = { text: "", font: "ANSI Shadow", color: "#8A5CF6", size: "normal", enabled: true };
				}
				applyKV(config.header, kv);
				break;
			case "stats":
				if (kv.key === "show") {
					config.stats.enabled = kv.value === "true";
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
			} else {
				applyKV(config.graph, kv);
			}
			break;
		}
	}

	// Flush trailing card and section
	flushCard();
	flushSection();

	return config;

	function flushCard() {
		if (currentSection && currentCard) {
			currentSection.cards.push(currentCard as CardConfig);
			currentCard = null;
		}
	}

	function flushSection() {
		flushCard();
		if (currentSection) {
			config.sections.push(currentSection);
			currentSection = null;
		}
	}
}

function applyRootKV(config: DashboardConfig, kv: { key: string; value: string }) {
	if (kv.key === "recently") {
		config.recently = kv.value === "true";
	}
}

function applyKV(target: Record<string, any>, kv: { key: string; value: string }) {
	target[kv.key] = kv.value;
}

function applySectionKV(section: SectionConfig, kv: { key: string; value: string }) {
	if (kv.key === "title") section.title = kv.value;
	if (kv.key === "divider") section.divider = kv.value === "true";
	if (kv.key === "columns") section.columns = parseInt(kv.value, 10) as 2 | 3 | 4;
}

function applyCardKV(card: Partial<CardConfig>, kv: { key: string; value: string }) {
	if (kv.key === "label") card.label = kv.value;
	if (kv.key === "desc") card.desc = kv.value;
	if (kv.key === "path") card.path = kv.value;
	if (kv.key === "icon") card.icon = kv.value;
	if (kv.key === "color") card.color = kv.value;
	if (kv.key === "type") card.type = kv.value === "mini" ? "mini" : "big";
}

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
		header: { text: "", font: "ANSI Shadow", color: "#8A5CF6", size: "normal", enabled: false },
		toolbar: false,
		greeting: false,
		stats: { enabled: false, items: [] },
		sections: [],
		recently: false,
		graph: { enabled: false, exclude: [] },
	};
}
