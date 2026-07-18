import { App, PluginSettingTab, Setting, Notice, setIcon } from "obsidian";
import type NexusDashboardPlugin from "./main";
import { getAvailableFonts, renderFiglet } from "./figlet";

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

// ── Settings Tab ───────────────────────────────────────────────

export class NexusSettingTab extends PluginSettingTab {
	plugin: NexusDashboardPlugin;
	private draggedIndex: number | null = null;

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

		// ── Layout section ───────────────────────────────
		new Setting(containerEl).setHeading().setName("Layout");

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

		// ── Stats section ─────────────────────────────────
		new Setting(containerEl).setHeading().setName("Stats");
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
}
