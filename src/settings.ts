import { App, PluginSettingTab, Setting, Notice } from "obsidian";
import type NexusDashboardPlugin from "./main";
import { getAvailableFonts, renderFiglet } from "./figlet";
import { LayoutPreset, LAYOUT_PRESETS } from "./types";

export const ICON_NAMES = ["Journal", "Knowledge", "Personal", "Project", "Resources", "Trackers", "MOC", "Media"];

export interface MocEntry {
	path: string;
	title: string;
	desc: string;
	icon: string;
	color?: string;
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
	showGreeting: boolean;
	greetingName: string;
	showToolbar: boolean;
	mocs: MocEntry[];
	stats: StatEntry[];
	showStats: boolean;
	showRecently: boolean;
	recentCount: number;
	excludeFolders: string[];
	mocGridColumns: number;
	miniGridColumns: number;
	layoutPreset: LayoutPreset;
	dividerLabel: string;
	dividerDesign: DividerDesign;
	asciiDefaultFont: string;
	asciiDefaultColor: string;
	asciiDefaultSize: number;
	asciiDefaultAlign: "left" | "center" | "right";
}

export const DEFAULT_MOCS: MocEntry[] = [
	{ path: "MOC/Journal MOC", title: "Journal MOC", desc: "Personal reflections & daily logs", icon: "Journal" },
	{ path: "MOC/Knowledge MOC", title: "Knowledge MOC", desc: "Learning notes & insights", icon: "Knowledge" },
	{ path: "MOC/Personal MOC", title: "Personal MOC", desc: "Goals, habits & self-tracking", icon: "Personal" },
	{ path: "MOC/Projects MOC", title: "Projects MOC", desc: "Active work & side quests", icon: "Project" },
	{ path: "MOC/Resources MOC", title: "Resources MOC", desc: "Tools, references & bookmarks", icon: "Resources" },
	{ path: "MOC/Tracker Index MOC", title: "Tracker Index MOC", desc: "Metrics, streaks & analytics", icon: "Trackers" },
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
	showGreeting: true,
	greetingName: "",
	showToolbar: true,
	mocs: DEFAULT_MOCS,
	stats: DEFAULT_STATS,
	showStats: true,
	showRecently: true,
	recentCount: 9,
	excludeFolders: [],
	mocGridColumns: 2,
	miniGridColumns: 3,
	layoutPreset: "2col",
	dividerLabel: "Recently Modified",
	dividerDesign: { ...DEFAULT_DIVIDER_DESIGN },
	asciiDefaultFont: "ANSI Shadow",
	asciiDefaultColor: "#8A5CF6",
	asciiDefaultSize: 1.0,
	asciiDefaultAlign: "center",
};

function deepCloneDefaults(): NexusSettings {
	return {
		...DEFAULT_SETTINGS,
		mocs: DEFAULT_MOCS.map((m) => ({ ...m })),
		stats: DEFAULT_STATS.map((s) => ({ ...s })),
		dividerDesign: { ...DEFAULT_SETTINGS.dividerDesign },
	};
}

function getVaultFolders(app: App): string[] {
	const folders = new Set<string>();
	for (const file of app.vault.getMarkdownFiles()) {
		const parts = file.path.split("/");
		if (parts.length > 1) {
			folders.add(parts[0]);
		}
	}
	return Array.from(folders).sort();
}

// ── SVG Icons ──────────────────────────────────────────────────

const SVG = {
	chevronDown: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>`,
	chevronRight: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>`,
	chevronUp: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m18 15-6-6-6 6"/></svg>`,
	x: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>`,
	trash: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>`,
	layout: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><path d="M3 9h18"/><path d="M9 21V9"/></svg>`,
	nexus: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16v16H4z"/><path d="M4 12h16"/><path d="M12 4v16"/></svg>`,
};

// ── Divider Presets ────────────────────────────────────────────

