import { describe, it, expect } from "vitest";
import { buildDefaultConfig, parseDashboard } from "../parser";

describe("buildDefaultConfig", () => {
	it("returns a valid default config", () => {
		const config = buildDefaultConfig();
		expect(config.header).toBeDefined();
		expect(config.header.enabled).toBe(false);
		expect(config.stats).toBeDefined();
		expect(config.stats.enabled).toBe(false);
		expect(config.blocks).toHaveLength(2);
		expect(config.blocks[0].kind).toBe("row");
		expect(config.blocks[1].kind).toBe("row");
		expect(config.graph).toBeDefined();
	});
});

describe("parseDashboard", () => {
	it("returns default config for empty input", () => {
		const config = parseDashboard("");
		expect(config.header.enabled).toBe(false);
		expect(config.blocks).toHaveLength(2);
		expect(config.blocks[0].kind).toBe("row");
	});

	it("parses header config", () => {
		const config = parseDashboard(`
header:
  text: HELLO
  color: "#ff0000"
  size: 2
  align: center
`);
		expect(config.header.enabled).toBe(true);
		expect(config.header.text).toBe("HELLO");
		expect(config.header.color).toBe("#ff0000");
		expect(config.header.size).toBe(2);
		expect(config.header.align).toBe("center");
	});

	it("parses header with shorthand size", () => {
		const config = parseDashboard(`
header:
  text: SMALL
  size: small
`);
		expect(config.header.size).toBe(0.6);
	});

	it("parses section with cards", () => {
		const config = parseDashboard(`
section:
  columns: 3
  cards:
    - type: big
      label: Test
      path: Test.md
      icon: MOC
`);
		expect(config.blocks).toHaveLength(1);
		const section = config.blocks[0];
		expect(section.kind).toBe("section");
		if (section.kind === "section") {
			expect(section.columns).toBe(3);
			expect(section.cards).toHaveLength(1);
			expect(section.cards[0].label).toBe("Test");
			expect(section.cards[0].path).toBe("Test.md");
		}
	});

	it("parses divider", () => {
		const config = parseDashboard(`
divider:
  title: My Divider
  type: bold
`);
		expect(config.blocks).toHaveLength(1);
		const divider = config.blocks[0];
		expect(divider.kind).toBe("divider");
	});

	it("parses links block", () => {
		const config = parseDashboard(`
links:
  title: Quick Links
  columns: 2
  - url: https://example.com
    label: Example
`);
		expect(config.blocks).toHaveLength(1);
		const links = config.blocks[0];
		expect(links.kind).toBe("links");
	});

	it("parses stats toggle", () => {
		const config = parseDashboard(`
stats: true
`);
		expect(config.stats.enabled).toBe(true);
	});

	it("parses graph config", () => {
		const config = parseDashboard(`
graph:
  showGraph: true
  exclude: folder1, folder2
`);
		expect(config.graph.enabled).toBe(true);
		expect(config.graph.exclude).toEqual(["folder1", "folder2"]);
	});

	it("parses vault-activity block with path, tags and label", () => {
		const config = parseDashboard(`
vault-activity:
  show: true
  count: 5
  path: Journal/
  tags: project, active
  label: MY ACTIVITY
`);
		expect(config.blocks).toHaveLength(1);
		const activity = config.blocks[0];
		expect(activity.kind).toBe("vault-activity");
		if (activity.kind === "vault-activity") {
			expect(activity.show).toBe(true);
			expect(activity.count).toBe(5);
			expect(activity.path).toBe("Journal/");
			expect(activity.tags).toEqual(["project", "active"]);
			expect(activity.label).toBe("MY ACTIVITY");
		}
	});

	it("parses multiple vault-activity blocks independently", () => {
		const config = parseDashboard(`
vault-activity:
  path: Journal/
  count: 10

vault-activity:
  tags: work
  count: 3
`);
		const activityBlocks = config.blocks.filter((b) => b.kind === "vault-activity");
		expect(activityBlocks).toHaveLength(2);
		const [first, second] = activityBlocks;
		if (first.kind === "vault-activity" && second.kind === "vault-activity") {
			expect(first.path).toBe("Journal/");
			expect(first.tags).toBeUndefined();
			expect(second.path).toBeUndefined();
			expect(second.tags).toEqual(["work"]);
		}
	});

	it("parses row with sections", () => {
		const config = parseDashboard(`
row:
  columns: 2
  - section:
      columns: 1
      cards:
        - label: Left
          path: Left.md
  - section:
      columns: 1
      cards:
        - label: Right
          path: Right.md
`);
		expect(config.blocks).toHaveLength(1);
		const row = config.blocks[0];
		expect(row.kind).toBe("row");
	});

	it("auto-appends .md to card paths", () => {
		const config = parseDashboard(`
section:
  cards:
    - type: big
      label: Test
      path: Test
`);
		expect(config.blocks.length).toBeGreaterThan(0);
		const section = config.blocks[0];
		if (section.kind === "section") {
			expect(section.cards[0].path).toBe("Test.md");
		}
	});

	it("parses search config", () => {
		const config = parseDashboard(`
search:
  show: true
  default: cards
  placeholder: Find notes...
`);
		expect(config.search).toBeDefined();
		expect(config.search?.show).toBe(true);
		expect(config.search?.default).toBe("cards");
		expect(config.search?.placeholder).toBe("Find notes...");
	});

	it("handles YAML list prefix", () => {
		const config = parseDashboard(`
- section:
    cards:
      - type: big
        label: Test
        path: Test.md
`);
		expect(config.blocks).toHaveLength(1);
	});

	it("parses timeline block with extended keys", () => {
		const config = parseDashboard(`
timeline:
  show: true
  count: 10
  label: RECENT
  exclude: Journal
  excludeExt: .png, .jpg
  include: Projects, Journal
  types: created, deleted
  onlyMarkdown: false
  group: file
  relative: true
  showDate: false
  showChips: true
  showMore: false
`);
		expect(config.blocks).toHaveLength(1);
		const timeline = config.blocks[0];
		expect(timeline.kind).toBe("timeline");
		if (timeline.kind === "timeline") {
			expect(timeline.show).toBe(true);
			expect(timeline.count).toBe(10);
			expect(timeline.label).toBe("RECENT");
			expect(timeline.exclude).toEqual(["Journal"]);
			expect(timeline.excludeExt).toEqual([".png", ".jpg"]);
			expect(timeline.include).toEqual(["Projects", "Journal"]);
			expect(timeline.types).toEqual(["created", "deleted"]);
			expect(timeline.onlyMarkdown).toBe(false);
			expect(timeline.group).toBe("file");
			expect(timeline.relative).toBe(true);
			expect(timeline.showDate).toBe(false);
			expect(timeline.showChips).toBe(true);
			expect(timeline.showMore).toBe(false);
		}
	});
});
