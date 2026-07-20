import { App, PluginSettingTab, Setting, Notice, setIcon, Modal } from "obsidian";
import type NexusDashboardPlugin from "./main";
import { getAvailableFonts, renderFiglet } from "./figlet";
import { ICONS, SMALL_ICONS } from "./icons";

export const ICON_NAMES = Object.keys(ICONS);

export interface MocEntry {
	path: string;
	title: string;
	desc: string;
	icon: string;
}

export interface QuickLinkEntry {
	label: string;
	url: string;
	icon: string;
}

export interface RowLayoutEntry {
	name: string;
	columns: 1 | 2 | 3 | 4;
	proportion: string;
	align: "top" | "center" | "stretch";
}

export interface TabEntry {
	label: string;
}

export interface StatEntry {
	folder: string;
	label: string;
}

export interface DividerDesign {
	gradient: string;
	lineWidth: string;
	labelSize: string;
	labelWeight: string;
	labelColor: string;
	labelSpacing: string;
}

export interface NexusSettings {
	headerText: string;
	openOnStartup: boolean;
	mocs: MocEntry[];
	stats: StatEntry[];
	showStats: boolean;
	showRecently: boolean;
	showGraph: boolean;
	recentCount: number;
	excludeFolders: string[];
	mocGridColumns: number;
	miniGridColumns: number;
	dividerLabel: string;
	dividerDesign: DividerDesign;
	asciiDefaultFont: string;
	asciiDefaultColor: string;
	asciiDefaultSize: number;
	asciiMobileSize: number;
	asciiDefaultAlign: "left" | "center" | "right";
	showSearch: boolean;
	searchDefault: "vault" | "cards";
	recentPath: string;
	recentTags: string;
	quickLinks: QuickLinkEntry[];
	rowSizes: Record<string, string>;
	rowLayouts: RowLayoutEntry[];
	tabs: TabEntry[];
}

export const DEFAULT_MOCS: MocEntry[] = [
	{ path: "MOC/Journal MOC.md", title: "Journal MOC", desc: "Personal reflections & daily logs", icon: "Journal" },
	{ path: "MOC/Knowledge MOC.md", title: "Knowledge MOC", desc: "Learning notes & insights", icon: "Knowledge" },
	{ path: "MOC/Personal MOC.md", title: "Personal MOC", desc: "Goals, habits & self-tracking", icon: "Personal" },
	{ path: "MOC/Projects MOC.md", title: "Projects MOC", desc: "Active work & side quests", icon: "Project" },
	{ path: "MOC/Resources MOC.md", title: "Resources MOC", desc: "Tools, references & bookmarks", icon: "Resources" },
	{ path: "MOC/Tracker Index MOC.md", title: "Tracker Index MOC", desc: "Metrics, streaks & analytics", icon: "Trackers" },
];

export const DEFAULT_STATS: StatEntry[] = [
	{ folder: "", label: "Files" },
	{ folder: "MOC", label: "MOCs" },
	{ folder: "Project", label: "Projects" },
	{ folder: "Knowledge/Tasks & Action Management", label: "Tasks" },
	{ folder: "Journal", label: "Journals" },
];

export const DEFAULT_DIVIDER_DESIGN: DividerDesign = {
	gradient: "linear-gradient(90deg, transparent, var(--background-modifier-border), transparent)",
	lineWidth: "1px",
	labelSize: "0.7rem",
	labelWeight: "600",
	labelColor: "var(--text-muted)",
	labelSpacing: "0.12em",
};

export const DEFAULT_SETTINGS: NexusSettings = {
	headerText: "NEXUS",
	openOnStartup: false,
	mocs: DEFAULT_MOCS,
	stats: DEFAULT_STATS,
	showStats: true,
	showRecently: true,
	showGraph: false,
	recentCount: 9,
	excludeFolders: [],
	mocGridColumns: 2,
	miniGridColumns: 3,
	dividerLabel: "Recently Modified",
	dividerDesign: { ...DEFAULT_DIVIDER_DESIGN },
	asciiDefaultFont: "ANSI Shadow",
	asciiDefaultColor: "#8A5CF6",
	asciiDefaultSize: 1.0,
	asciiMobileSize: 0.5,
	asciiDefaultAlign: "center",
	showSearch: false,
	searchDefault: "vault",
	recentPath: "",
	recentTags: "",
	quickLinks: [],
	rowSizes: {},
	rowLayouts: [],
	tabs: [],
};

function deepCloneDefaults(): NexusSettings {
	return {
		...DEFAULT_SETTINGS,
		mocs: DEFAULT_MOCS.map((m) => ({ ...m })),
		stats: DEFAULT_STATS.map((s) => ({ ...s })),
		dividerDesign: { ...DEFAULT_SETTINGS.dividerDesign },
		quickLinks: DEFAULT_SETTINGS.quickLinks.map((l) => ({ ...l })),
		rowSizes: { ...DEFAULT_SETTINGS.rowSizes },
		rowLayouts: DEFAULT_SETTINGS.rowLayouts.map((r) => ({ ...r })),
		tabs: DEFAULT_SETTINGS.tabs.map((t) => ({ ...t })),
	};
}

function getVaultFolders(app: App): string[] {
	const folders = new Set<string>();
	for (const file of app.vault.getMarkdownFiles()) {
		const parts = file.path.split("/");
		if (parts.length > 1) {
			// Collect every unique folder path
			let current = "";
			for (let i = 0; i < parts.length - 1; i++) {
				current = current ? `${current}/${parts[i]}` : parts[i];
				folders.add(current);
			}
		}
	}
	return Array.from(folders).sort();
}

// ── SVG Icons ──────────────────────────────────────────────────

