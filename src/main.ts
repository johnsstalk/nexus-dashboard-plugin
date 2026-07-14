import { Editor, MarkdownView, MarkdownFileInfo, Plugin, Notice, TFile, WorkspaceLeaf } from "obsidian";
import { NexusSettings, DEFAULT_SETTINGS, NexusSettingTab } from "./settings";
import { NexusRenderer } from "./renderer";
import { renderFiglet, getFontByName } from "./figlet";

const DASHBOARD_VIEW_TYPE = "nexus-dashboard-view";
const DASHBOARD_NOTE_PATH = "Nexus Dashboard.md";

export default class NexusDashboardPlugin extends Plugin {
	settings: NexusSettings = DEFAULT_SETTINGS;

	async onload() {
		await this.loadSettings();

		// ── Nexus Dashboard code block ──────────────────────
		this.registerMarkdownCodeBlockProcessor("nexus-dashboard", (source, el, ctx) => {
			const renderer = new NexusRenderer(el, this, source);
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
			headerText: data?.headerText ?? DEFAULT_SETTINGS.headerText,
			openOnStartup: data?.openOnStartup ?? DEFAULT_SETTINGS.openOnStartup,
			showGreeting: data?.showGreeting ?? DEFAULT_SETTINGS.showGreeting,
			greetingName: data?.greetingName ?? DEFAULT_SETTINGS.greetingName,
			showToolbar: data?.showToolbar ?? DEFAULT_SETTINGS.showToolbar,
			mocs: data?.mocs ? data.mocs.map((m: any) => ({ ...m })) : DEFAULT_SETTINGS.mocs.map((m) => ({ ...m })),
			stats: data?.stats ? data.stats.map((s: any) => ({ ...s })) : DEFAULT_SETTINGS.stats.map((s) => ({ ...s })),
			showStats: data?.showStats ?? DEFAULT_SETTINGS.showStats,
			showRecently: data?.showRecently ?? DEFAULT_SETTINGS.showRecently,
			recentCount: data?.recentCount ?? DEFAULT_SETTINGS.recentCount,
			excludeFolders: data?.excludeFolders ?? [],
			mocGridColumns: data?.mocGridColumns ?? DEFAULT_SETTINGS.mocGridColumns,
			miniGridColumns: data?.miniGridColumns ?? DEFAULT_SETTINGS.miniGridColumns,
			dividerLabel: data?.dividerLabel ?? DEFAULT_SETTINGS.dividerLabel,
			dividerDesign: data?.dividerDesign ?? { ...DEFAULT_SETTINGS.dividerDesign },
			asciiDefaultFont: data?.asciiDefaultFont ?? DEFAULT_SETTINGS.asciiDefaultFont,
			asciiDefaultColor: data?.asciiDefaultColor ?? DEFAULT_SETTINGS.asciiDefaultColor,
			asciiDefaultSize: data?.asciiDefaultSize ?? DEFAULT_SETTINGS.asciiDefaultSize,
			asciiDefaultAlign: data?.asciiDefaultAlign ?? DEFAULT_SETTINGS.asciiDefaultAlign,
		};
	}

	async saveSettings() {
		await this.saveData(this.settings);
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
		const size = params.size
			? parseFloat(params.size)
			: this.settings.asciiDefaultSize;
		const align =
			(params.align as "left" | "center" | "right") ??
			this.settings.asciiDefaultAlign;
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
