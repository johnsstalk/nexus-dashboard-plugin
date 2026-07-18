import { Editor, MarkdownView, MarkdownFileInfo, Plugin, Notice, TFile, WorkspaceLeaf } from "obsidian";
import { NexusSettings, DEFAULT_SETTINGS, NexusSettingTab } from "./settings";
import { NexusRenderer } from "./renderer";
import { renderFiglet, getFontByName } from "./figlet";

const DASHBOARD_VIEW_TYPE = "nexus-dashboard-view";
const DASHBOARD_NOTE_PATH = "Nexus Dashboard.md";

export default class NexusDashboardPlugin extends Plugin {
	settings: NexusSettings = DEFAULT_SETTINGS;
	activeRenderers: Set<NexusRenderer> = new Set();

	async onload() {
		await this.loadSettings();

		// ── Nexus Dashboard code block ──────────────────────
		this.registerMarkdownCodeBlockProcessor("nexus-dashboard", (source, el, ctx) => {
			const renderer = new NexusRenderer(el, this, source, ctx.sourcePath);
			ctx.addChild(renderer);
		});

		// ── ASCII art code block ────────────────────────────
		this.registerMarkdownCodeBlockProcessor("ascii", (source, el) => {
			this.renderAsciiBlock(source, el);
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
				const insert = "```ascii\n\n```\n";
				editor.replaceRange(insert, cursor);
				editor.setCursor({ line: cursor.line + 1, ch: 0 });
			},
		});

		this.addCommand({
			id: "render-selection-ascii",
			name: "Render selection as ASCII art",
			editorCallback: (editor: Editor, _ctx: MarkdownView | MarkdownFileInfo) => {
				const selection = editor.getSelection();
				if (selection) {
					editor.replaceSelection(` \`\`\`ascii\n${selection}\n\`\`\` `);
				}
			},
		});

		this.addSettingTab(new NexusSettingTab(this.app, this));

		// ── Open on startup ─────────────────────────────────
		if (this.settings.openOnStartup) {
			this.app.workspace.onLayoutReady(() => {
				this.openDashboard();
			});
		}
	}

	onunload() {}

	// ── Dashboard opener ───────────────────────────────────

	async openDashboard(): Promise<void> {
		const { workspace } = this.app;

		// Check if dashboard note already exists
		const existingFile = this.app.vault.getAbstractFileByPath(DASHBOARD_NOTE_PATH);

		if (existingFile instanceof TFile) {
			// Open existing dashboard note
			await workspace.openLinkText(DASHBOARD_NOTE_PATH, "", false);
		} else {
			// Create the dashboard note
			const content = "```nexus-dashboard\n```\n";
			await this.app.vault.create(DASHBOARD_NOTE_PATH, content);
			await workspace.openLinkText(DASHBOARD_NOTE_PATH, "", false);
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

	// ── ASCII block renderer ───────────────────────────────

	private renderAsciiBlock(source: string, containerEl: HTMLElement): void {
		const lines = source.split("\n");
		const params: Record<string, string> = {};
		const textLines: string[] = [];

		for (const line of lines) {
			const trimmed = line.trim();
			const match = trimmed.match(/^(\w+)\s*=\s*(.+)$/);
			if (match && textLines.length === 0) {
				params[match[1].toLowerCase()] = match[2].trim();
			} else if (trimmed !== "") {
				textLines.push(trimmed);
			}
		}

		const text = textLines.join("\n").trim();
		if (!text) {
			const hint = containerEl.createDiv({
				cls: "ascii-header-hint",
				text: "Type text on the next line to render ASCII art",
			});
			hint.style.color = "var(--text-muted)";
			hint.style.fontStyle = "italic";
			hint.style.padding = "8px";
			return;
		}

		const color = params.color ?? this.settings.asciiDefaultColor;
		const parsedSize = params.size ? parseFloat(params.size) : NaN;
		const size = Number.isFinite(parsedSize) ? parsedSize : this.settings.asciiDefaultSize;
		const alignParam = params.align?.toLowerCase();
		const align = (["left", "center", "right"].includes(alignParam) ? alignParam : this.settings.asciiDefaultAlign) as "left" | "center" | "right";
		const fontName = params.font ?? this.settings.asciiDefaultFont;

		const font = getFontByName(fontName);
		const rendered = renderFiglet(text, { font });

		const wrapper = containerEl.createDiv({ cls: "ascii-header-wrapper" });

		const pre = wrapper.createEl("pre", {
			text: rendered,
			cls: "ascii-header-output",
		});

		pre.style.color = color;
		pre.style.fontSize = `${size}em`;
		pre.style.textAlign = align;
		pre.style.lineHeight = "1";
		pre.style.margin = "0";
		pre.style.padding = "16px 0";
		pre.style.overflowX = "auto";
		pre.style.whiteSpace = "pre";
		pre.style.fontFamily = "monospace";
	}
}
