import { ObsidianBookmarkItem } from "./types";

declare module "obsidian" {
	interface App {
		/** @internal — not part of Obsidian's public API. */
		internalPlugins?: InternalPluginsApi;
	}
	/** Copy text to the clipboard using Obsidian's helper (declared in later API versions). */
	function copy(text: string): boolean;
}

/** @internal Minimal shape of Obsidian's internal plugin registry. */
interface InternalPluginsApi {
	plugins?: Record<string, InternalPluginEntry>;
}

interface InternalPluginEntry {
	enabled?: boolean;
	instance?: {
		options?: Record<string, unknown>;
		data?: { items?: ObsidianBookmarkItem[] };
		getBookmarks?: () => ObsidianBookmarkItem[];
	};
}

export {};
