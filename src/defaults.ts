import type {
	NexusSettings,
	MocEntry,
	StatEntry,
	DividerDesign,
} from "./types";

/** Default Map of Content entries shown on the dashboard when no user config exists. */
export const DEFAULT_MOCS: MocEntry[] = [
	{ path: "MOC/Journal MOC.md", title: "Journal MOC", desc: "Personal reflections & daily logs", icon: "Journal" },
	{ path: "MOC/Knowledge MOC.md", title: "Knowledge MOC", desc: "Learning notes & insights", icon: "Knowledge" },
	{ path: "MOC/Personal MOC.md", title: "Personal MOC", desc: "Goals, habits & self-tracking", icon: "Personal" },
	{ path: "MOC/Projects MOC.md", title: "Projects MOC", desc: "Active work & side quests", icon: "Project" },
	{ path: "MOC/Resources MOC.md", title: "Resources MOC", desc: "Tools, references & bookmarks", icon: "Resources" },
	{ path: "MOC/Tracker Index MOC.md", title: "Tracker Index MOC", desc: "Metrics, streaks & analytics", icon: "Trackers" },
];

/** Default vault folder stat counters displayed in the dashboard header. */
export const DEFAULT_STATS: StatEntry[] = [
	{ folder: "", label: "Files" },
	{ folder: "MOC", label: "MOCs" },
	{ folder: "Project", label: "Projects" },
	{ folder: "Knowledge/Tasks & Action Management", label: "Tasks" },
	{ folder: "Journal", label: "Journals" },
];

/** Default styling for dashboard section dividers (gradient line + label appearance). */
export const DEFAULT_DIVIDER_DESIGN: DividerDesign = {
	gradient: "linear-gradient(90deg, transparent, var(--background-modifier-border), transparent)",
	lineWidth: "1px",
	labelSize: "0.7rem",
	labelWeight: "600",
	labelColor: "var(--text-muted)",
	labelSpacing: "0.12em",
};

/**
 * Complete default configuration for the Nexus dashboard plugin.
 * Each property maps to a user-facing setting; the spread of nested
 * objects ensures callers get independent copies via {@link deepCloneDefaults}.
 */
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
	showTaskSummary: true,
	taskSummaryShowProgress: true,
	taskSummaryShowList: true,
	taskSummaryPath: "Knowledge/Tasks & Action Management",
	taskSummaryTags: "",
	taskSummaryCount: 10,
	taskSummaryLabel: "TASKS",
};

/**
 * Returns a deep copy of {@link DEFAULT_SETTINGS} with all nested arrays and
 * objects cloned so mutations won't affect the original defaults.
 *
 * @returns A fresh {@link NexusSettings} instance safe to mutate.
 * @example
 * ```ts
 * const settings = deepCloneDefaults();
 * settings.mocs.push({ path: "MOC/New.md", title: "New" });
 * // DEFAULT_SETTINGS.mocs is unchanged
 * ```
 */
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

/**
 * Merges partially-loaded data over a deep-cloned default, preserving
 * type safety for arrays, objects, and the csv-to-array migration path
 * for `excludeFolders`.
 *
 * This is the centralised replacement for the 170-line `loadSettings()`
 * manual-block pattern — every new setting field is handled automatically
 * without adding another 3-line typeof-check block.
 *
 * @param data - Raw data from `plugin.loadData()` (may be `null`/`undefined`).
 * @param splitCsv - Optional CSV parser used when `excludeFolders` is still a
 *   comma-separated string (legacy migration path).
 * @returns A fully-populated {@link NexusSettings} safe to mutate.
 */
export function mergeSettings(
	data: Partial<NexusSettings> | null | undefined,
	splitCsv?: (val: string) => string[],
): NexusSettings {
	if (!data) return deepCloneDefaults();

	return {
		...deepCloneDefaults(),
		...data,
		mocs: Array.isArray(data.mocs)
			? data.mocs.map((m) => ({ ...m }))
			: deepCloneDefaults().mocs,
		stats: Array.isArray(data.stats)
			? data.stats.map((s) => ({ ...s }))
			: deepCloneDefaults().stats,
		quickLinks: Array.isArray(data.quickLinks)
			? data.quickLinks.map((l) => ({ ...l }))
			: deepCloneDefaults().quickLinks,
		vaultLists: Array.isArray(data.vaultLists)
			? data.vaultLists.map((v) => ({ ...v }))
			: deepCloneDefaults().vaultLists,
		rowLayouts: Array.isArray(data.rowLayouts)
			? data.rowLayouts.map((r) => ({ ...r, slots: r.slots ? [...r.slots] : [] }))
			: deepCloneDefaults().rowLayouts,
		columnLayouts: Array.isArray(data.columnLayouts)
			? data.columnLayouts.map((s) => ({ ...s, slots: s.slots ? [...s.slots] : [] }))
			: deepCloneDefaults().columnLayouts,
		excludeFolders: _resolveExcludeFolders(data, splitCsv),
		dividerDesign:
			data.dividerDesign && typeof data.dividerDesign === "object"
				? { ...deepCloneDefaults().dividerDesign, ...data.dividerDesign }
				: deepCloneDefaults().dividerDesign,
		rowSizes:
			data.rowSizes && typeof data.rowSizes === "object"
				? { ...data.rowSizes }
				: {},
	};
}

function _resolveExcludeFolders(
	data: Partial<NexusSettings>,
	splitCsv?: (val: string) => string[],
): string[] {
	if (Array.isArray(data.excludeFolders)) return [...data.excludeFolders];
	if (typeof data.excludeFolders === "string" && splitCsv) return splitCsv(data.excludeFolders);
	return [];
}

/** Named divider style presets that users can select from the settings UI. */
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

/** Human-readable display names for each key in {@link DIVIDER_PRESETS}. */
export const DIVIDER_PRESET_NAMES: Record<string, string> = {
	default: "Default",
	bold: "Bold",
	subtle: "Subtle",
	gradient: "Gradient",
	dashed: "Dashed",
};

/**
 * Matches a divider design against all known presets to identify which
 * named preset it corresponds to.
 *
 * @param d - The divider design to match.
 * @returns The preset key (e.g. `"bold"`, `"subtle"`), or `"default"` if no
 *   preset matches.
 * @example
 * ```ts
 * detectDividerPreset(DIVIDER_PRESETS.bold); // "bold"
 * detectDividerPreset({ ...DEFAULT_DIVIDER_DESIGN, lineWidth: "3px" }); // "default"
 * ```
 */
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
