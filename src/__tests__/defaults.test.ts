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
} from "../defaults";
import type { NexusSettings, DividerDesign } from "../types";

describe("DEFAULT_SETTINGS", () => {
	it("is a valid NexusSettings object", () => {
		expect(DEFAULT_SETTINGS).toBeDefined();
		expect(typeof DEFAULT_SETTINGS.headerText).toBe("string");
		expect(typeof DEFAULT_SETTINGS.openOnStartup).toBe("boolean");
		expect(Array.isArray(DEFAULT_SETTINGS.mocs)).toBe(true);
		expect(Array.isArray(DEFAULT_SETTINGS.stats)).toBe(true);
		expect(typeof DEFAULT_SETTINGS.showStats).toBe("boolean");
		expect(typeof DEFAULT_SETTINGS.showRecently).toBe("boolean");
		expect(typeof DEFAULT_SETTINGS.showGraph).toBe("boolean");
		expect(typeof DEFAULT_SETTINGS.recentCount).toBe("number");
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
		for (const [key, preset] of Object.entries(DIVIDER_PRESETS)) {
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
