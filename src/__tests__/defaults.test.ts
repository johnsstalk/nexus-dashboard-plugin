import { describe, it, expect } from "vitest";
import {
	DEFAULT_SETTINGS,
	DEFAULT_MOCS,
	DEFAULT_STATS,
	DEFAULT_NEW_NOTE,
	DEFAULT_DIVIDER_DESIGN,
	DIVIDER_PRESETS,
	DIVIDER_PRESET_NAMES,
	detectDividerPreset,
	deepCloneDefaults,
	mergeSettings,
} from "../defaults";
import type { DividerDesign, NexusSettings } from "../types";

describe("DEFAULT_SETTINGS", () => {
	it("is a valid NexusSettings object", () => {
		expect(DEFAULT_SETTINGS).toBeDefined();
		expect(typeof DEFAULT_SETTINGS.headerText).toBe("string");
		expect(typeof DEFAULT_SETTINGS.openOnStartup).toBe("boolean");
		expect(Array.isArray(DEFAULT_SETTINGS.mocs)).toBe(true);
		expect(Array.isArray(DEFAULT_SETTINGS.stats)).toBe(true);
		expect(typeof DEFAULT_SETTINGS.showStats).toBe("boolean");
		expect(typeof DEFAULT_SETTINGS.showGraph).toBe("boolean");
		expect(typeof DEFAULT_SETTINGS.mocGridColumns).toBe("number");
		expect("miniGridColumns" in DEFAULT_SETTINGS).toBe(false);
	});
});

describe("per-component divider flags", () => {
	it("defaults new labelled components to shown dividers", () => {
		expect(DEFAULT_SETTINGS.showVaultActivityDivider).toBe(true);
		expect(DEFAULT_SETTINGS.showHeatmapDivider).toBe(true);
		expect(DEFAULT_SETTINGS.showActivityTimelineDivider).toBe(true);
		expect(DEFAULT_SETTINGS.showFileTypeChartDivider).toBe(true);
		expect(DEFAULT_SETTINGS.showTaskSummaryDivider).toBe(true);
	});

	it("defaults the legacy MOC divider to hidden", () => {
		expect(DEFAULT_SETTINGS.showMocDivider).toBe(false);
	});

	it("removed the obsolete quick-links divider flag", () => {
		expect("showQuickLinksDivider" in DEFAULT_SETTINGS).toBe(false);
		expect("quickLinksDividerLabel" in DEFAULT_SETTINGS).toBe(false);
	});

	it("defaults the clock divider to hidden", () => {
		expect(DEFAULT_SETTINGS.showClockDivider).toBe(false);
	});

	it("survives deepCloneDefaults and mergeSettings", () => {
		expect(deepCloneDefaults().showVaultActivityDivider).toBe(true);
		expect(mergeSettings(null).showClockDivider).toBe(false);
	});
});

describe("DEFAULT_MOCS", () => {
	it("has 6 default MOCs", () => {
		expect(DEFAULT_MOCS).toHaveLength(6);
	});

	it("each MOC has required fields", () => {
		for (const moc of DEFAULT_MOCS) {
			expect(typeof moc.path).toBe("string");
			expect(typeof moc.title).toBe("string");
			expect(typeof moc.desc).toBe("string");
			expect(typeof moc.icon).toBe("string");
			expect(moc.path).toBeTruthy();
			expect(moc.title).toBeTruthy();
		}
	});
});

describe("DEFAULT_STATS", () => {
	it("has 5 default stats", () => {
		expect(DEFAULT_STATS).toHaveLength(5);
	});

	it("each stat has required fields", () => {
		for (const stat of DEFAULT_STATS) {
			expect(typeof stat.folder).toBe("string");
			expect(typeof stat.label).toBe("string");
			expect(stat.label).toBeTruthy();
		}
	});
});

describe("DEFAULT_NEW_NOTE", () => {
	it("is disabled by default", () => {
		expect(DEFAULT_NEW_NOTE.enabled).toBe(false);
		expect(DEFAULT_NEW_NOTE.label).toBe("+ New Note");
	});
});

describe("mergeSettings statsNewNote", () => {
	it("fills defaults when missing", () => {
		const result = mergeSettings({});
		expect(result.statsNewNote).toEqual(DEFAULT_NEW_NOTE);
	});

	it("merges partial overrides", () => {
		const result = mergeSettings({
			statsNewNote: { enabled: true, folder: "Inbox" },
		} as Partial<NexusSettings>);
		expect(result.statsNewNote.enabled).toBe(true);
		expect(result.statsNewNote.folder).toBe("Inbox");
		expect(result.statsNewNote.label).toBe("+ New Note");
		expect(result.statsNewNote.template).toBe("");
	});
});

describe("DIVIDER_PRESETS", () => {
	it("has 5 presets", () => {
		expect(Object.keys(DIVIDER_PRESETS)).toHaveLength(5);
	});

	it("each preset has all required fields", () => {
		for (const [, preset] of Object.entries(DIVIDER_PRESETS)) {
			expect(typeof preset.gradient).toBe("string");
			expect(typeof preset.lineWidth).toBe("string");
			expect(typeof preset.labelSize).toBe("string");
			expect(typeof preset.labelWeight).toBe("string");
			expect(typeof preset.labelColor).toBe("string");
			expect(typeof preset.labelSpacing).toBe("string");
		}
	});
});

describe("DIVIDER_PRESET_NAMES", () => {
	it("has matching keys with DIVIDER_PRESETS", () => {
		const presetKeys = Object.keys(DIVIDER_PRESETS).sort();
		const nameKeys = Object.keys(DIVIDER_PRESET_NAMES).sort();
		expect(presetKeys).toEqual(nameKeys);
	});
});

