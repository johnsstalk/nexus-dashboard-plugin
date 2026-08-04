import {
	Editor,
	MarkdownView,
	MarkdownFileInfo,
	Plugin,
	Notice,
	TFile,
	TFolder,
	TAbstractFile,
} from "obsidian";
import { NexusSettings, ActivityEvent } from "./types";
import { DEFAULT_SETTINGS, mergeSettings, deepCloneDefaults } from "./defaults";
import { hasExtension, ensureExtension, splitCsv } from "./utils";
import { NexusSettingTab } from "./settings";
import { NexusRenderer } from "./renderer";

export default class NexusDashboardPlugin extends Plugin {
	settings: NexusSettings = DEFAULT_SETTINGS;
	activeRenderers: Set<NexusRenderer> = new Set();

	private saveTimer: ReturnType<typeof setTimeout> | null = null;
	private taskCheckTimer: ReturnType<typeof setTimeout> | null = null;
	private propertyCheckTimer: ReturnType<typeof setTimeout> | null = null;
	private taskCheckQueue: Array<{ file: TFile; editor: Editor }> = [];
	private propertyCheckQueue: Set<string> = new Set();
	private taskSnapshot = new Map<string, Map<number, string>>();
	private propertySnapshot = new Map<string, string>();
	private openedThrottle = new Map<string, number>();
	private recentFiles: { at: number; files: TFile[] } | null = null;
	private pluginLoadTime = Date.now();
	private startupMuted = true;

	async onload() {
		this.pluginLoadTime = Date.now();
		setTimeout(() => {
			this.startupMuted = false;
		}, 5000);

		await this.loadSettings();
		this.purgeStartupArtifacts();

		// ── Migration: append .md to extension-free MOC paths ──
		let migrated = false;
		for (const moc of this.settings.mocs) {
			if (!hasExtension(moc.path)) {
				moc.path = ensureExtension(moc.path);
				migrated = true;
			}
		}
		if (migrated) {
			await this.saveSettings();
		}

		// ── Nexus Dashboard code block ──────────────────────
		this.registerMarkdownCodeBlockProcessor("nexus-dashboard", (source, el, ctx) => {
			const renderer = new NexusRenderer(el, this, source, ctx.sourcePath);
			ctx.addChild(renderer);
		});

		// ── Ribbon icon ─────────────────────────────────────
		this.addRibbonIcon("layout-dashboard", "Open Nexus Dashboard", () => {
			this.openDashboard();
		});

		// ── Commands ────────────────────────────────────────
		this.addCommand({
			id: "open-nexus-dashboard",
			name: "Open dashboard",
			callback: () => this.openDashboard(),
		});

		this.addCommand({
			id: "insert-nexus-dashboard",
			name: "Insert Nexus Dashboard code block",
			editorCallback: (editor) => {
				editor.replaceSelection("```nexus-dashboard\n```\n");
			},
		});

		this.addCommand({
			id: "insert-ascii-block",
			name: "Insert ASCII art block",
			editorCallback: (editor: Editor, _ctx: MarkdownView | MarkdownFileInfo) => {
				const cursor = editor.getCursor();
				const insert = "```nexus-dashboard\nheader:\n  text: \n```\n";
				editor.replaceRange(insert, cursor);
				editor.setCursor({ line: cursor.line + 3, ch: 8 });
			},
		});

		this.addCommand({
			id: "render-selection-ascii",
			name: "Render selection as ASCII art",
			editorCallback: (editor: Editor, _ctx: MarkdownView | MarkdownFileInfo) => {
				const selection = editor.getSelection();
				if (selection) {
					editor.replaceSelection(`\n\`\`\`nexus-dashboard\nheader:\n  text: ${selection}\n\`\`\`\n`);
				}
			},
		});

		this.addCommand({
			id: "clear-activity-log",
			name: "Clear activity log",
			callback: () => {
				this.clearActivityLog();
			},
		});

		this.addSettingTab(new NexusSettingTab(this.app, this));

		// ── Update paths on file rename/move ───────────────
		this.registerEvent(
			this.app.vault.on("rename", (file: TAbstractFile, oldPath: string) => {
				if (file instanceof TFile) {
					const oldPathLower = oldPath.toLowerCase();
					const newPath = file.path;

					// Update settings MOCs
					for (const moc of this.settings.mocs) {
						if (moc.path.toLowerCase() === oldPathLower) moc.path = newPath;
					}

					// Update paths inside nexus-dashboard code blocks in all vault notes
					this.updateCodeBlockPaths(oldPath, newPath);
				}
				this.saveData(this.settings);
			}),
		);

		// ── Global activity tracking ────────────────────────
		this.registerActivityTracking();

		// ── Open on startup ─────────────────────────────────
		if (this.settings.openOnStartup) {
			this.app.workspace.onLayoutReady(() => {
				this.openDashboard();
			});
		}
	}

