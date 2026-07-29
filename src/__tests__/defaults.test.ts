import { describe, it, expect } from "vitest";
import {
	DEFAULT_SETTINGS,
	DEFAULT_MOCS,
	DEFAULT_STATS,
	DEFAULT_DIVIDER_DESIGN,
	DIVIDER_PRESETS,
	DIVIDER_PRESET_NAMES,
	detectDividerPreset,
	deepCloneDefaults,
	mergeSettings,
} from "../defaults";
import type { DividerDesign } from "../types";

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
		expect(typeof DEFAULT_SETTINGS.miniGridColumns).toBe("number");
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

	it("returns default for unknown design", () => {
		const custom: DividerDesign = {
			gradient: "custom",
			lineWidth: "1px",
			labelSize: "1rem",
			labelWeight: "400",
			labelColor: "red",
			labelSpacing: "0",
		};
		expect(detectDividerPreset(custom)).toBe("default");
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
	const splitCsv = (val: string) => val.split(",").map((s) => s.trim());

	it("returns deep-cloned defaults when data is null", () => {
		const result = mergeSettings(null, splitCsv);
		expect(result.headerText).toBe("NEXUS");
		expect(result).not.toBe(DEFAULT_SETTINGS);
		expect(result.mocs).not.toBe(DEFAULT_SETTINGS.mocs);
	});

	it("returns deep-cloned defaults when data is undefined", () => {
		const result = mergeSettings(undefined, splitCsv);
		expect(result.headerText).toBe("NEXUS");
	});

	it("overlays scalar fields from partial data", () => {
		const result = mergeSettings({ headerText: "CUSTOM", showStats: false }, splitCsv);
		expect(result.headerText).toBe("CUSTOM");
		expect(result.showStats).toBe(false);
		expect(result.openOnStartup).toBe(false); // from defaults
	});

	it("deep-clones array fields from partial data", () => {
		const result = mergeSettings({ mocs: [{ path: "a", title: "A", desc: "desc", icon: "!" }] }, splitCsv);
		expect(result.mocs).toHaveLength(1);
		expect(result.mocs[0].path).toBe("a");
	});

	it("deep-clones dividerDesign", () => {
		const result = mergeSettings({ dividerDesign: { gradient: "custom" } }, splitCsv);
		expect(result.dividerDesign.gradient).toBe("custom");
		expect(result.dividerDesign.lineWidth).toBe(DEFAULT_SETTINGS.dividerDesign.lineWidth);
	});

	it("handles excludeFolders as array", () => {
		const result = mergeSettings({ excludeFolders: ["a", "b"] }, splitCsv);
		expect(result.excludeFolders).toEqual(["a", "b"]);
	});

	it("handles excludeFolders as CSV string", () => {
		const result = mergeSettings({ excludeFolders: "a, b, c" }, splitCsv);
		expect(result.excludeFolders).toEqual(["a", "b", "c"]);
	});

	it("handles excludeFolders missing", () => {
		const result = mergeSettings({}, splitCsv);
		expect(result.excludeFolders).toEqual([]);
	});

	it("preserves task summary fields", () => {
		const result = mergeSettings({
			showTaskSummary: false,
			taskSummaryPath: "Custom/Path",
			taskSummaryCount: 5,
		}, splitCsv);
		expect(result.showTaskSummary).toBe(false);
		expect(result.taskSummaryPath).toBe("Custom/Path");
		expect(result.taskSummaryCount).toBe(5);
		expect(result.taskSummaryShowProgress).toBe(true);
	});

	it("preserves vault activity fields", () => {
		const result = mergeSettings({ vaultActivityLabel: "CUSTOM LABEL" }, splitCsv);
		expect(result.vaultActivityLabel).toBe("CUSTOM LABEL");
		expect(result.vaultActivityCount).toBe(9);
	});

	it("mutating result does not affect defaults", () => {
		const result = mergeSettings({ headerText: "X" }, splitCsv);
		result.headerText = "Y";
		result.mocs.push({ path: "t", title: "t", desc: "t", icon: "t" });
		expect(DEFAULT_SETTINGS.headerText).toBe("NEXUS");
		expect(DEFAULT_SETTINGS.mocs).toHaveLength(6);
	});
});