describe("detectDividerPreset", () => {
	it("detects default preset", () => {
		expect(detectDividerPreset(DEFAULT_DIVIDER_DESIGN)).toBe("default");
	});

	it("detects bold preset", () => {
		expect(detectDividerPreset(DIVIDER_PRESETS.bold)).toBe("bold");
	});

	it("returns custom for unknown design", () => {
		const custom: DividerDesign = {
			gradient: "custom",
			lineWidth: "1px",
			labelSize: "1rem",
			labelWeight: "400",
			labelColor: "red",
			labelSpacing: "0",
		};
		expect(detectDividerPreset(custom)).toBe("custom");
	});
});

describe("deepCloneDefaults", () => {
	it("returns a deep clone of defaults", () => {
		const clone = deepCloneDefaults();
		expect(clone).toEqual(DEFAULT_SETTINGS);
		expect(clone).not.toBe(DEFAULT_SETTINGS);
		expect(clone.mocs).not.toBe(DEFAULT_SETTINGS.mocs);
		expect(clone.stats).not.toBe(DEFAULT_SETTINGS.stats);
		expect(clone.dividerDesign).not.toBe(DEFAULT_SETTINGS.dividerDesign);
	});

	it("mutating clone does not affect defaults", () => {
		const clone = deepCloneDefaults();
		clone.headerText = "MODIFIED";
		clone.mocs.push({ path: "test", title: "test", desc: "test", icon: "test" });
		expect(DEFAULT_SETTINGS.headerText).toBe("NEXUS");
		expect(DEFAULT_SETTINGS.mocs).toHaveLength(6);
	});
});

describe("mergeSettings", () => {
	it("returns deep-cloned defaults when data is null", () => {
		const result = mergeSettings(null);
		expect(result.headerText).toBe("NEXUS");
		expect(result).not.toBe(DEFAULT_SETTINGS);
		expect(result.mocs).not.toBe(DEFAULT_SETTINGS.mocs);
	});

	it("returns deep-cloned defaults when data is undefined", () => {
		const result = mergeSettings(undefined);
		expect(result.headerText).toBe("NEXUS");
	});

	it("overlays scalar fields from partial data", () => {
		const result = mergeSettings({ headerText: "CUSTOM", showStats: false });
		expect(result.headerText).toBe("CUSTOM");
		expect(result.showStats).toBe(false);
		expect(result.openOnStartup).toBe(false); // from defaults
	});

	it("deep-clones array fields from partial data", () => {
		const result = mergeSettings({ mocs: [{ path: "a", title: "A", desc: "desc", icon: "!" }] });
		expect(result.mocs).toHaveLength(1);
		expect(result.mocs[0].path).toBe("a");
	});

	it("deep-clones dividerDesign", () => {
		const result = mergeSettings({ dividerDesign: { gradient: "custom" } as DividerDesign });
		expect(result.dividerDesign.gradient).toBe("custom");
		expect(result.dividerDesign.lineWidth).toBe(DEFAULT_SETTINGS.dividerDesign.lineWidth);
	});

	it("preserves task summary fields", () => {
		const result = mergeSettings({
			showTaskSummary: false,
			taskSummaryPath: "Custom/Path",
			taskSummaryCount: 5,
		});
		expect(result.showTaskSummary).toBe(false);
		expect(result.taskSummaryPath).toBe("Custom/Path");
		expect(result.taskSummaryCount).toBe(5);
		expect(result.taskSummaryShowProgress).toBe(true);
	});

	it("preserves vault activity fields", () => {
		const result = mergeSettings({ vaultActivityLabel: "CUSTOM LABEL" });
		expect(result.vaultActivityLabel).toBe("CUSTOM LABEL");
		expect(result.vaultActivityCount).toBe(15);
		expect(result.vaultActivityShowFade).toBe(true);
		expect(result.vaultActivityMaxHeight).toBe(320);
		expect(result.activityTimelineShowFade).toBe(true);
		expect(result.activityTimelineMaxHeight).toBe(320);
		expect(result.taskSummaryShowFade).toBe(true);
		expect(result.taskSummaryMaxHeight).toBe(320);
	});

	it("provides activity tracking and timeline defaults", () => {
		const result = mergeSettings(null);
		expect(result.activityTrackingEnabled).toBe(true);
		expect(result.activityTaskTracking).toBe(true);
		expect(result.activityLogMax).toBe(500);
		expect(result.activityLog).toEqual([]);
		expect(result.activityTimelineOnlyMarkdown).toBe(true);
		expect(result.activityTimelineIncludeFolders).toBe("");
		expect(result.activityTimelineShowRelative).toBe(false);
		expect(result.activityTimelineGroup).toBe("day");
		expect(result.activityTimelineShowDate).toBe(true);
		expect(result.activityTimelineShowChips).toBe(false);
		expect(result.activityTimelineShowMore).toBe(true);
	});

	it("clones the activity log when merging", () => {
		const result = mergeSettings({
			activityLog: [{ time: 1, action: "created", path: "A.md" }],
		});
		expect(result.activityLog).toHaveLength(1);
		expect(result.activityLog[0].path).toBe("A.md");
		result.activityLog.pop();
		expect(result.activityLog).toHaveLength(0);
	});

	it("mutating result does not affect defaults", () => {
		const result = mergeSettings({ headerText: "X" });
		result.headerText = "Y";
		result.mocs.push({ path: "t", title: "t", desc: "t", icon: "t" });
		expect(DEFAULT_SETTINGS.headerText).toBe("NEXUS");
		expect(DEFAULT_SETTINGS.mocs).toHaveLength(6);
	});
});
