import { Editor, MarkdownView, MarkdownFileInfo, Plugin, Notice, TFile, TAbstractFile, WorkspaceLeaf } from "obsidian";
import { NexusSettings, DEFAULT_SETTINGS, NexusSettingTab } from "./settings";
import { NexusRenderer } from "./renderer";


const DASHBOARD_VIEW_TYPE = "nexus-dashboard-view";

/** Check if a path already has a file extension */
function hasExtension(path: string): boolean {
	return /\.\w{1,10}$/.test(path);
}

/** Auto-append .md to extension-free paths */
function ensureExtension(path: string): string {
	return hasExtension(path) ? path : path + ".md";
}

export default class NexusDashboardPlugin extends Plugin {
	settings: NexusSettings = DEFAULT_SETTINGS;
	activeRenderers: Set<NexusRenderer> = new Set();

	async onload() {
		await this.loadSettings();

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

		this.addSettingTab(new NexusSettingTab(this.app, this));

		// ── Update paths on file rename/move ───────────────
		this.registerEvent(
			this.app.vault.on("rename", (file: TAbstractFile, oldPath: string) => {
				if (!(file instanceof TFile)) return;
				// Paths now include extensions — compare full paths
				const oldPathLower = oldPath.toLowerCase();
				const newPath = file.path;

				// Update settings MOCs
				for (const moc of this.settings.mocs) {
					if (moc.path.toLowerCase() === oldPathLower) moc.path = newPath;
				}
				this.saveData(this.settings);

				// Update paths inside nexus-dashboard code blocks in all vault notes
				// Pass original case for code block matching (case-sensitive includes)
				this.updateCodeBlockPaths(oldPath, newPath);
			})
		);

		// ── Open on startup ─────────────────────────────────
		if (this.settings.openOnStartup) {
			this.app.workspace.onLayoutReady(() => {
				this.openDashboard();
			});
		}
	}

	onunload() {}

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
		const data = await this.loadData();
		this.settings = {
			headerText: typeof data?.headerText === "string" ? data.headerText : DEFAULT_SETTINGS.headerText,
			openOnStartup: typeof data?.openOnStartup === "boolean" ? data.openOnStartup : DEFAULT_SETTINGS.openOnStartup,
			mocs: data?.mocs && Array.isArray(data.mocs) ? data.mocs.map((m: any) => ({ ...m })) : DEFAULT_SETTINGS.mocs.map((m) => ({ ...m })),
			stats: data?.stats && Array.isArray(data.stats) ? data.stats.map((s: any) => ({ ...s })) : DEFAULT_SETTINGS.stats.map((s) => ({ ...s })),
			showStats: typeof data?.showStats === "boolean" ? data.showStats : DEFAULT_SETTINGS.showStats,
			showRecently: typeof data?.showRecently === "boolean" ? data.showRecently : DEFAULT_SETTINGS.showRecently,
			showGraph: typeof data?.showGraph === "boolean" ? data.showGraph : DEFAULT_SETTINGS.showGraph,
			recentCount: typeof data?.recentCount === "number" ? data.recentCount : DEFAULT_SETTINGS.recentCount,
			excludeFolders: Array.isArray(data?.excludeFolders) ? data.excludeFolders : [],
			mocGridColumns: typeof data?.mocGridColumns === "number" ? data.mocGridColumns : DEFAULT_SETTINGS.mocGridColumns,
			miniGridColumns: typeof data?.miniGridColumns === "number" ? data.miniGridColumns : DEFAULT_SETTINGS.miniGridColumns,
			dividerLabel: typeof data?.dividerLabel === "string" ? data.dividerLabel : DEFAULT_SETTINGS.dividerLabel,
			dividerDesign: data?.dividerDesign && typeof data.dividerDesign === "object" ? { ...DEFAULT_SETTINGS.dividerDesign, ...data.dividerDesign } : { ...DEFAULT_SETTINGS.dividerDesign },
			asciiDefaultFont: typeof data?.asciiDefaultFont === "string" ? data.asciiDefaultFont : DEFAULT_SETTINGS.asciiDefaultFont,
			asciiDefaultColor: typeof data?.asciiDefaultColor === "string" ? data.asciiDefaultColor : DEFAULT_SETTINGS.asciiDefaultColor,
			asciiDefaultSize: typeof data?.asciiDefaultSize === "number" ? data.asciiDefaultSize : DEFAULT_SETTINGS.asciiDefaultSize,
			asciiMobileSize: typeof data?.asciiMobileSize === "number" ? data.asciiMobileSize : DEFAULT_SETTINGS.asciiMobileSize,
			asciiDefaultAlign: typeof data?.asciiDefaultAlign === "string" ? data.asciiDefaultAlign : DEFAULT_SETTINGS.asciiDefaultAlign,
		};
	}

	async saveSettings() {
		await this.saveData(this.settings);
		this.rerenderDashboards();
	}

	// ── Live-update all open dashboards ────────────────────

	rerenderDashboards() {
		for (const renderer of this.activeRenderers) {
			renderer.render();
		}
	}

	// ── Update paths inside code blocks on file rename ────

	private async updateCodeBlockPaths(oldPath: string, newPath: string): Promise<void> {
		// oldPath/newPath are full paths with extensions (e.g. "MOC/Journal MOC.md")
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
				// Migrate: old extension-free → new with extension
				updated = updated.replaceAll(oldPathNoExt, newPath);
			} else {
				// Already has extension — normal replace
				updated = updated.replaceAll(oldPath, newPath);
			}

			// Also update label if it matches old basename
			const oldBasename = oldPathNoExt.split("/").pop() || oldPathNoExt;
			const newBasename = (newPath.replace(/\.\w{1,10}$/, "").split("/").pop() || "");
			if (oldBasename !== newBasename) {
				const escaped = oldBasename.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
				updated = updated.replace(
					new RegExp(`(label:\\s*)${escaped}(\\.md)?(\\s*\n)`),
					`$1${newBasename}$3`
				);
			}

			if (updated !== content) {
				await this.app.vault.modify(file, updated);
			}
		}
		this.rerenderDashboards();
	}

}