	onunload() {
		// Flush any pending activity-log write so events aren't lost on quit.
		if (this.saveTimer) {
			clearTimeout(this.saveTimer);
			this.saveTimer = null;
			void this.saveData(this.settings);
		}
	}

	// ── Dashboard finder ───────────────────────────────────

	private async findDashboardFile(): Promise<TFile | null> {
		const files = this.app.vault.getMarkdownFiles();
		for (const file of files) {
			const content = await this.app.vault.cachedRead(file);
			if (content.includes("```nexus-dashboard")) {
				return file;
			}
		}
		return null;
	}

	async openDashboard(): Promise<void> {
		const { workspace } = this.app;

		// Find existing dashboard note by content
		const existingFile = await this.findDashboardFile();

		if (existingFile instanceof TFile) {
			await workspace.openLinkText(existingFile.path, "", false);
		} else {
			// Create the dashboard note
			const content = "```nexus-dashboard\n```\n";
			const file = await this.app.vault.create("Nexus Dashboard.md", content);
			await workspace.openLinkText(file.path, "", false);
			new Notice("Nexus Dashboard created");
		}
	}

	// ── Settings ───────────────────────────────────────────

	async loadSettings() {
		try {
			const data = await this.loadData();
			this.settings = mergeSettings(data, splitCsv);
		} catch {
			this.settings = deepCloneDefaults();
		}
	}

	async saveSettings() {
		await this.saveData(this.settings);
		this.rerenderDashboards();
	}

	// ── Activity log ───────────────────────────────────────

	/** Append an event to the persisted activity log (newest first). */
	recordActivity(event: Omit<ActivityEvent, "time">): void {
		if (!this.settings.activityTrackingEnabled) return;
		// Ignore vault indexing / sync bursts that fire right after load.
		if (this.startupMuted) return;
		this.settings.activityLog.unshift({ ...event, time: Date.now() });
		const max = Math.max(50, this.settings.activityLogMax || 500);
		if (this.settings.activityLog.length > max) {
			this.settings.activityLog.length = max;
		}
		this.schedulePersist();
	}

	clearActivityLog(): void {
		this.settings.activityLog = [];
		void this.saveData(this.settings);
		this.rerenderDashboards();
	}

	/**
	 * Vault files sorted by mtime (newest first), cached for a short TTL so
	 * the timeline backfill doesn't re-sort the whole vault on every render.
	 */
	getRecentFiles(): TFile[] {
		if (this.recentFiles && Date.now() - this.recentFiles.at < 10_000) {
			return this.recentFiles.files;
		}
		const files = [...this.app.vault.getFiles()].sort((a, b) => b.stat.mtime - a.stat.mtime);
		this.recentFiles = { at: Date.now(), files };
		return files;
	}

	private schedulePersist(): void {
		if (this.saveTimer) return;
		this.saveTimer = setTimeout(() => {
			this.saveTimer = null;
			void this.saveData(this.settings);
			this.rerenderDashboards();
		}, 1500);
	}

	// ── Global activity tracking ───────────────────────────

