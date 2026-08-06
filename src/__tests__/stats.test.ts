import { describe, it, expect } from "vitest";
import {
	collectFileTags,
	computeStatValue,
	dateStamp,
	formatSize,
	isInWindow,
	matchesFolder,
	normalizeStatItem,
	normalizeTag,
	statSummary,
	windowStart,
	type StatFile,
} from "../stats";

// Mon 2026-06-15 12:00 (local) — 2026-06-15 is a Monday.
const now = new Date(2026, 5, 15, 12, 0, 0).getTime();
const yesterday = new Date(2026, 5, 14, 23, 0, 0).getTime(); // Sunday
const lastMonth = new Date(2026, 4, 31, 23, 0, 0).getTime(); // May 31
const lastYear = new Date(2025, 11, 31, 23, 0, 0).getTime(); // Dec 31 2025

const files: StatFile[] = [
	{ path: "Journal/2026-06-15.md", extension: "md", size: 100, mtime: now },
	{ path: "Journal/Notes/sub.md", extension: "md", size: 200, mtime: now },
	{ path: "Journal/notes.txt", extension: "txt", size: 300, mtime: now },
	{ path: "Inbox/old.md", extension: "md", size: 50, mtime: yesterday },
	{ path: "MOC.md", extension: "md", size: 400, mtime: now },
];

const tagsOf: Record<string, string[]> = {
	"Journal/2026-06-15.md": ["#journal"],
	"Journal/Notes/sub.md": ["#journal", "#deep"],
	"Journal/notes.txt": [],
	"Inbox/old.md": ["#inbox"],
	"MOC.md": ["#moc"],
};

const tags = (path: string): string[] => tagsOf[path] ?? [];

describe("normalizeStatItem", () => {
	it("applies defaults for missing fields", () => {
		expect(normalizeStatItem({})).toEqual({ metric: "files", scope: "all", recursive: true });
	});

	it("keeps valid values", () => {
		expect(normalizeStatItem({ metric: "size", scope: "month", recursive: false })).toEqual({
			metric: "size",
			scope: "month",
			recursive: false,
		});
	});

	it("falls back for invalid metric/scope", () => {
		expect(normalizeStatItem({ metric: "bogus" as never, scope: "forever" as never })).toEqual({
			metric: "files",
			scope: "all",
			recursive: true,
		});
	});
});

describe("windowStart / isInWindow", () => {
	it("all window always matches", () => {
		expect(windowStart("all", now)).toBe(0);
		expect(isInWindow(0, "all", now)).toBe(true);
	});

	it("today window starts at midnight", () => {
		expect(isInWindow(now, "today", now)).toBe(true);
		expect(isInWindow(yesterday, "today", now)).toBe(false);
	});

	it("week window starts on Monday", () => {
		expect(isInWindow(now, "week", now)).toBe(true);
		expect(isInWindow(yesterday, "week", now)).toBe(false); // Sunday before Monday
	});

	it("month window starts on the 1st", () => {
		expect(isInWindow(now, "month", now)).toBe(true);
		expect(isInWindow(lastMonth, "month", now)).toBe(false);
	});

	it("year window starts on Jan 1st", () => {
		expect(isInWindow(now, "year", now)).toBe(true);
		expect(isInWindow(lastYear, "year", now)).toBe(false);
	});
});

describe("matchesFolder", () => {
	it("matches everything for empty folder", () => {
		expect(matchesFolder("MOC.md", "", true)).toBe(true);
		expect(matchesFolder("MOC.md", "", false)).toBe(true);
	});

	it("matches subfolders recursively by default", () => {
		expect(matchesFolder("Journal/Notes/sub.md", "Journal", true)).toBe(true);
	});

	it("excludes subfolders when not recursive", () => {
		expect(matchesFolder("Journal/2026-06-15.md", "Journal", false)).toBe(true);
		expect(matchesFolder("Journal/Notes/sub.md", "Journal", false)).toBe(false);
	});

	it("is case-insensitive", () => {
		expect(matchesFolder("journal/2026-06-15.md", "Journal", true)).toBe(true);
	});
});

