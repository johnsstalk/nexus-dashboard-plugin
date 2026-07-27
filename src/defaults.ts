import type {
	NexusSettings,
	MocEntry,
	StatEntry,
	DividerDesign,
} from "./types";

export const DEFAULT_MOCS: MocEntry[] = [
	{ path: "MOC/Journal MOC.md", title: "Journal MOC", desc: "Personal reflections & daily logs", icon: "Journal" },
	{ path: "MOC/Knowledge MOC.md", title: "Knowledge MOC", desc: "Learning notes & insights", icon: "Knowledge" },
	{ path: "MOC/Personal MOC.md", title: "Personal MOC", desc: "Goals, habits & self-tracking", icon: "Personal" },
	{ path: "MOC/Projects MOC.md", title: "Projects MOC", desc: "Active work & side quests", icon: "Project" },
	{ path: "MOC/Resources MOC.md", title: "Resources MOC", desc: "Tools, references & bookmarks", icon: "Resources" },
	{ path: "MOC/Tracker Index MOC.md", title: "Tracker Index MOC", desc: "Metrics, streaks & analytics", icon: "Trackers" },
];

export const DEFAULT_STATS: StatEntry[] = [
	{ folder: "", label: "Files" },
	{ folder: "MOC", label: "MOCs" },
	{ folder: "Project", label: "Projects" },
	{ folder: "Knowledge/Tasks & Action Management", label: "Tasks" },
	{ folder: "Journal", label: "Journals" },
];

export const DEFAULT_DIVIDER_DESIGN: DividerDesign = {
	gradient: "linear-gradient(90deg, transparent, var(--background-modifier-border), transparent)",
	lineWidth: "1px",
	labelSize: "0.7rem",
	labelWeight: "600",
	labelColor: "var(--text-muted)",
	labelSpacing: "0.12em",
};

export const DEFAULT_SETTINGS: NexusSettings = {
	headerText: "NEXUS",
	openOnStartup: false,
	mocs: DEFAULT_MOCS,
	stats: DEFAULT_STATS,
	showStats: true,
	showGraph: false,
	excludeFolders: [],
	mocGridColumns: 2,
	miniGridColumns: 3,
	dividerDesign: { ...DEFAULT_DIVIDER_DESIGN },
	asciiDefaultFont: "ANSI Shadow",
	asciiDefaultColor: "#8A5CF6",
	asciiDefaultSize: 1.0,
	asciiMobileSize: 0.5,
	asciiDefaultAlign: "center",
	showSearch: false,
	searchDefault: "vault",
	quickLinks: [],
	vaultLists: [],
	rowSizes: {},
	rowLayouts: [],
	columnLayouts: [],
	showQuickLinksDivider: false,
	quickLinksDividerLabel: "Quick Links",
	showHeader: true,
	showMocCards: true,
	showMocDivider: false,
	mocDividerLabel: "MOC CARDS",
	showQuickLinks: false,
	showHeatmap: true,
	heatmapWeeks: 10,
	heatmapLabel: "CONTRIBUTION ACTIVITY",
	showActivityTimeline: false,
	activityTimelineCount: 20,
	activityTimelineLabel: "ACTIVITY",
	showClock: false,
	clockTimezone: "",
	clockShowDate: true,
	clockShowSeconds: false,
	clockFormat: "12h",
	clockLabel: "",
	showFileTypeChart: false,
	fileTypeChartMax: 8,
	fileTypeChartLabel: "FILE TYPES",
	showVaultActivity: true,
	vaultActivityCount: 9,
	vaultActivityPath: "",
	vaultActivityTags: "",
	vaultActivityLabel: "VAULT ACTIVITY",
};

export function deepCloneDefaults(): NexusSettings {
	return {
		...DEFAULT_SETTINGS,
		mocs: DEFAULT_MOCS.map((m) => ({ ...m })),
		stats: DEFAULT_STATS.map((s) => ({ ...s })),
		dividerDesign: { ...DEFAULT_SETTINGS.dividerDesign },
		quickLinks: DEFAULT_SETTINGS.quickLinks.map((l) => ({ ...l })),
		vaultLists: DEFAULT_SETTINGS.vaultLists.map((v) => ({ ...v })),
		rowSizes: { ...DEFAULT_SETTINGS.rowSizes },
		rowLayouts: DEFAULT_SETTINGS.rowLayouts.map((r) => ({ ...r, slots: [...r.slots] })),
		columnLayouts: DEFAULT_SETTINGS.columnLayouts.map((s) => ({ ...s, slots: [...s.slots] })),
	};
}

export const DIVIDER_PRESETS: Record<string, DividerDesign> = {
	default: { ...DEFAULT_DIVIDER_DESIGN },
	bold: {
		gradient: "linear-gradient(90deg, transparent, var(--interactive-accent), transparent)",
		lineWidth: "2px",
		labelSize: "0.8rem",
		labelWeight: "700",
		labelColor: "var(--interactive-accent)",
		labelSpacing: "0.16em",
	},
	subtle: {
		gradient: "linear-gradient(90deg, transparent, rgba(255,255,255,0.06), transparent)",
		lineWidth: "1px",
		labelSize: "0.65rem",
		labelWeight: "500",
		labelColor: "var(--text-faint)",
		labelSpacing: "0.08em",
	},
	gradient: {
		gradient: "linear-gradient(90deg, var(--interactive-accent), var(--background-modifier-border), var(--interactive-accent))",
		lineWidth: "1px",
		labelSize: "0.7rem",
		labelWeight: "600",
		labelColor: "var(--text-muted)",
		labelSpacing: "0.12em",
	},
	dashed: {
		gradient: "repeating-linear-gradient(90deg, var(--background-modifier-border), var(--background-modifier-border) 4px, transparent 4px, transparent 8px)",
		lineWidth: "1px",
		labelSize: "0.7rem",
		labelWeight: "600",
		labelColor: "var(--text-muted)",
		labelSpacing: "0.12em",
	},
};

export const DIVIDER_PRESET_NAMES: Record<string, string> = {
	default: "Default",
	bold: "Bold",
	subtle: "Subtle",
	gradient: "Gradient",
	dashed: "Dashed",
};

export function detectDividerPreset(d: DividerDesign): string {
	for (const [key, preset] of Object.entries(DIVIDER_PRESETS)) {
		if (
			d.gradient === preset.gradient &&
			d.lineWidth === preset.lineWidth &&
			d.labelSize === preset.labelSize &&
			d.labelWeight === preset.labelWeight &&
			d.labelColor === preset.labelColor &&
			d.labelSpacing === preset.labelSpacing
		) {
			return key;
		}
	}
	return "default";
}