const DIVIDER_PRESETS: Record<string, DividerDesign> = {
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

// ── Settings Tab ───────────────────────────────────────────────

export class NexusSettingTab extends PluginSettingTab {
	plugin: NexusDashboardPlugin;
	private advancedOpen = false;
	private draggedIndex: number | null = null;

	constructor(app: App, plugin: NexusDashboardPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		// Title
		const titleEl = containerEl.createDiv({ cls: "nexus-settings-title" });
		titleEl.innerHTML = SVG.nexus;
		titleEl.createEl("span", { text: "Nexus Dashboard" });
		containerEl.createEl("p", { text: "Configure your dashboard, ASCII headers, stats, and layout.", cls: "nexus-settings-subtitle" });

		// ── General section ──────────────────────────────
		new Setting(containerEl).setHeading().setName("General");

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
			.setName("Show greeting")
			.setDesc("Display a time-aware greeting above the header")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.showGreeting)
					.onChange(async (value) => {
						this.plugin.settings.showGreeting = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Greeting name")
			.setDesc("Name shown in the greeting (leave empty to omit)")
			.addText((text) =>
				text
					.setPlaceholder("Alex")
					.setValue(this.plugin.settings.greetingName)
					.onChange(async (value) => {
						this.plugin.settings.greetingName = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Show toolbar")
			.setDesc("Display quick action buttons below the header")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.showToolbar)
					.onChange(async (value) => {
						this.plugin.settings.showToolbar = value;
						await this.plugin.saveSettings();
					})
			);

		// ── Layout section ───────────────────────────────
		new Setting(containerEl).setHeading().setName("Layout");

		new Setting(containerEl)
			.setName("Layout preset")
			.setDesc("Choose a grid layout preset")
			.addDropdown((dropdown) => {
				for (const [key, preset] of Object.entries(LAYOUT_PRESETS)) {
					dropdown.addOption(key, preset.label);
				}
				dropdown.setValue(this.plugin.settings.layoutPreset);
				dropdown.onChange(async (value) => {
					const preset = LAYOUT_PRESETS[value as LayoutPreset];
					if (preset) {
						this.plugin.settings.layoutPreset = value as LayoutPreset;
						this.plugin.settings.mocGridColumns = preset.mocGridColumns;
						this.plugin.settings.miniGridColumns = preset.miniGridColumns;
						await this.plugin.saveSettings();
					}
				});
			});

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

		// ── ASCII Header section ──────────────────────────
		new Setting(containerEl).setHeading().setName("ASCII header");
		containerEl.createEl("p", {
			text: "Configure the default appearance of ```ascii code blocks.",
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
			.setDesc("Default font size multiplier (0.5 = half, 1.0 = normal, 2.0 = double)")
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

		// ── MOC Cards section ─────────────────────────────
		new Setting(containerEl).setHeading().setName("MOC cards");
		containerEl.createEl("p", {
			text: "Configure the cards shown on your dashboard.",
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

		// ── Stats section ─────────────────────────────────
		new Setting(containerEl).setHeading().setName("Stats bar");
		containerEl.createEl("p", {
			text: "Configure which folder counts appear in the stats bar.",
			cls: "setting-item-description",
		});

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

		// ── Recently Modified section ─────────────────────
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

		// ── Divider Design section ────────────────────────
		new Setting(containerEl).setHeading().setName("Divider design");
		containerEl.createEl("p", {
			text: "Customize the appearance of section dividers.",
			cls: "setting-item-description",
		});

		const currentPreset = detectDividerPreset(this.plugin.settings.dividerDesign);
		new Setting(containerEl)
			.setName("Style")
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
						this.renderDividerPreview(containerEl);
						this.renderDividerAdvanced(containerEl);
					}
				});
			});

		this.renderDividerPreview(containerEl);

		const advancedToggle = containerEl.createEl("button", { cls: `nexus-settings-advanced-toggle ${this.advancedOpen ? "expanded" : ""}` });
		advancedToggle.innerHTML = `${SVG.chevronRight}<span>Advanced CSS</span>`;
		advancedToggle.addEventListener("click", () => {
			this.advancedOpen = !this.advancedOpen;
			this.display();
		});

		if (this.advancedOpen) {
			this.renderDividerAdvanced(containerEl);
		}

		// ── Export / Import section ────────────────────────
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

		// ── Reset section ─────────────────────────────────
		new Setting(containerEl).setHeading().setName("Reset");

		new Setting(containerEl)
			.setName("Reset to defaults")
			.setDesc("Restore all MOC cards, stats, and layout to the original defaults.")
			.addButton((btn) =>
				btn
					.setButtonText("Reset all settings")
					.setWarning()
					.onClick(async () => {
						this.plugin.settings = deepCloneDefaults();
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
		const total = this.plugin.settings.mocs.length;
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

		// Title + path
		const titleWrap = heading.createDiv({ cls: "nexus-settings-moc-title" });
		titleWrap.createEl("span", { text: moc.title || "Untitled" });
		titleWrap.createEl("span", { cls: "nexus-settings-moc-title-sep", text: " — " });
		titleWrap.createEl("span", { cls: "nexus-settings-moc-path", text: moc.path });

		// Action buttons
		const actions = heading.createDiv({ cls: "nexus-settings-moc-actions" });

		const upBtn = this.renderMocBtn(actions, SVG.chevronUp, "", "Move up", index === 0);
		upBtn.addEventListener("click", async (e) => {
			e.stopPropagation();
			if (index > 0) {
				const arr = this.plugin.settings.mocs;
				[arr[index - 1], arr[index]] = [arr[index], arr[index - 1]];
				await this.plugin.saveSettings();
				this.display();
			}
		});

		const downBtn = this.renderMocBtn(actions, SVG.chevronDown, "", "Move down", index === total - 1);
		downBtn.addEventListener("click", async (e) => {
			e.stopPropagation();
			const arr = this.plugin.settings.mocs;
			if (index < arr.length - 1) {
				[arr[index], arr[index + 1]] = [arr[index + 1], arr[index]];
				await this.plugin.saveSettings();
				this.display();
			}
		});

		const removeBtn = this.renderMocBtn(actions, SVG.trash, "nexus-settings-moc-btn--delete", "Remove");
		removeBtn.addEventListener("click", async (e) => {
			e.stopPropagation();
			this.plugin.settings.mocs.splice(index, 1);
			await this.plugin.saveSettings();
			this.display();
		});

		// Toggle collapse
		heading.addEventListener("click", () => {
			(this as any)[collapsedKey] = isCollapsed ? false : true;
			this.display();
		});

		if (isCollapsed) return;

		// Expanded fields
		new Setting(containerEl)
			.setName("Note path")
			.setDesc("Vault path to the MOC note")
			.addText((text) =>
				text
					.setPlaceholder("MOC/My MOC")
					.setValue(moc.path)
					.onChange(async (value) => {
						this.plugin.settings.mocs[index].path = value;
						await this.plugin.saveSettings();
					})
			);

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

		new Setting(containerEl)
			.setName("Icon")
			.setDesc("Choose the card icon")
			.addDropdown((dropdown) => {
				for (const name of ICON_NAMES) {
					dropdown.addOption(name, name);
				}
				dropdown.setValue(ICON_NAMES.includes(moc.icon) ? moc.icon : "MOC");
				dropdown.onChange(async (value) => {
					this.plugin.settings.mocs[index].icon = value;
					await this.plugin.saveSettings();
				});
			});

		new Setting(containerEl)
			.setName("Accent color")
			.setDesc("Left border accent color (CSS color value)")
			.addText((text) =>
				text
					.setPlaceholder("#8A5CF6")
					.setValue(moc.color || "")
					.onChange(async (value) => {
						this.plugin.settings.mocs[index].color = value || undefined;
						await this.plugin.saveSettings();
					})
			);
	}

	// ── Helper: MOC button ────────────────────────────────────

	private renderMocBtn(parent: HTMLElement, svg: string, className: string, tooltip: string, disabled = false): HTMLButtonElement {
		const btn = parent.createEl("button", { cls: `nexus-settings-moc-btn ${className}`, attr: { "aria-label": tooltip } });
		btn.innerHTML = svg;
		btn.disabled = disabled;
		btn.setAttr("aria-label", tooltip);
		return btn;
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
		pre.style.fontSize = `${this.plugin.settings.asciiDefaultSize}em`;
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

		setting.setName(`Stat ${index + 1}`);
		setting.addDropdown((dropdown) => {
			dropdown.addOption("", "\u2014 All files (no folder filter) \u2014");
			for (const f of folders) {
				dropdown.addOption(f, f);
			}
			dropdown.setValue(stat.folder);
			dropdown.onChange(async (value) => {
				this.plugin.settings.stats[index].folder = value;
				await this.plugin.saveSettings();
			});
		});
		setting.addText((text) =>
			text
				.setPlaceholder("Label")
				.setValue(stat.label)
				.onChange(async (value) => {
					this.plugin.settings.stats[index].label = value;
					await this.plugin.saveSettings();
				})
		);
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

	// ── Divider preview & advanced ─────────────────────────────

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

	private renderDividerAdvanced(containerEl: HTMLElement): void {
		const existing = containerEl.querySelector(".nexus-settings-advanced-body");
		if (existing) existing.remove();

		const d = this.plugin.settings.dividerDesign;
		const body = containerEl.createDiv({ cls: "nexus-settings-advanced-body" });

		new Setting(body)
			.setName("Line gradient")
			.setDesc("CSS gradient for the divider lines")
			.addText((text) =>
				text
					.setPlaceholder("linear-gradient(90deg, transparent, var(--background-modifier-border), transparent)")
					.setValue(d.gradient)
					.onChange(async (value) => {
						this.plugin.settings.dividerDesign.gradient = value;
						await this.plugin.saveSettings();
						this.renderDividerPreview(containerEl);
					})
			);

		new Setting(body)
			.setName("Line width")
			.setDesc("Height of the divider line (e.g. 1px, 2px)")
			.addText((text) =>
				text
					.setPlaceholder("1px")
					.setValue(d.lineWidth)
					.onChange(async (value) => {
						this.plugin.settings.dividerDesign.lineWidth = value;
						await this.plugin.saveSettings();
						this.renderDividerPreview(containerEl);
					})
			);

		new Setting(body)
			.setName("Label font size")
			.setDesc("Font size of the divider label (e.g. 0.7rem)")
			.addText((text) =>
				text
					.setPlaceholder("0.7rem")
					.setValue(d.labelSize)
					.onChange(async (value) => {
						this.plugin.settings.dividerDesign.labelSize = value;
						await this.plugin.saveSettings();
						this.renderDividerPreview(containerEl);
					})
			);

		new Setting(body)
			.setName("Label font weight")
			.setDesc("Font weight of the divider label (e.g. 600, 700)")
			.addText((text) =>
				text
					.setPlaceholder("600")
					.setValue(d.labelWeight)
					.onChange(async (value) => {
						this.plugin.settings.dividerDesign.labelWeight = value;
						await this.plugin.saveSettings();
						this.renderDividerPreview(containerEl);
					})
			);

		new Setting(body)
			.setName("Label color")
			.setDesc("CSS color of the divider label")
			.addText((text) =>
				text
					.setPlaceholder("var(--text-muted)")
					.setValue(d.labelColor)
					.onChange(async (value) => {
						this.plugin.settings.dividerDesign.labelColor = value;
						await this.plugin.saveSettings();
						this.renderDividerPreview(containerEl);
					})
			);

		new Setting(body)
			.setName("Label letter spacing")
			.setDesc("Letter spacing of the divider label (e.g. 0.12em)")
			.addText((text) =>
				text
					.setPlaceholder("0.12em")
					.setValue(d.labelSpacing)
					.onChange(async (value) => {
						this.plugin.settings.dividerDesign.labelSpacing = value;
						await this.plugin.saveSettings();
						this.renderDividerPreview(containerEl);
					})
			);
	}
}
