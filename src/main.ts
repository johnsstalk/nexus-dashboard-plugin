import {
	Editor,
	MarkdownView,
	MarkdownFileInfo,
	Plugin,
	Notice,
	TFile,
	TAbstractFile,
} from "obsidian";
import { NexusSettings } from "./types";
import { DEFAULT_SETTINGS } from "./defaults";
import { hasExtension, ensureExtension, splitCsv } from "./utils";
import { NexusSettingTab } from "./settings";
import { NexusRenderer } from "./renderer";

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
				const oldPathLower = oldPath.toLowerCase();
				const newPath = file.path;

				// Update settings MOCs
				for (const moc of this.settings.mocs) {
					if (moc.path.toLowerCase() === oldPathLower) moc.path = newPath;
				}
				this.saveData(this.settings);

				// Update paths inside nexus-dashboard code blocks in all vault notes
				this.updateCodeBlockPaths(oldPath, newPath);
			}),
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
		try {
			const data = await this.loadData();
			this.settings = {
				headerText:
					typeof data?.headerText === "string" ? data.headerText : DEFAULT_SETTINGS.headerText,
				openOnStartup:
					typeof data?.openOnStartup === "boolean" ? data.openOnStartup : DEFAULT_SETTINGS.openOnStartup,
				mocs:
					data?.mocs && Array.isArray(data.mocs)
						? data.mocs.map((m: Record<string, unknown>) => ({ ...m }))
						: DEFAULT_SETTINGS.mocs.map((m) => ({ ...m })),
				stats:
					data?.stats && Array.isArray(data.stats)
						? data.stats.map((s: Record<string, unknown>) => ({ ...s }))
						: DEFAULT_SETTINGS.stats.map((s) => ({ ...s })),
				showStats: typeof data?.showStats === "boolean" ? data.showStats : DEFAULT_SETTINGS.showStats,
				showGraph: typeof data?.showGraph === "boolean" ? data.showGraph : DEFAULT_SETTINGS.showGraph,
			excludeFolders: Array.isArray(data?.excludeFolders)
				? data.excludeFolders
				: typeof data?.excludeFolders === "string"
					? splitCsv(data.excludeFolders)
					: [],
				mocGridColumns:
					typeof data?.mocGridColumns === "number"
						? data.mocGridColumns
						: DEFAULT_SETTINGS.mocGridColumns,
				miniGridColumns:
					typeof data?.miniGridColumns === "number"
						? data.miniGridColumns
						: DEFAULT_SETTINGS.miniGridColumns,
				dividerDesign:
					data?.dividerDesign && typeof data.dividerDesign === "object"
						? { ...DEFAULT_SETTINGS.dividerDesign, ...data.dividerDesign }
						: { ...DEFAULT_SETTINGS.dividerDesign },
				asciiDefaultFont:
					typeof data?.asciiDefaultFont === "string"
						? data.asciiDefaultFont
						: DEFAULT_SETTINGS.asciiDefaultFont,
				asciiDefaultColor:
					typeof data?.asciiDefaultColor === "string"
						? data.asciiDefaultColor
						: DEFAULT_SETTINGS.asciiDefaultColor,
				asciiDefaultSize:
					typeof data?.asciiDefaultSize === "number"
						? data.asciiDefaultSize
						: DEFAULT_SETTINGS.asciiDefaultSize,
				asciiMobileSize:
					typeof data?.asciiMobileSize === "number"
						? data.asciiMobileSize
						: DEFAULT_SETTINGS.asciiMobileSize,
				asciiDefaultAlign:
					typeof data?.asciiDefaultAlign === "string"
						? data.asciiDefaultAlign
						: DEFAULT_SETTINGS.asciiDefaultAlign,
				showSearch:
					typeof data?.showSearch === "boolean" ? data.showSearch : DEFAULT_SETTINGS.showSearch,
				searchDefault:
					typeof data?.searchDefault === "string" ? data.searchDefault : DEFAULT_SETTINGS.searchDefault,
				quickLinks:
					data?.quickLinks && Array.isArray(data.quickLinks)
						? data.quickLinks.map((l: Record<string, unknown>) => ({ ...l }))
						: DEFAULT_SETTINGS.quickLinks.map((l) => ({ ...l })),
				vaultLists:
					data?.vaultLists && Array.isArray(data.vaultLists)
						? data.vaultLists.map((v: Record<string, unknown>) => ({ ...v }))
						: DEFAULT_SETTINGS.vaultLists.map((v) => ({ ...v })),
				rowSizes: data?.rowSizes && typeof data.rowSizes === "object" ? { ...data.rowSizes } : {},
				rowLayouts:
					data?.rowLayouts && Array.isArray(data.rowLayouts)
						? data.rowLayouts.map((r: Record<string, unknown>) => ({ ...r }))
						: [],
				columnLayouts:
					data?.columnLayouts && Array.isArray(data.columnLayouts)
						? data.columnLayouts.map((s: Record<string, unknown>) => ({ ...s }))
						: [],
				showQuickLinksDivider:
					typeof data?.showQuickLinksDivider === "boolean"
						? data.showQuickLinksDivider
						: DEFAULT_SETTINGS.showQuickLinksDivider,
				quickLinksDividerLabel:
					typeof data?.quickLinksDividerLabel === "string"
						? data.quickLinksDividerLabel
						: DEFAULT_SETTINGS.quickLinksDividerLabel,
				showHeader:
					typeof data?.showHeader === "boolean" ? data.showHeader : DEFAULT_SETTINGS.showHeader,
				showMocCards:
					typeof data?.showMocCards === "boolean" ? data.showMocCards : DEFAULT_SETTINGS.showMocCards,
				showMocDivider:
					typeof data?.showMocDivider === "boolean"
						? data.showMocDivider
						: DEFAULT_SETTINGS.showMocDivider,
				mocDividerLabel:
					typeof data?.mocDividerLabel === "string"
						? data.mocDividerLabel
						: DEFAULT_SETTINGS.mocDividerLabel,
				showQuickLinks:
					typeof data?.showQuickLinks === "boolean"
						? data.showQuickLinks
						: DEFAULT_SETTINGS.showQuickLinks,
				showHeatmap:
					typeof data?.showHeatmap === "boolean" ? data.showHeatmap : DEFAULT_SETTINGS.showHeatmap,
				heatmapWeeks:
					typeof data?.heatmapWeeks === "number" ? data.heatmapWeeks : DEFAULT_SETTINGS.heatmapWeeks,
				heatmapLabel:
					typeof data?.heatmapLabel === "string" ? data.heatmapLabel : DEFAULT_SETTINGS.heatmapLabel,
				showActivityTimeline:
					typeof data?.showActivityTimeline === "boolean"
						? data.showActivityTimeline
						: DEFAULT_SETTINGS.showActivityTimeline,
				activityTimelineCount:
					typeof data?.activityTimelineCount === "number"
						? data.activityTimelineCount
						: DEFAULT_SETTINGS.activityTimelineCount,
				activityTimelineLabel:
					typeof data?.activityTimelineLabel === "string"
						? data.activityTimelineLabel
						: DEFAULT_SETTINGS.activityTimelineLabel,
				showClock: typeof data?.showClock === "boolean" ? data.showClock : DEFAULT_SETTINGS.showClock,
				clockTimezone:
					typeof data?.clockTimezone === "string" ? data.clockTimezone : DEFAULT_SETTINGS.clockTimezone,
				clockShowDate:
					typeof data?.clockShowDate === "boolean" ? data.clockShowDate : DEFAULT_SETTINGS.clockShowDate,
				clockShowSeconds:
					typeof data?.clockShowSeconds === "boolean"
						? data.clockShowSeconds
						: DEFAULT_SETTINGS.clockShowSeconds,
				clockFormat:
					typeof data?.clockFormat === "string" ? data.clockFormat : DEFAULT_SETTINGS.clockFormat,
				clockLabel:
					typeof data?.clockLabel === "string" ? data.clockLabel : DEFAULT_SETTINGS.clockLabel,
				showFileTypeChart:
					typeof data?.showFileTypeChart === "boolean"
						? data.showFileTypeChart
						: DEFAULT_SETTINGS.showFileTypeChart,
				fileTypeChartMax:
					typeof data?.fileTypeChartMax === "number"
						? data.fileTypeChartMax
						: DEFAULT_SETTINGS.fileTypeChartMax,
				fileTypeChartLabel:
					typeof data?.fileTypeChartLabel === "string"
						? data.fileTypeChartLabel
						: DEFAULT_SETTINGS.fileTypeChartLabel,
				showVaultActivity:
					typeof data?.showVaultActivity === "boolean"
						? data.showVaultActivity
						: DEFAULT_SETTINGS.showVaultActivity,
				vaultActivityCount:
					typeof data?.vaultActivityCount === "number"
						? data.vaultActivityCount
						: DEFAULT_SETTINGS.vaultActivityCount,
				vaultActivityPath:
					typeof data?.vaultActivityPath === "string"
						? data.vaultActivityPath
						: DEFAULT_SETTINGS.vaultActivityPath,
				vaultActivityTags:
					typeof data?.vaultActivityTags === "string"
						? data.vaultActivityTags
						: DEFAULT_SETTINGS.vaultActivityTags,
				vaultActivityLabel:
					typeof data?.vaultActivityLabel === "string"
						? data.vaultActivityLabel
						: DEFAULT_SETTINGS.vaultActivityLabel,
			};
		} catch {
			this.settings = { ...DEFAULT_SETTINGS };
		}
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
