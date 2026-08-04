import type { ActivityEvent } from "./types";

/** Merge duplicate consecutive edits to the same path+action within this window. */
export const TIMELINE_COALESCE_MS = 60_000;

/** Minimal file shape required to backfill the timeline from the vault. */
export interface TimelineFileMeta {
	path: string;
	extension: string;
	mtime: number;
}

export interface TimelineSource {
	/** Persisted activity log (newest first). */
	log: ActivityEvent[];
	/** Vault files (any order); used to backfill sparse activity. */
	files: TimelineFileMeta[];
}

export interface TimelineOptions {
	onlyMarkdown: boolean;
	include: string[];
	excludeFolders: string[];
	excludeExt: string[];
	types: string[];
	/** Active chip filter as a predicate over an action string. */
	chipMatch: (action: string) => boolean;
	/** Resolved number of entries the timeline intends to display. */
	count: number;
	/** Coalescing window in ms (defaults to TIMELINE_COALESCE_MS). */
	coalesceMs?: number;
}

/** True when `path` is inside the vault-relative `prefix` (or is the prefix itself). */
export function isWithinPath(path: string, prefix: string): boolean {
	const p = prefix.replace(/\/+$/, "");
	return p.length === 0 || path === p || path.startsWith(p + "/");
}

/**
 * Build the ordered list of timeline events: filtered log entries, backfilled
 * recently-modified files, newest first, with consecutive duplicates coalesced.
 */
export function buildTimelineEvents(source: TimelineSource, opts: TimelineOptions): ActivityEvent[] {
	const logEvents: ActivityEvent[] = [];

	for (const ev of source.log) {
		if (opts.types.length > 0 && !opts.types.includes(ev.action)) continue;
		if (!opts.chipMatch(ev.action)) continue;
		if (opts.onlyMarkdown && !ev.path.toLowerCase().endsWith(".md")) continue;
		if (opts.excludeExt.some((ext) => ev.path.toLowerCase().endsWith(ext.toLowerCase()))) continue;
		if (opts.include.length > 0 && !opts.include.some((inc) => isWithinPath(ev.path, inc))) continue;
		if (opts.excludeFolders.some((ex) => isWithinPath(ev.path, ex))) continue;
		logEvents.push(ev);
	}

	// Backfill: only when the active filter would actually show "modified"
	// entries, otherwise backfilled rows would violate the chip/types filter.
	const admitsModified =
		opts.chipMatch("modified") && (opts.types.length === 0 || opts.types.includes("modified"));

	if (admitsModified && logEvents.length < opts.count) {
		const seen = new Set(logEvents.map((e) => e.path));
		const files = source.files
			.filter((f) => !seen.has(f.path))
			.filter((f) => {
				if (opts.onlyMarkdown && f.extension !== "md") return false;
				if (opts.excludeExt.some((ext) => f.path.toLowerCase().endsWith(ext.toLowerCase()))) return false;
				if (opts.include.length > 0 && !opts.include.some((inc) => isWithinPath(f.path, inc))) return false;
				if (opts.excludeFolders.some((ex) => isWithinPath(f.path, ex))) return false;
				return true;
			})
			.sort((a, b) => b.mtime - a.mtime)
			.slice(0, opts.count - logEvents.length);
		for (const f of files) {
			logEvents.push({ time: f.mtime, action: "modified", path: f.path });
		}
	}

	logEvents.sort((a, b) => b.time - a.time);

	const coalesceMs = opts.coalesceMs ?? TIMELINE_COALESCE_MS;
	if (coalesceMs > 0) {
		const coalesced: ActivityEvent[] = [];
		for (const ev of logEvents) {
			const last = coalesced[coalesced.length - 1];
			const isDuplicate =
				last !== undefined &&
				last.action === ev.action &&
				last.path === ev.path &&
				// Events are newest-first, so the difference is positive.
				last.time - ev.time < coalesceMs;
			if (!isDuplicate) {
				coalesced.push({ ...ev });
			}
		}
		return coalesced;
	}

	return logEvents;
}
