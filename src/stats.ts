import type { StatItem, StatMetric, StatScope } from "./types";

/** Valid stat metrics. */
export const STAT_METRICS: readonly StatMetric[] = ["files", "notes", "size", "tags"];

/** Valid time windows for stat counters. */
export const STAT_SCOPES: readonly StatScope[] = ["all", "today", "week", "month", "year"];

/** Serializable view of a vault file used by the pure stat helpers. */
export interface StatFile {
	path: string;
	extension: string;
	size: number;
	mtime: number;
}

function isMetric(value: string | undefined): value is StatMetric {
	return STAT_METRICS.includes(value as StatMetric);
}

function isScope(value: string | undefined): value is StatScope {
	return STAT_SCOPES.includes(value as StatScope);
}

/** Resolves optional stat-item fields to their effective values. */
export function normalizeStatItem(item: {
	metric?: StatMetric;
	scope?: StatScope;
	recursive?: boolean;
}): { metric: StatMetric; scope: StatScope; recursive: boolean } {
	return {
		metric: isMetric(item.metric) ? item.metric : "files",
		scope: isScope(item.scope) ? item.scope : "all",
		recursive: item.recursive ?? true,
	};
}

function startOfDay(ts: number): number {
	const d = new Date(ts);
	d.setHours(0, 0, 0, 0);
	return d.getTime();
}

function startOfWeek(ts: number): number {
	const d = new Date(startOfDay(ts));
	const day = (d.getDay() + 6) % 7;
	d.setDate(d.getDate() - day);
	return d.getTime();
}

function startOfMonth(ts: number): number {
	const d = new Date(startOfDay(ts));
	d.setDate(1);
	return d.getTime();
}

function startOfYear(ts: number): number {
	const d = new Date(startOfDay(ts));
	d.setDate(1);
	d.setMonth(0);
	return d.getTime();
}

/** Earliest timestamp (inclusive) for the given calendar window. */
export function windowStart(scope: StatScope, now: number): number {
	switch (scope) {
		case "today":
			return startOfDay(now);
		case "week":
			return startOfWeek(now);
		case "month":
			return startOfMonth(now);
		case "year":
			return startOfYear(now);
		default:
			return 0;
	}
}

/** Returns `true` when `time` falls inside the given window. */
export function isInWindow(time: number, scope: StatScope, now: number): boolean {
	if (scope === "all") return true;
	return time >= windowStart(scope, now);
}

/** Whether a file path lives inside the folder (recursive or direct children only). */
export function matchesFolder(path: string, folder: string, recursive: boolean): boolean {
	if (!folder) return true;
	const prefix = folder.replace(/\/+$/, "").toLowerCase() + "/";
	const lowerPath = path.toLowerCase();
	if (!lowerPath.startsWith(prefix)) return false;
	if (recursive) return true;
	return !lowerPath.slice(prefix.length).includes("/");
}

/** Formats a byte count into a human-readable size string. */
export function formatSize(bytes: number): string {
	const units = ["B", "KB", "MB", "GB", "TB"] as const;
	let value = bytes;
	let i = 0;
	while (value >= 1024 && i < units.length - 1) {
		value /= 1024;
		i++;
	}
	if (i === 0) return `${value} B`;
	return `${value.toFixed(value >= 100 ? 0 : 1)} ${units[i]}`;
}

/**
 * Computes the display value for a stat item.
 *
 * @param files - All vault files.
 * @param item - The stat counter definition.
 * @param now - Current timestamp used for time windows.
 * @param tagsOf - Returns the tag strings attached to a file (used by `tags` metric).
 */
export function computeStatValue(
	files: StatFile[],
	item: StatItem,
	now: number,
	tagsOf: (path: string) => string[],
): string {
	const { metric, scope, recursive } = normalizeStatItem(item);
	const matched = files.filter(
		(f) => matchesFolder(f.path, item.folder, recursive) && isInWindow(f.mtime, scope, now),
	);

	switch (metric) {
		case "notes":
			return String(matched.filter((f) => f.extension === "md").length);
		case "size":
			return formatSize(matched.reduce((sum, f) => sum + f.size, 0));
		case "tags": {
			const tags = new Set<string>();
			for (const f of matched) {
				for (const tag of tagsOf(f.path)) tags.add(tag);
			}
			return String(tags.size);
		}
		case "files":
		default:
			return String(matched.length);
	}
}

/** Minimal shape of Obsidian's cached metadata needed for tag collection. */
export interface TagSource {
	tags?: Array<{ tag: string }>;
	frontmatter?: { tags?: unknown; tag?: unknown };
}

/** Normalizes a raw tag into a canonical form: no leading `#`, trimmed, lowercased. */
export function normalizeTag(raw: string): string {
	return raw.trim().replace(/^#+/, "").toLowerCase();
}

/**
 * Collects the unique normalized tags attached to a file, combining inline
 * body tags (`#tag`) with frontmatter tags (`tags:` / `tag:`).
 *
 * Obsidian stores inline tags in `cache.tags` (with a leading `#`) and
 * frontmatter tags only in `cache.frontmatter`. Reading just one source — or
 * failing to normalize case/hash — produces wrong tag counts.
 */
export function collectFileTags(cache: TagSource | null | undefined): string[] {
	if (!cache) return [];
	const tags = new Set<string>();

	for (const t of cache.tags ?? []) {
		const norm = normalizeTag(t.tag);
		if (norm) tags.add(norm);
	}

	const fmTags = cache.frontmatter?.tags;
	if (Array.isArray(fmTags)) {
		for (const t of fmTags) {
			const norm = normalizeTag(String(t));
			if (norm) tags.add(norm);
		}
	} else if (typeof fmTags === "string") {
		const norm = normalizeTag(fmTags);
		if (norm) tags.add(norm);
	}

	const fmTag = cache.frontmatter?.tag;
	if (typeof fmTag === "string") {
		const norm = normalizeTag(fmTag);
		if (norm) tags.add(norm);
	}

	return Array.from(tags);
}

/** Human-readable summary of what a stat counts, e.g. for tooltips. */
export function statSummary(item: StatItem): string {
	const { metric, scope, recursive } = normalizeStatItem(item);
	const metricLabel: Record<StatMetric, string> = {
		files: "files",
		notes: "notes",
		size: "size",
		tags: "tags",
	};
	const scopeLabel: Record<StatScope, string> = {
		all: "all time",
		today: "today",
		week: "this week",
		month: "this month",
		year: "this year",
	};
	const folder = item.folder ? item.folder : "whole vault";
	return `Counts ${metricLabel[metric]} in ${folder} · ${scopeLabel[scope]} · ${
		recursive ? "includes subfolders" : "direct children only"
	}`;
}

/** Formats a date as `YYYY-MM-DD`, used for auto-generated note names. */
export function dateStamp(d: Date): string {
	const pad = (n: number) => String(n).padStart(2, "0");
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