describe("formatSize", () => {
	it("formats sizes", () => {
		expect(formatSize(0)).toBe("0 B");
		expect(formatSize(512)).toBe("512 B");
		expect(formatSize(1024)).toBe("1.0 KB");
		expect(formatSize(1536)).toBe("1.5 KB");
		expect(formatSize(1048576)).toBe("1.0 MB");
	});
});

describe("computeStatValue", () => {
	it("counts files", () => {
		expect(computeStatValue(files, { label: "", folder: "Journal" }, now, tags)).toBe("3");
		expect(
			computeStatValue(files, { label: "", folder: "Journal", recursive: false }, now, tags),
		).toBe("2");
		expect(computeStatValue(files, { label: "", folder: "" }, now, tags)).toBe("5");
	});

	it("counts only markdown notes", () => {
		expect(
			computeStatValue(files, { label: "", folder: "Journal", metric: "notes" }, now, tags),
		).toBe("2");
	});

	it("sums file sizes", () => {
		expect(computeStatValue(files, { label: "", folder: "Journal", metric: "size" }, now, tags)).toBe(
			"600 B",
		);
	});

	it("counts unique tags", () => {
		expect(computeStatValue(files, { label: "", folder: "Journal", metric: "tags" }, now, tags)).toBe(
			"2",
		);
	});

	it("applies time windows", () => {
		expect(computeStatValue(files, { label: "", folder: "", scope: "today" }, now, tags)).toBe("4");
		expect(computeStatValue(files, { label: "", folder: "", scope: "week" }, now, tags)).toBe("4");
		expect(computeStatValue(files, { label: "", folder: "", scope: "year" }, now, tags)).toBe("5");
	});
});

describe("normalizeTag", () => {
	it("strips leading hashes, trims and lowercases", () => {
		expect(normalizeTag("#Journal")).toBe("journal");
		expect(normalizeTag("  ##Deep/Nested ")).toBe("deep/nested");
		expect(normalizeTag("inbox")).toBe("inbox");
	});
});

describe("collectFileTags", () => {
	it("returns [] when there is no cache", () => {
		expect(collectFileTags(null)).toEqual([]);
		expect(collectFileTags(undefined)).toEqual([]);
	});

	it("collects inline body tags", () => {
		expect(collectFileTags({ tags: [{ tag: "#journal" }, { tag: "#deep" }] })).toEqual([
			"journal",
			"deep",
		]);
	});

	it("collects frontmatter tags (array and singular)", () => {
		expect(collectFileTags({ frontmatter: { tags: ["Project", " active "] } })).toEqual([
			"project",
			"active",
		]);
		expect(collectFileTags({ frontmatter: { tag: "#Work" } })).toEqual(["work"]);
	});

	it("dedupes inline and frontmatter tags", () => {
		expect(
			collectFileTags({ tags: [{ tag: "#journal" }], frontmatter: { tags: ["Journal"] } }),
		).toEqual(["journal"]);
	});
});

describe("statSummary", () => {
	it("describes a default stat", () => {
		expect(statSummary({ label: "Files", folder: "Journal" })).toBe(
			"Counts files in Journal · all time · includes subfolders",
		);
	});

	it("describes metrics, scopes and recursion", () => {
		expect(
			statSummary({ label: "", folder: "", metric: "size", scope: "month", recursive: false }),
		).toBe("Counts size in whole vault · this month · direct children only");
	});
});

describe("dateStamp", () => {
	it("formats YYYY-MM-DD", () => {
		expect(dateStamp(new Date(2026, 5, 15))).toBe("2026-06-15");
		expect(dateStamp(new Date(2026, 0, 5))).toBe("2026-01-05");
	});
});