	private registerActivityTracking(): void {
		if (!this.settings.activityTrackingEnabled) return;

		this.registerEvent(
			this.app.vault.on("create", (file: TAbstractFile) => {
				this.recentFiles = null;
				if (this.isStartupArtifact(file)) return;
				if (file instanceof TFolder) {
					if (file.isRoot()) return;
					this.recordActivity({ action: "folder-created", path: file.path });
				} else if (file instanceof TFile) {
					this.recordActivity({
						action: "created",
						path: file.path,
						detail: this.isDailyNote(file) ? "daily note" : undefined,
					});
				}
			}),
		);

		this.registerEvent(
			this.app.vault.on("modify", (file: TAbstractFile) => {
				if (!(file instanceof TFile)) return;
				this.recentFiles = null;
				if (this.isStartupArtifact(file)) return;
				this.recordActivity({ action: "modified", path: file.path });
			}),
		);

		this.registerEvent(
			this.app.vault.on("delete", (file: TAbstractFile) => {
				this.recentFiles = null;
				if (file instanceof TFolder) {
					this.recordActivity({ action: "folder-deleted", path: file.path });
				} else if (file instanceof TFile) {
					this.recordActivity({ action: "deleted", path: file.path });
				}
				this.taskSnapshot.delete(file.path);
				this.propertySnapshot.delete(file.path);
			}),
		);

		this.registerEvent(
			this.app.vault.on("rename", (file: TAbstractFile, oldPath: string) => {
				this.recentFiles = null;
				const sameFolder = this.parentOf(oldPath) === this.parentOf(file.path);
				if (file instanceof TFolder) {
					this.recordActivity({
						action: sameFolder ? "renamed" : "folder-renamed",
						path: file.path,
						oldPath,
					});
				} else if (file instanceof TFile) {
					this.recordActivity({
						action: sameFolder ? "renamed" : "moved",
						path: file.path,
						oldPath,
					});
					const tasks = this.taskSnapshot.get(oldPath);
					if (tasks) {
						this.taskSnapshot.delete(oldPath);
						this.taskSnapshot.set(file.path, tasks);
					}
					const props = this.propertySnapshot.get(oldPath);
					if (props !== undefined) {
						this.propertySnapshot.delete(oldPath);
						this.propertySnapshot.set(file.path, props);
					}
				}
			}),
		);

		// Active file opened (throttled per file)
		this.registerEvent(
			this.app.workspace.on("file-open", (file: TFile | null) => {
				if (!(file instanceof TFile)) return;
				const last = this.openedThrottle.get(file.path) || 0;
				if (Date.now() - last < 60_000) return;
				this.openedThrottle.set(file.path, Date.now());
				this.recordActivity({ action: "opened", path: file.path });
			}),
		);

		// Task checkbox toggles (debounced editor diff)
		this.registerEvent(
			this.app.workspace.on("editor-change", (editor: Editor, info: MarkdownView | MarkdownFileInfo) => {
				if (!this.settings.activityTaskTracking) return;
				const file = info.file;
				if (!(file instanceof TFile)) return;
				const existing = this.taskCheckQueue.findIndex((q) => q.file.path === file.path);
				if (existing >= 0) this.taskCheckQueue.splice(existing, 1);
				this.taskCheckQueue.push({ file, editor });
				this.scheduleTaskCheck();
			}),
		);

		// Frontmatter / property changes (debounced)
		this.registerEvent(
			this.app.metadataCache.on("changed", (file: TFile) => {
				if (this.propertyCheckQueue.has(file.path)) return;
				this.propertyCheckQueue.add(file.path);
				this.schedulePropertyCheck();
			}),
		);
	}

	private scheduleTaskCheck(): void {
		if (this.taskCheckTimer) return;
		this.taskCheckTimer = setTimeout(() => {
			this.taskCheckTimer = null;
			const queue = this.taskCheckQueue;
			this.taskCheckQueue = [];
			for (const { file, editor } of queue) {
				this.processTaskChanges(file, editor);
			}
		}, 1200);
	}

	private schedulePropertyCheck(): void {
		if (this.propertyCheckTimer) return;
		this.propertyCheckTimer = setTimeout(() => {
			this.propertyCheckTimer = null;
			const queue = [...this.propertyCheckQueue];
			this.propertyCheckQueue.clear();
			for (const path of queue) {
				this.processPropertyChange(path);
			}
		}, 800);
	}

	private processTaskChanges(file: TFile, editor: Editor): void {
		const current = new Map<number, string>();
		const lineCount = editor.lineCount();
		for (let i = 0; i < lineCount; i++) {
			const text = editor.getLine(i);
			if (this.checkboxState(text) !== null) {
				current.set(i, text);
			}
		}
		const prev = this.taskSnapshot.get(file.path);
		if (prev) {
			for (const [line, text] of current) {
				const oldText = prev.get(line);
				if (oldText === undefined) continue;
				const oldState = this.checkboxState(oldText);
				const newState = this.checkboxState(text);
				if (oldState !== null && newState !== null && oldState !== newState) {
					const clean = text.replace(/^\s*[-*+]\s*\[[ xX\-\/]\]\s*/, "");
					this.recordActivity({
						action: "task",
						path: file.path,
						detail: clean || text.trim(),
					});
				}
			}
		}
		this.taskSnapshot.set(file.path, current);
	}

	private checkboxState(text: string): string | null {
		const m = text.match(/^\s*[-*+]\s*\[([ xX\-\/])\]\s*/);
		return m ? m[1] : null;
	}

	private processPropertyChange(path: string): void {
		const file = this.app.vault.getAbstractFileByPath(path);
		if (!(file instanceof TFile)) {
			this.propertySnapshot.delete(path);
			return;
		}
		const cache = this.app.metadataCache.getFileCache(file);
		const frontmatter = cache?.frontmatter || null;
		const serialized = JSON.stringify(frontmatter);
		const prev = this.propertySnapshot.get(path);
		if (prev === undefined) {
			this.propertySnapshot.set(path, serialized);
			return;
		}
		if (prev === serialized) return;
		const changedKeys = this.changedPropertyKeys(prev, serialized);
		this.propertySnapshot.set(path, serialized);
		if (changedKeys.length === 0) return;
		this.recordActivity({
			action: "property",
			path,
			detail: changedKeys.join(", "),
		});
	}

