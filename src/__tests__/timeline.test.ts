import { describe, it, expect } from "vitest";
import { buildTimelineEvents, isWithinPath, TimelineSource, TimelineOptions } from "../timeline";

const now = Date.now();

function makeOpts(overrides: Partial<TimelineOptions> = {}): TimelineOptions {
	return {
		onlyMarkdown: false,
		include: [],
		excludeFolders: [],
		excludeExt: [],
		types: [],
		chipMatch: () => true,
		count: 20,
		...overrides,
	};
}

describe("isWithinPath", () => {
	it("matches the prefix itself and nested paths", () => {
		expect(isWithinPath("A/B.md", "A")).toBe(true);
		expect(isWithinPath("A", "A")).toBe(true);
		expect(isWithinPath("AB.md", "A")).toBe(false);
		expect(isWithinPath("A/B.md", "")).toBe(true);
		expect(isWithinPath("A/B.md", "A/")).toBe(true);
	});
});

describe("buildTimelineEvents", () => {
	const baseSource: TimelineSource = {
		log: [],
		files: [],
	};

	it("filters log entries by types whitelist", () => {
		const source: TimelineSource = {
			...baseSource,
			log: [
				{ time: now, action: "created", path: "a.md" },
				{ time: now - 10, action: "deleted", path: "b.md" },
			],
		};
		const result = buildTimelineEvents(source, makeOpts({ types: ["created"] }));
		expect(result.map((e) => e.action)).toEqual(["created"]);
	});

	it("filters by chip predicate", () => {
		const source: TimelineSource = {
			...baseSource,
			log: [
				{ time: now, action: "created", path: "a.md" },
				{ time: now - 10, action: "modified", path: "b.md" },
			],
		};
		const result = buildTimelineEvents(source, makeOpts({ chipMatch: (a) => a === "created" }));
		expect(result.map((e) => e.action)).toEqual(["created"]);
	});

	it("does not backfill when the chip filter excludes modified", () => {
		const source: TimelineSource = {
			...baseSource,
			files: [{ path: "recent.md", extension: "md", mtime: now - 5 }],
		};
		const result = buildTimelineEvents(source, makeOpts({ chipMatch: (a) => a === "created", count: 5 }));
		expect(result).toEqual([]);
	});

	it("does not backfill when types whitelist excludes modified", () => {
		const source: TimelineSource = {
			...baseSource,
			files: [{ path: "recent.md", extension: "md", mtime: now - 5 }],
		};
		const result = buildTimelineEvents(source, makeOpts({ types: ["created"], count: 5 }));
		expect(result).toEqual([]);
	});

	it("backfills to the resolved count with most-recently-modified files", () => {
		const source: TimelineSource = {
			...baseSource,
			log: [{ time: now, action: "created", path: "log.md" }],
			files: [
				{ path: "old.md", extension: "md", mtime: now - 100 },
				{ path: "mid.md", extension: "md", mtime: now - 50 },
				{ path: "new.md", extension: "md", mtime: now - 10 },
			],
		};
		const result = buildTimelineEvents(source, makeOpts({ count: 3 }));
		expect(result.length).toBe(3);
		expect(result.map((e) => e.path)).toEqual(["log.md", "new.md", "mid.md"]);
	});

	it("backfill respects onlyMarkdown, include and exclude filters", () => {
		const source: TimelineSource = {
			...baseSource,
			log: [],
			files: [
				{ path: "A/keep.md", extension: "md", mtime: now - 10 },
				{ path: "A/drop.png", extension: "png", mtime: now - 20 },
				{ path: "A/drop/keep.md", extension: "md", mtime: now - 15 },
				{ path: "B/keep.md", extension: "md", mtime: now - 30 },
			],
		};
		const result = buildTimelineEvents(
			source,
			makeOpts({ count: 5, onlyMarkdown: true, include: ["A"], excludeFolders: ["A/drop"] }),
		);
		expect(result.map((e) => e.path)).toEqual(["A/keep.md"]);
	});

	it("excludes paths already present in the log from backfill", () => {
		const source: TimelineSource = {
			...baseSource,
			log: [{ time: now, action: "created", path: "same.md" }],
			files: [
				{ path: "same.md", extension: "md", mtime: now - 10 },
				{ path: "other.md", extension: "md", mtime: now - 20 },
			],
		};
		const result = buildTimelineEvents(source, makeOpts({ count: 2 }));
		expect(result.map((e) => e.path)).toEqual(["same.md", "other.md"]);
	});

	it("coalesces consecutive same-path same-action edits within the window", () => {
		const source: TimelineSource = {
			...baseSource,
			log: [
				{ time: now, action: "modified", path: "a.md" },
				{ time: now - 10_000, action: "modified", path: "a.md" },
				{ time: now - 20_000, action: "created", path: "a.md" },
			],
		};
		const result = buildTimelineEvents(source, makeOpts());
		expect(result.length).toBe(2);
		expect(result.map((e) => e.action)).toEqual(["modified", "created"]);
		expect(result[0].time).toBe(now);
	});

	it("keeps separate edits that are outside the coalescing window", () => {
		const source: TimelineSource = {
			...baseSource,
			log: [
				{ time: now, action: "modified", path: "a.md" },
				{ time: now - 120_000, action: "modified", path: "a.md" },
			],
		};
		const result = buildTimelineEvents(source, makeOpts());
		expect(result.length).toBe(2);
	});

	it("coalescing can be disabled", () => {
		const source: TimelineSource = {
			...baseSource,
			log: [
				{ time: now, action: "modified", path: "a.md" },
				{ time: now - 10_000, action: "modified", path: "a.md" },
			],
		};
		const result = buildTimelineEvents(source, makeOpts({ coalesceMs: 0 }));
		expect(result.length).toBe(2);
	});

	it("returns newest first", () => {
		const source: TimelineSource = {
			...baseSource,
			log: [
				{ time: now - 30, action: "modified", path: "a.md" },
				{ time: now, action: "modified", path: "b.md" },
				{ time: now - 10, action: "modified", path: "c.md" },
			],
		};
		const result = buildTimelineEvents(source, makeOpts());
		expect(result.map((e) => e.path)).toEqual(["b.md", "c.md", "a.md"]);
	});
});