const SVG = {
	chevronDown: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>`,
};

// ── Divider Presets ────────────────────────────────────────────

export const DIVIDER_PRESETS: Record<string, DividerDesign> = {
	default: { ...DEFAULT_DIVIDER_DESIGN },
	bold: {
		gradient: "linear-gradient(90deg, transparent, var(--interactive-accent), transparent)",
		lineWidth: "2px",
		labelSize: "0.8rem",
		labelWeight: "700",
		labelColor: "var(--interactive-accent)",
		labelSpacing: "0.16em",
	},
	subtle: {
		gradient: "linear-gradient(90deg, transparent, rgba(255,255,255,0.06), transparent)",
		lineWidth: "1px",
		labelSize: "0.65rem",
		labelWeight: "500",
		labelColor: "var(--text-faint)",
		labelSpacing: "0.08em",
	},
	gradient: {
		gradient: "linear-gradient(90deg, var(--interactive-accent), var(--background-modifier-border), var(--interactive-accent))",
		lineWidth: "1px",
		labelSize: "0.7rem",
		labelWeight: "600",
		labelColor: "var(--text-muted)",
		labelSpacing: "0.12em",
	},
	dashed: {
		gradient: "repeating-linear-gradient(90deg, var(--background-modifier-border), var(--background-modifier-border) 4px, transparent 4px, transparent 8px)",
		lineWidth: "1px",
		labelSize: "0.7rem",
		labelWeight: "600",
		labelColor: "var(--text-muted)",
		labelSpacing: "0.12em",
	},
};

const DIVIDER_PRESET_NAMES: Record<string, string> = {
	default: "Default",
	bold: "Bold",
	subtle: "Subtle",
	gradient: "Gradient",
	dashed: "Dashed",
};

function detectDividerPreset(d: DividerDesign): string {
	for (const [key, preset] of Object.entries(DIVIDER_PRESETS)) {
		if (
			d.gradient === preset.gradient &&
			d.lineWidth === preset.lineWidth &&
			d.labelSize === preset.labelSize &&
			d.labelWeight === preset.labelWeight &&
			d.labelColor === preset.labelColor &&
			d.labelSpacing === preset.labelSpacing
		) {
			return key;
		}
	}
	return "default";
}

// ── Confirmation Modal ───────────────────────────────────────

class ConfirmModal extends Modal {
	private title: string;
	private message: string;
	private onConfirm: () => void;

	constructor(app: App, title: string, message: string, onConfirm: () => void) {
		super(app);
		this.title = title;
		this.message = message;
		this.onConfirm = onConfirm;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.createEl("h3", { text: this.title });
		contentEl.createEl("p", { text: this.message });

		const btnRow = contentEl.createDiv({ cls: "modal-button-container" });

		const cancelBtn = btnRow.createEl("button", { text: "Cancel" });
		cancelBtn.addEventListener("click", () => this.close());

		const confirmBtn = btnRow.createEl("button", { text: "Confirm", cls: "mod-warning" });
		confirmBtn.addEventListener("click", () => {
			this.onConfirm();
			this.close();
		});
	}

	onClose(): void {
		this.contentEl.empty();
	}
}

// ── Settings Tab ───────────────────────────────────────────────

interface SettingTab {
	id: string;
	name: string;
	icon: string;
}

const SETTING_TABS: SettingTab[] = [
	{ id: "general", name: "General", icon: "gear" },
	{ id: "header", name: "Header", icon: "type" },
	{ id: "layout", name: "Layout", icon: "layout-grid" },
	{ id: "row-editor", name: "Row Editor", icon: "columns-3" },
	{ id: "recent-links", name: "Recent & Links", icon: "clock" },
];

export class NexusSettingTab extends PluginSettingTab {
	plugin: NexusDashboardPlugin;
	private draggedIndex: number | null = null;
	private activeTab = "general";

	constructor(app: App, plugin: NexusDashboardPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		// Title — centered ASCII art logo
		const titleEl = containerEl.createDiv({ cls: "nexus-settings-title" });
		titleEl.createEl("pre", {
			text: renderFiglet(this.plugin.settings.headerText || "nexus-dashboard"),
			cls: "nexus-settings-logo",
		});

		// ── Tab bar ──────────────────────────────────────
		const tabBar = containerEl.createDiv({ cls: "nexus-settings-tabs" });
		for (const tab of SETTING_TABS) {
			const tabEl = tabBar.createDiv({
				cls: `nexus-settings-tab ${tab.id === this.activeTab ? "active" : ""}`,
			});
			setIcon(tabEl, tab.icon);
			tabEl.createEl("span", { text: tab.name });
			tabEl.addEventListener("click", () => {
				this.activeTab = tab.id;
				this.display();
			});
		}

		// ── Tab content ──────────────────────────────────
		const content = containerEl.createDiv({ cls: "nexus-settings-content" });

		switch (this.activeTab) {
			case "general":
				this.displayGeneralTab(content);
				break;
			case "header":
				this.displayHeaderTab(content);
				break;
			case "layout":
				this.displayLayoutTab(content);
				break;
			case "row-editor":
				this.displayRowEditorTab(content);
				break;
			case "recent-links":
				this.displayRecentLinksTab(content);
				break;
		}
	}

	// ═══════════════════════════════════════════════════════
	//  TAB: General
	// ═══════════════════════════════════════════════════════

	private displayGeneralTab(containerEl: HTMLElement): void {
		new Setting(containerEl)
			.setName("Open on startup")
			.setDesc("Automatically open the dashboard when Obsidian starts")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.openOnStartup)
					.onChange(async (value) => {
						this.plugin.settings.openOnStartup = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Show search bar")
			.setDesc("Show a vault-wide search bar on the dashboard")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.showSearch)
					.onChange(async (value) => {
						this.plugin.settings.showSearch = value;
						await this.plugin.saveSettings();
					})
			);

		// ── Stats ──────────────────────────────────────
		new Setting(containerEl).setHeading().setName("Stats");

		new Setting(containerEl)
			.setName("Show stats bar")
			.setDesc("Toggle stats bar visibility on the dashboard")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.showStats)
					.onChange(async (value) => {
						this.plugin.settings.showStats = value;
						await this.plugin.saveSettings();
					})
			);

		this.plugin.settings.stats.forEach((stat, i) => {
			this.renderStatRow(containerEl, stat, i);
		});

		new Setting(containerEl)
			.setName("Add stat")
			.setDesc("Add a new counter to the stats bar.")
			.addButton((btn) =>
				btn
					.setButtonText("+ Add Stat")
					.setCta()
					.onClick(async () => {
						this.plugin.settings.stats.push({ folder: "", label: "New" });
						await this.plugin.saveSettings();
						this.display();
					})
			);

		// ── Export / Import ─────────────────────────────
		new Setting(containerEl).setHeading().setName("Export / Import");

		new Setting(containerEl)
			.setName("Export settings")
			.setDesc("Download your current settings as a JSON file")
			.addButton((btn) =>
				btn
					.setButtonText("Export")
					.setCta()
					.onClick(() => this.exportSettings())
			);

		new Setting(containerEl)
			.setName("Import settings")
			.setDesc("Load settings from a previously exported JSON file")
			.addButton((btn) =>
				btn
					.setButtonText("Import")
					.setWarning()
					.onClick(() => this.importSettings())
			);

		// ── Reset ──────────────────────────────────────
		new Setting(containerEl).setHeading().setName("Reset");

		new Setting(containerEl)
			.setName("Reset to defaults")
			.setDesc("Restore all MOC cards, stats, and layout to the original defaults.")
			.addButton((btn) =>
				btn
					.setButtonText("Reset all settings")
					.setWarning()
					.onClick(() => {
						new ConfirmModal(
							this.app,
							"Reset all settings?",
							"This will restore all MOC cards, stats, and layout to the original defaults. This cannot be undone.",
							async () => {
								this.plugin.settings = deepCloneDefaults();
								await this.plugin.saveSettings();
								this.display();
							}
						).open();
					})
			);
	}

	// ═══════════════════════════════════════════════════════
	//  TAB: Header
	// ═══════════════════════════════════════════════════════

	private displayHeaderTab(containerEl: HTMLElement): void {
		containerEl.createEl("p", {
			text: "Configure the default appearance of the ASCII art header.",
			cls: "setting-item-description",
		});

		const fonts = getAvailableFonts();

		new Setting(containerEl)
			.setName("Dashboard title")
			.setDesc("Text rendered as the ASCII art header on your dashboard")
			.addText((text) =>
				text
					.setPlaceholder("NEXUS")
					.setValue(this.plugin.settings.headerText)
					.onChange(async (value) => {
						this.plugin.settings.headerText = value || "NEXUS";
						await this.plugin.saveSettings();
						this.updateAsciiPreview();
					})
			);

		new Setting(containerEl)
			.setName("Default font")
			.setDesc("FIGlet font used when no font is specified in the code block")
			.addDropdown((dropdown) => {
				for (const font of fonts) {
					dropdown.addOption(font, font);
				}
				dropdown.setValue(this.plugin.settings.asciiDefaultFont);
				dropdown.onChange(async (value) => {
					this.plugin.settings.asciiDefaultFont = value;
					await this.plugin.saveSettings();
					this.updateAsciiPreview();
				});
			});

		new Setting(containerEl)
			.setName("Default color")
			.setDesc("Default text color (CSS color value)")
			.addText((text) =>
				text
					.setPlaceholder("#8A5CF6")
					.setValue(this.plugin.settings.asciiDefaultColor)
					.onChange(async (value) => {
						this.plugin.settings.asciiDefaultColor = value;
						await this.plugin.saveSettings();
						this.updateAsciiPreview();
					})
			);

		new Setting(containerEl)
			.setName("Default size")
			.setDesc("Desktop font size multiplier (0.3–3.0)")
			.addSlider((slider) => {
				slider
					.setLimits(0.3, 3.0, 0.1)
					.setValue(this.plugin.settings.asciiDefaultSize)
					.setDynamicTooltip()
					.onChange(async (value) => {
						this.plugin.settings.asciiDefaultSize = value;
						await this.plugin.saveSettings();
						this.updateAsciiPreview();
					});
			});

		new Setting(containerEl)
			.setName("Mobile size")
			.setDesc("Mobile font size multiplier (0.3–2.0)")
			.addSlider((slider) => {
				slider
					.setLimits(0.3, 2.0, 0.1)
					.setValue(this.plugin.settings.asciiMobileSize)
					.setDynamicTooltip()
					.onChange(async (value) => {
						this.plugin.settings.asciiMobileSize = value;
						await this.plugin.saveSettings();
						this.updateAsciiPreview();
					});
			});

		new Setting(containerEl)
			.setName("Default alignment")
			.setDesc("Text alignment when no align is specified in the code block")
			.addDropdown((dropdown) => {
				dropdown.addOption("left", "Left");
				dropdown.addOption("center", "Center");
				dropdown.addOption("right", "Right");
				dropdown.setValue(this.plugin.settings.asciiDefaultAlign);
				dropdown.onChange(async (value) => {
					this.plugin.settings.asciiDefaultAlign = value as "left" | "center" | "right";
					await this.plugin.saveSettings();
					this.updateAsciiPreview();
				});
			});

		// Preview
		const previewContainer = containerEl.createDiv({ cls: "nexus-settings-preview" });
		this.renderAsciiPreview(previewContainer);
	}

	// ═══════════════════════════════════════════════════════
	//  TAB: Layout
	// ═══════════════════════════════════════════════════════

	private displayLayoutTab(containerEl: HTMLElement): void {
		new Setting(containerEl)
			.setName("MOC grid columns")
			.setDesc("Number of columns for the MOC card grid")
			.addSlider((slider) =>
				slider
					.setLimits(1, 4, 1)
					.setValue(this.plugin.settings.mocGridColumns)
					.setDynamicTooltip()
					.onChange(async (value) => {
						this.plugin.settings.mocGridColumns = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Recent notes grid columns")
			.setDesc("Number of columns for the recent notes grid")
			.addSlider((slider) =>
				slider
					.setLimits(1, 4, 1)
					.setValue(this.plugin.settings.miniGridColumns)
					.setDynamicTooltip()
					.onChange(async (value) => {
						this.plugin.settings.miniGridColumns = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Show graph links")
			.setDesc("Inject graph wikilinks on empty code blocks (can be overridden per-block)")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.showGraph)
					.onChange(async (value) => {
						this.plugin.settings.showGraph = value;
						await this.plugin.saveSettings();
					})
			);

		// ── MOC Cards ──────────────────────────────────
		new Setting(containerEl).setHeading().setName("MOC cards");
		containerEl.createEl("p", {
			text: "Configure the MOC cards shown on your dashboard.",
			cls: "setting-item-description",
		});

		this.plugin.settings.mocs.forEach((moc, i) => {
			this.renderMocCard(containerEl, moc, i);
		});

		new Setting(containerEl)
			.setName("Add MOC card")
			.setDesc("Add a new card to the dashboard grid.")
			.addButton((btn) =>
				btn
					.setButtonText("+ Add MOC")
					.setCta()
					.onClick(async () => {
						this.plugin.settings.mocs.push({
							path: "MOC/New MOC",
							title: "New MOC",
							desc: "Description here",
							icon: "MOC",
						});
						await this.plugin.saveSettings();
						this.display();
					})
			);

		// ── Tabs builder ───────────────────────────────
		new Setting(containerEl).setHeading().setName("Tabs");
		containerEl.createEl("p", {
			text: "Define tabs for the dashboard (empty code block only). Tabs group content behind clickable buttons.",
			cls: "setting-item-description",
		});

		const tabs = this.plugin.settings.tabs;

		// Visual tab bar preview
		if (tabs.length > 0) {
			const tabPreview = containerEl.createDiv({ cls: "nexus-tabs-preview" });
			tabPreview.createEl("span", { text: "Preview: ", cls: "nexus-tabs-preview-label" });
			const tabBar = tabPreview.createDiv({ cls: "nexus-tabs-preview-bar" });
			for (let i = 0; i < tabs.length; i++) {
				const tabBtn = tabBar.createEl("button", {
					cls: `nexus-tabs-preview-btn ${i === 0 ? "active" : ""}`,
					text: tabs[i].label || `Tab ${i + 1}`,
				});
			}
		}

		// Tab list
		for (let i = 0; i < tabs.length; i++) {
			const tab = tabs[i];
			const setting = new Setting(containerEl);
			setting.setName(tab.label || `Tab ${i + 1}`);
			setting.addText((text) =>
				text
					.setPlaceholder("Tab label")
					.setValue(tab.label)
					.onChange(async (value) => {
						this.plugin.settings.tabs[i].label = value;
						await this.plugin.saveSettings();
					})
			);
			setting.addExtraButton((btn) =>
				btn
					.setIcon("trash")
					.setTooltip("Remove tab")
					.onClick(async () => {
						this.plugin.settings.tabs.splice(i, 1);
						await this.plugin.saveSettings();
						this.display();
					})
			);
		}

		new Setting(containerEl)
			.setName("Add tab")
			.setDesc("Add a new tab to the dashboard")
			.addButton((btn) =>
				btn
					.setButtonText("+ Add Tab")
					.setCta()
					.onClick(async () => {
						this.plugin.settings.tabs.push({ label: `Tab ${tabs.length + 1}` });
						await this.plugin.saveSettings();
						this.display();
					})
			);

		// YAML reference
		if (tabs.length > 0) {
			new Setting(containerEl).setHeading().setName("YAML reference");
			containerEl.createEl("p", {
				text: "Copy this into your code block to use these tabs:",
				cls: "setting-item-description",
			});
			const yamlLines = [`tabs:`];
			for (const tab of tabs) {
				yamlLines.push(`  - label: "${tab.label}"`);
				yamlLines.push(`    blocks: []`);
			}
			const codeEl = containerEl.createEl("pre", { cls: "nexus-settings-code-block" });
			codeEl.createEl("code", { text: yamlLines.join("\n") });
		}
	}

	// ═══════════════════════════════════════════════════════
	//  TAB: Row Editor
	// ═══════════════════════════════════════════════════════

	private displayRowEditorTab(containerEl: HTMLElement): void {
		containerEl.createEl("p", {
			text: "Define reusable row layouts. Each row places content side-by-side in columns. Use these in code blocks to structure your dashboard.",
			cls: "setting-item-description",
		});

		const layouts = this.plugin.settings.rowLayouts;

		// ── Visual preview of all layouts ─────────────────
		if (layouts.length > 0) {
			const previewSection = containerEl.createDiv({ cls: "nexus-row-editor-preview-section" });
			previewSection.createEl("h4", { text: "Layout Preview", cls: "nexus-row-editor-section-title" });

			for (let i = 0; i < layouts.length; i++) {
				this.renderRowLayoutCard(previewSection, layouts[i], i);
			}
		}

		// ── Add layout ───────────────────────────────────
		new Setting(containerEl).setHeading().setName("Add layout");

		new Setting(containerEl)
			.setName("New row layout")
			.setDesc("Create a new row layout template")
			.addButton((btn) =>
				btn
					.setButtonText("+ Add Layout")
					.setCta()
					.onClick(async () => {
						const n = layouts.length + 1;
						layouts.push({
							name: `Layout ${n}`,
							columns: 2,
							proportion: "50/50",
							align: "top",
						});
						await this.plugin.saveSettings();
						this.display();
					})
			);

		// ── YAML reference ────────────────────────────────
		new Setting(containerEl).setHeading().setName("YAML reference");
		containerEl.createEl("p", {
			text: "Use row layouts in code blocks with the row: keyword:",
			cls: "setting-item-description",
		});
		const codeEl = containerEl.createEl("pre", { cls: "nexus-settings-code-block" });
		codeEl.createEl("code", {
			text: `row:\n  - section:\n      columns: 2\n      cards:\n        - label: Left\n          path: Left.md\n  - section:\n      columns: 1\n      cards:\n        - label: Right\n          path: Right.md`,
		});

		// ── Saved row proportions (from drag resize) ──────
		const rowSizes = this.plugin.settings.rowSizes;
		const sizeKeys = Object.keys(rowSizes);
		if (sizeKeys.length > 0) {
			new Setting(containerEl).setHeading().setName("Saved row proportions");
			containerEl.createEl("p", {
				text: "These proportions were saved by dragging column dividers in the dashboard.",
				cls: "setting-item-description",
			});
			for (const key of sizeKeys) {
				const val = rowSizes[key];
				new Setting(containerEl)
					.setName(key)
					.setDesc(`Proportion: ${val}`)
					.addButton((btn) =>
						btn
							.setButtonText("Reset")
							.setWarning()
							.onClick(async () => {
								delete this.plugin.settings.rowSizes[key];
								await this.plugin.saveSettings();
								this.display();
							})
					);
			}
		}
	}

	private renderRowLayoutCard(containerEl: HTMLElement, layout: RowLayoutEntry, index: number): void {
		const card = containerEl.createDiv({ cls: "nexus-row-editor-card" });

		// Header with name + actions
		const header = card.createDiv({ cls: "nexus-row-editor-card-header" });
		const nameEl = header.createEl("span", { text: layout.name, cls: "nexus-row-editor-card-name" });

		const actions = header.createDiv({ cls: "nexus-row-editor-card-actions" });

		// Delete button
		const deleteBtn = actions.createEl("button", { cls: "nexus-row-editor-card-btn" });
		setIcon(deleteBtn, "trash");
		deleteBtn.addEventListener("click", async () => {
			this.plugin.settings.rowLayouts.splice(index, 1);
			await this.plugin.saveSettings();
			this.display();
		});

		// Visual row preview
		const preview = card.createDiv({ cls: "nexus-row-editor-visual" });
		const cols = layout.columns;
		const parts = layout.proportion.split("/").map((s) => parseInt(s.trim(), 10));

		for (let i = 0; i < cols; i++) {
			const colEl = preview.createDiv({ cls: "nexus-row-editor-col" });
			const width = (Number.isFinite(parts[i]) && parts[i]! > 0) ? parts[i]! : Math.floor(100 / cols);
			colEl.style.width = `${width}%`;
			colEl.createEl("span", { text: `${width}%`, cls: "nexus-row-editor-col-label" });
		}

		// Edit fields
		const fields = card.createDiv({ cls: "nexus-row-editor-fields" });

		// Name
		const nameSetting = new Setting(fields);
		nameSetting.setName("Name");
		nameSetting.addText((text) =>
			text
				.setPlaceholder("Layout name")
				.setValue(layout.name)
				.onChange(async (value) => {
					this.plugin.settings.rowLayouts[index].name = value || `Layout ${index + 1}`;
					nameEl.textContent = value || `Layout ${index + 1}`;
					await this.plugin.saveSettings();
				})
		);

		// Columns
		const colSetting = new Setting(fields);
		colSetting.setName("Columns");
		colSetting.addSlider((slider) =>
			slider
				.setLimits(1, 4, 1)
				.setValue(layout.columns)
				.setDynamicTooltip()
				.onChange(async (value) => {
					const newCols = value as 1 | 2 | 3 | 4;
					this.plugin.settings.rowLayouts[index].columns = newCols;
					// Recalculate proportion to match column count
					const part = Math.floor(100 / newCols);
					const newParts: number[] = [];
					for (let j = 0; j < newCols - 1; j++) {
						newParts.push(part);
					}
					newParts.push(100 - part * (newCols - 1));
					const newProp = newParts.join("/");
					this.plugin.settings.rowLayouts[index].proportion = newProp;
					await this.plugin.saveSettings();
					this.display();
				})
		);

		// Proportion
		const propSetting = new Setting(fields);
		propSetting.setName("Proportion");
		propSetting.setDesc("Slash-separated widths (e.g. 33/67 for 1:2)");
		propSetting.addText((text) =>
			text
				.setPlaceholder("50/50")
				.setValue(layout.proportion)
				.onChange(async (value) => {
					this.plugin.settings.rowLayouts[index].proportion = value;
					await this.plugin.saveSettings();
				})
		);

		// Alignment
		const alignSetting = new Setting(fields);
		alignSetting.setName("Vertical align");
		alignSetting.addDropdown((dropdown) => {
			dropdown.addOption("top", "Top");
			dropdown.addOption("center", "Center");
			dropdown.addOption("stretch", "Stretch");
			dropdown.setValue(layout.align);
			dropdown.onChange(async (value) => {
				this.plugin.settings.rowLayouts[index].align = value as "top" | "center" | "stretch";
				await this.plugin.saveSettings();
			});
		});

		// YAML snippet
		const yamlEl = card.createDiv({ cls: "nexus-row-editor-yaml" });
		yamlEl.createEl("span", { text: "YAML", cls: "nexus-row-editor-yaml-label" });
		const proportion = layout.proportion;
		const yamlLines = [`row:`, `  proportion: "${proportion}"`];
		if (layout.align !== "top") {
			yamlLines.push(`  align: ${layout.align}`);
		}
		for (let i = 0; i < layout.columns; i++) {
			yamlLines.push(`  - section:`);
			yamlLines.push(`      columns: 1`);
			yamlLines.push(`      cards: []`);
		}
		yamlEl.createEl("pre", { text: yamlLines.join("\n"), cls: "nexus-settings-code-block" });
	}

	// ═══════════════════════════════════════════════════════
	//  TAB: Recent & Links
	// ═══════════════════════════════════════════════════════

	private displayRecentLinksTab(containerEl: HTMLElement): void {
		// ── Recently Modified ──────────────────────────
		new Setting(containerEl).setHeading().setName("Recently modified");

		new Setting(containerEl)
			.setName("Show recently modified")
			.setDesc("Toggle recently modified notes section on the dashboard")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.showRecently)
					.onChange(async (value) => {
						this.plugin.settings.showRecently = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Number of recent notes")
			.setDesc("How many recently modified notes to show.")
			.addSlider((slider) =>
				slider
					.setLimits(3, 20, 1)
					.setValue(this.plugin.settings.recentCount)
					.setDynamicTooltip()
					.onChange(async (value) => {
						this.plugin.settings.recentCount = value;
						await this.plugin.saveSettings();
					})
			);

		const excludeStr = this.plugin.settings.excludeFolders.join(", ");
		new Setting(containerEl)
			.setName("Exclude folders")
			.setDesc("Comma-separated folder names to hide from recent notes (e.g. Templates, Attachments)")
			.addText((text) =>
				text
					.setPlaceholder("Templates, Attachments")
					.setValue(excludeStr)
					.onChange(async (value) => {
						this.plugin.settings.excludeFolders = value
							.split(",")
							.map((s) => s.trim())
							.filter((s) => s.length > 0);
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Path filter")
			.setDesc("Comma-separated folder paths to include (e.g. Journal, Project). Leave empty for all.")
			.addText((text) =>
				text
					.setPlaceholder("Journal, Project")
					.setValue(this.plugin.settings.recentPath || "")
					.onChange(async (value) => {
						this.plugin.settings.recentPath = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Tag filter")
			.setDesc("Comma-separated tags to include (e.g. draft, wip). Leave empty for all.")
			.addText((text) =>
				text
					.setPlaceholder("draft, wip")
					.setValue(this.plugin.settings.recentTags || "")
					.onChange(async (value) => {
						this.plugin.settings.recentTags = value;
						await this.plugin.saveSettings();
					})
			);

		// ── Divider ────────────────────────────────────
		new Setting(containerEl).setHeading().setName("Divider");

		new Setting(containerEl)
			.setName("Divider label")
			.setDesc("Text shown in the divider above recent notes")
			.addText((text) =>
				text
					.setPlaceholder("Recently Modified")
					.setValue(this.plugin.settings.dividerLabel)
					.onChange(async (value) => {
						this.plugin.settings.dividerLabel = value || "Recently Modified";
						await this.plugin.saveSettings();
					})
			);

		containerEl.createEl("p", {
			text: "Customize the appearance of section dividers.",
			cls: "setting-item-description",
		});

		const currentPreset = detectDividerPreset(this.plugin.settings.dividerDesign);
		new Setting(containerEl)
			.setName("Divider style")
			.setDesc("Choose a divider style preset")
			.addDropdown((dropdown) => {
				for (const [key, name] of Object.entries(DIVIDER_PRESET_NAMES)) {
					dropdown.addOption(key, name);
				}
				dropdown.setValue(currentPreset);
				dropdown.onChange(async (value) => {
					const preset = DIVIDER_PRESETS[value];
					if (preset) {
						this.plugin.settings.dividerDesign = { ...preset };
						await this.plugin.saveSettings();
						this.renderDividerPreview(dividerPreviewEl);
					}
				});
			});

		const dividerPreviewEl = containerEl.createDiv();
		this.renderDividerPreview(dividerPreviewEl);

		// ── Quick Links ────────────────────────────────
		new Setting(containerEl).setHeading().setName("Quick Links");
		containerEl.createEl("p", {
			text: "Configure the quick links shown on the dashboard (empty code block only).",
			cls: "setting-item-description",
		});

		this.plugin.settings.quickLinks.forEach((link, i) => {
			this.renderQuickLink(containerEl, link, i);
		});

		new Setting(containerEl)
			.setName("Add link")
			.setDesc("Add a new quick link to the dashboard.")
			.addButton((btn) =>
				btn
					.setButtonText("+ Add Link")
					.setCta()
					.onClick(async () => {
						this.plugin.settings.quickLinks.push({
							label: "New Link",
							url: "https://example.com",
							icon: "Link",
						});
						await this.plugin.saveSettings();
						this.display();
					})
			);
	}

	// ── Export / Import helpers ──────────────────────────────

	private exportSettings(): void {
		const data = JSON.stringify(this.plugin.settings, null, 2);
		const blob = new Blob([data], { type: "application/json" });
		const url = URL.createObjectURL(blob);
		const a = document.createElement("a");
		a.href = url;
		a.download = "nexus-dashboard-settings.json";
		a.click();
		URL.revokeObjectURL(url);
		new Notice("Settings exported");
	}

	private async importSettings(): Promise<void> {
		const input = document.createElement("input");
		input.type = "file";
		input.accept = ".json";
		input.onchange = async () => {
			const file = input.files?.[0];
			if (!file) return;
			try {
				const text = await file.text();
				const data = JSON.parse(text);
				if (!data || typeof data !== "object" || !Array.isArray(data.mocs) || !Array.isArray(data.stats)) {
					new Notice("Invalid settings file: missing required fields");
					return;
				}
				const validMocs = data.mocs.every(
					(m: any) => m && typeof m.path === "string" && typeof m.title === "string"
				);
				const validStats = data.stats.every(
					(s: any) => s && typeof s.folder === "string" && typeof s.label === "string"
				);
				if (!validMocs || !validStats) {
					new Notice("Invalid settings file: malformed entries");
					return;
				}
				const validKeys = Object.keys(DEFAULT_SETTINGS);
				const filtered: Record<string, any> = {};
				for (const key of validKeys) {
					if (key in data) {
						filtered[key] = data[key];
					}
				}
				Object.assign(this.plugin.settings, filtered);
				await this.plugin.saveSettings();
				this.display();
				new Notice("Settings imported");
			} catch (e) {
				new Notice("Invalid settings file");
			}
		};
		input.click();
	}

	// ── MOC Card with drag-and-drop + color picker ────────────

	renderMocCard(containerEl: HTMLElement, moc: MocEntry, index: number): void {
		const collapsedKey = `nexus_moc_${index}`;
		const isCollapsed = (this as any)[collapsedKey] !== false;

		// Heading bar
		const heading = containerEl.createDiv({ cls: "nexus-settings-moc-heading" });
		heading.draggable = true;
		heading.dataset.mocIndex = String(index);

		// Drag handle
		const dragHandle = heading.createDiv({ cls: "nexus-settings-moc-drag", text: "⋮⋮" });
		dragHandle.draggable = false;

		heading.addEventListener("dragstart", (e) => {
			this.draggedIndex = index;
			heading.classList.add("nexus-dragging");
			e.dataTransfer!.effectAllowed = "move";
		});

		heading.addEventListener("dragend", () => {
			heading.classList.remove("nexus-dragging");
			this.draggedIndex = null;
		});

		heading.addEventListener("dragover", (e) => {
			e.preventDefault();
			e.dataTransfer!.dropEffect = "move";
			heading.classList.add("nexus-drag-over");
		});

		heading.addEventListener("dragleave", () => {
			heading.classList.remove("nexus-drag-over");
		});

		heading.addEventListener("drop", async (e) => {
			e.preventDefault();
			heading.classList.remove("nexus-drag-over");
			if (this.draggedIndex === null || this.draggedIndex === index) return;
			const arr = this.plugin.settings.mocs;
			const [moved] = arr.splice(this.draggedIndex, 1);
			arr.splice(index, 0, moved);
			await this.plugin.saveSettings();
			this.display();
		});

		// Collapse arrow
		const arrow = heading.createDiv({ cls: `nexus-settings-moc-arrow ${isCollapsed ? "collapsed" : ""}` });
		arrow.innerHTML = SVG.chevronDown;

		// Title only
		const titleWrap = heading.createDiv({ cls: "nexus-settings-moc-title" });
		titleWrap.createEl("span", { text: moc.title || "Untitled" });

		// Action buttons
		const actions = heading.createDiv({ cls: "nexus-settings-moc-actions" });

		const removeBtn = actions.createEl("button", { cls: "nexus-settings-moc-btn--delete", attr: { "aria-label": "Remove" } });
		setIcon(removeBtn, "trash");
		removeBtn.addEventListener("click", async (e) => {
			e.stopPropagation();
			new ConfirmModal(
				this.app,
				`Remove "${moc.title}"?`,
				"This MOC card will be removed from the dashboard. You can add it back later.",
				async () => {
					this.plugin.settings.mocs.splice(index, 1);
					await this.plugin.saveSettings();
					this.display();
				}
			).open();
		});

		// Toggle collapse
		heading.addEventListener("click", () => {
			(this as any)[collapsedKey] = isCollapsed ? false : true;
			this.display();
		});

		if (isCollapsed) return;

		// Expanded fields
		const notePathSetting = new Setting(containerEl)
			.setName("Note path")
			.setDesc("Vault path to the MOC note");

		const notePathDatalistId = `nexus-note-paths-${index}`;
		const notePathInput = notePathSetting.settingEl.createEl("input", {
			cls: "nexus-note-path-input",
			attr: {
				type: "text",
				placeholder: "MOC/My MOC",
				value: moc.path,
				list: notePathDatalistId,
			},
		});
		notePathInput.addEventListener("change", async () => {
			this.plugin.settings.mocs[index].path = notePathInput.value;
			await this.plugin.saveSettings();
		});

		const datalist = notePathSetting.settingEl.createEl("datalist", { attr: { id: notePathDatalistId } });
		const mdFiles = this.app.vault.getMarkdownFiles();
		for (const file of mdFiles) {
			datalist.createEl("option", { attr: { value: file.path } });
		}

		new Setting(containerEl)
			.setName("Title")
			.setDesc("Display title on the card")
			.addText((text) =>
				text
					.setPlaceholder("My MOC")
					.setValue(moc.title)
					.onChange(async (value) => {
						this.plugin.settings.mocs[index].title = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Description")
			.setDesc("Short description below the title")
			.addText((text) =>
				text
					.setPlaceholder("Description here")
					.setValue(moc.desc)
					.onChange(async (value) => {
						this.plugin.settings.mocs[index].desc = value;
						await this.plugin.saveSettings();
					})
			);

		// ── Icon picker (searchable with live preview) ──────
		const iconSetting = new Setting(containerEl)
			.setName("Icon")
			.setDesc("Type to search, click to select");

		const iconWrapper = iconSetting.settingEl.createDiv({ cls: "nexus-icon-picker-wrapper" });

		// Current icon preview + input row
		const iconRow = iconWrapper.createDiv({ cls: "nexus-icon-picker-row" });

		const iconPreview = iconRow.createDiv({ cls: "nexus-icon-picker-preview" });
		iconPreview.innerHTML = SMALL_ICONS[moc.icon] || SMALL_ICONS["MOC"] || "";

		const iconInput = iconRow.createEl("input", {
			cls: "nexus-icon-picker-input",
			attr: { type: "text", placeholder: "Search icons..." },
		});
		iconInput.value = moc.icon;

		// Icon grid (hidden by default, shown on focus)
		const iconGrid = iconWrapper.createDiv({ cls: "nexus-icon-picker-grid" });

		const renderIconGrid = (filter: string) => {
			iconGrid.empty();
			const lower = filter.toLowerCase();
			const matches = ICON_NAMES.filter((name) => name.toLowerCase().includes(lower));

			for (const name of matches) {
				const btn = iconGrid.createDiv({ cls: "nexus-icon-picker-item" });
				if (name === moc.icon) btn.classList.add("nexus-icon-picker-item-active");
				btn.innerHTML = SMALL_ICONS[name] || "";
				btn.createEl("span", { text: name, cls: "nexus-icon-picker-label" });
				btn.addEventListener("click", async () => {
					iconInput.value = name;
					iconPreview.innerHTML = SMALL_ICONS[name] || SMALL_ICONS["MOC"] || "";
					this.plugin.settings.mocs[index].icon = name;
					await this.plugin.saveSettings();
					// Update active state
					iconGrid.querySelectorAll(".nexus-icon-picker-item").forEach((el) =>
						el.classList.remove("nexus-icon-picker-item-active")
					);
					btn.classList.add("nexus-icon-picker-item-active");
				});
			}

			if (matches.length === 0) {
				iconGrid.createEl("div", {
					text: "No icons found",
					cls: "nexus-icon-picker-empty",
				});
			}
		};

		renderIconGrid("");

		iconInput.addEventListener("input", () => {
			renderIconGrid(iconInput.value);
		});

		iconInput.addEventListener("focus", () => {
			iconGrid.classList.add("nexus-icon-picker-grid-open");
			renderIconGrid(iconInput.value);
		});

		iconInput.addEventListener("blur", () => {
			// Delay to allow click on grid item
			setTimeout(() => {
				iconGrid.classList.remove("nexus-icon-picker-grid-open");
			}, 200);
		});

		iconInput.addEventListener("keydown", (e) => {
			if (e.key === "Escape") {
				iconInput.blur();
			}
		});
	}

	// ── ASCII Preview ──────────────────────────────────────────

	private updateAsciiPreview(): void {
		const previewContainer = this.containerEl.querySelector(".nexus-settings-preview");
		if (previewContainer) {
			previewContainer.empty();
			this.renderAsciiPreview(previewContainer as HTMLElement);
		}
	}

	private renderAsciiPreview(container: HTMLElement): void {
		const preview = renderFiglet(this.plugin.settings.headerText || "PREVIEW");
		const pre = container.createEl("pre", { text: preview, cls: "ascii-header-preview" });
		pre.style.color = this.plugin.settings.asciiDefaultColor;
		pre.style.setProperty("--nexus-ascii-size", String(this.plugin.settings.asciiDefaultSize));
		pre.style.textAlign = this.plugin.settings.asciiDefaultAlign;
		pre.style.overflowX = "auto";
		pre.style.fontFamily = "monospace";
		pre.style.lineHeight = "1";
	}

	// ── Stats row ──────────────────────────────────────────────

	renderStatRow(containerEl: HTMLElement, stat: StatEntry, index: number): void {
		const folders = getVaultFolders(this.app);
		if (stat.folder && !folders.includes(stat.folder)) {
			folders.push(stat.folder);
			folders.sort();
		}

		const setting = new Setting(containerEl);

		setting.setName(stat.label);
		setting.addDropdown((dropdown) => {
			dropdown.addOption("", "All files");
			for (const f of folders) {
				dropdown.addOption(f, f);
			}
			dropdown.setValue(stat.folder);
			dropdown.onChange(async (value) => {
				this.plugin.settings.stats[index].folder = value;
				await this.plugin.saveSettings();
				this.display();
			});
		});
		setting.addExtraButton((btn) =>
			btn
				.setIcon("trash")
				.setTooltip("Remove")
				.onClick(async () => {
					this.plugin.settings.stats.splice(index, 1);
					await this.plugin.saveSettings();
					this.display();
				})
		);
	}

	// ── Divider preview ───────────────────────────────────────

	private renderDividerPreview(containerEl: HTMLElement): void {
		const existing = containerEl.querySelector(".nexus-settings-divider-preview");
		if (existing) existing.remove();

		const d = this.plugin.settings.dividerDesign;
		const preview = containerEl.createDiv({ cls: "nexus-settings-divider-preview" });
		const row = preview.createDiv({ cls: "nexus-settings-divider-preview-row" });

		const lineLeft = row.createDiv({ cls: "nexus-settings-divider-preview-line" });
		lineLeft.style.background = d.gradient;
		lineLeft.style.height = d.lineWidth;

		const label = row.createEl("span", { cls: "nexus-settings-divider-preview-label", text: this.plugin.settings.dividerLabel || "Recently Modified" });
		label.style.fontSize = d.labelSize;
		label.style.fontWeight = d.labelWeight;
		label.style.color = d.labelColor;
		label.style.letterSpacing = d.labelSpacing;

		const lineRight = row.createDiv({ cls: "nexus-settings-divider-preview-line" });
		lineRight.style.background = d.gradient;
		lineRight.style.height = d.lineWidth;
	}

	// ── Quick Link ─────────────────────────────────────────

	renderQuickLink(containerEl: HTMLElement, link: QuickLinkEntry, index: number): void {
		const setting = new Setting(containerEl);

		setting.setName(link.label || "Untitled");
		setting.addText((text) =>
			text
				.setPlaceholder("Label")
				.setValue(link.label)
				.onChange(async (value) => {
					this.plugin.settings.quickLinks[index].label = value;
					await this.plugin.saveSettings();
				})
		);
		setting.addText((text) =>
			text
				.setPlaceholder("URL")
				.setValue(link.url)
				.onChange(async (value) => {
					this.plugin.settings.quickLinks[index].url = value;
					await this.plugin.saveSettings();
				})
		);
		setting.addExtraButton((btn) =>
			btn
				.setIcon("trash")
				.setTooltip("Remove")
				.onClick(async () => {
					this.plugin.settings.quickLinks.splice(index, 1);
					await this.plugin.saveSettings();
					this.display();
				})
		);
	}
}