	private changedPropertyKeys(prev: string, next: string): string[] {
		let prevObj: Record<string, unknown> = {};
		let nextObj: Record<string, unknown> = {};
		try {
			prevObj = prev === "null" ? {} : JSON.parse(prev);
			nextObj = next === "null" ? {} : JSON.parse(next);
		} catch {
			return ["frontmatter"];
		}
		const keys = new Set([...Object.keys(prevObj), ...Object.keys(nextObj)]);
		const changed: string[] = [];
		for (const key of keys) {
			if (JSON.stringify(prevObj[key]) !== JSON.stringify(nextObj[key])) {
				changed.push(key);
			}
		}
		return changed;
	}

	/** Parent folder path of a vault path ("" for root). */
	private parentOf(path: string): string {
		const idx = path.lastIndexOf("/");
		return idx < 0 ? "" : path.slice(0, idx);
	}

	/** Earliest of the file's creation/modification times as Obsidian reports them. */
	private earliestStat(file: TAbstractFile): number {
		return Math.min(file.stat.mtime, file.stat.ctime);
	}

	/** True if the file already existed before the plugin loaded (indexing artifact). */
	private isStartupArtifact(file: TAbstractFile): boolean {
		return this.earliestStat(file) < this.pluginLoadTime - 3000;
	}

	/** Drop create events that are vault-indexing artifacts, not real activity. */
	private purgeStartupArtifacts(): void {
		const cutoff = 10 * 60 * 1000;
		const before = this.settings.activityLog.length;
		this.settings.activityLog = this.settings.activityLog.filter((ev) => {
			if (ev.action !== "created" && ev.action !== "folder-created") return true;
			const file = this.app.vault.getAbstractFileByPath(ev.path);
			if (!file) return true;
			return !(this.earliestStat(file) < ev.time - cutoff);
		});
		if (this.settings.activityLog.length !== before) {
			void this.saveData(this.settings);
		}
	}

	/** Detect whether a file matches the daily-notes plugin's folder + format. */
	private isDailyNote(file: TFile): boolean {
		if (file.extension !== "md") return false;
		try {
			const dailyInstance = (this.app as any).internalPlugins?.plugins?.["daily-notes"]?.instance;
			const options = dailyInstance?.options;
			if (!options) return false;
			const folder = options.folder as string | undefined;
			if (folder && !file.path.startsWith(folder.replace(/\/+$/, "") + "/")) return false;
			const format = options.format as string | undefined;
			if (!format) return false;
			const moment = (window as any).moment;
			if (typeof moment?.format !== "function") return false;
			return file.basename === moment().format(format) || file.basename === moment().add(1, "day").format(format);
		} catch {
			return false;
		}
	}

	// ── Live-update all open dashboards ────────────────────

	rerenderDashboards() {
		for (const renderer of this.activeRenderers) {
			renderer.render();
		}
	}

	// ── Update paths inside code blocks on file rename ────

	private async updateCodeBlockPaths(oldPath: string, newPath: string): Promise<void> {
		const ext = oldPath.match(/\.\w{1,10}$/)?.[0] || ".md";
		const oldPathNoExt = oldPath.replace(new RegExp(ext.replace(".", "\\.") + "$"), "");

		const mdFiles = this.app.vault.getMarkdownFiles();
		for (const file of mdFiles) {
			const content = await this.app.vault.cachedRead(file);
			if (!content.includes("```nexus-dashboard")) continue;

			// Match both old (no ext) and new (with ext) formats
			const hasOldFormat = content.includes(oldPathNoExt) && !content.includes(oldPath);
			const hasNewFormat = content.includes(oldPath);
			if (!hasOldFormat && !hasNewFormat) continue;

			let updated = content;

			if (hasOldFormat) {
				updated = updated.replaceAll(oldPathNoExt, newPath);
			} else {
				updated = updated.replaceAll(oldPath, newPath);
			}

			// Also update label if it matches old basename
			const oldBasename = oldPathNoExt.split("/").pop() || oldPathNoExt;
			const newBasename =
				newPath
					.replace(/\.\w{1,10}$/, "")
					.split("/")
					.pop() || "";
			if (oldBasename !== newBasename) {
				const escaped = oldBasename.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
				updated = updated.replace(
					new RegExp(`(label:\\s*)${escaped}(\\.md)?(\\s*\n)`),
					`$1${newBasename}$3`,
				);
			}

			if (updated !== content) {
				await this.app.vault.modify(file, updated);
			}
		}
		this.rerenderDashboards();
	}
}
