import { App, PluginSettingTab, Setting, Notice, setIcon, Modal } from "obsidian";
import type NexusDashboardPlugin from "./main";
import type {
	MocEntry,
	QuickLinkEntry,
	RowLayoutEntry,
	ColumnLayoutEntry,
	StatEntry,
	ContentSlotType,
	VaultListEntry,
} from "./types";
import { getAvailableFonts, renderFiglet } from "./figlet";
import { ICONS, SMALL_ICONS } from "./icons";
import {
	DEFAULT_SETTINGS,
	DIVIDER_PRESETS,
	DIVIDER_PRESET_NAMES,
	detectDividerPreset,
	deepCloneDefaults,
} from "./defaults";

export const ICON_NAMES = Object.keys(ICONS);

export const CONTENT_SLOT_OPTIONS: Record<ContentSlotType, string> = {
	"none": "Empty",
	"stats": "Stats",
	"search": "Search",
	"heading": "Heading",
	"moc-cards": "MOC Cards",
	"quick-links": "Quick Links",
	"vault-activity": "Vault Activity",
	"divider": "Divider",
	"heatmap": "Heatmap",
	"timeline": "Activity Timeline",
	"clock": "Clock",
	"filetypes": "File Types",
};

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
	{ id: "layout", name: "Dashboard", icon: "layout-grid" },
	{ id: "components", name: "Components", icon: "component" },
];

export class NexusSettingTab extends PluginSettingTab {
	plugin: NexusDashboardPlugin;
	private draggedIndex: number | null = null;
	private activeTab = "general";
	private collapsedCards = new Map<number, boolean>();
	private collapsedRowCards = new Map<number, boolean>();
	private collapsedColCards = new Map<number, boolean>();

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
				this.displayDashboardTab(content);
				break;
			case "components":
				this.displayComponentsTab(content);
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

		new Setting(containerEl)
			.setName("Show header")
			.setDesc("Toggle the ASCII art header on the dashboard")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.showHeader)
					.onChange(async (value) => {
						this.plugin.settings.showHeader = value;
						await this.plugin.saveSettings();
					})
			);

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

	// ── Shared helpers ─────────────────────────────────────────

	private setupDragAndDrop(
		heading: HTMLElement,
		index: number,
		arr: { splice: (start: number, deleteCount: number, ...items: unknown[]) => unknown[] },
		collapsedMap: Map<number, boolean>,
	): { titleWrap: HTMLElement; actions: HTMLElement } {
		heading.draggable = true;

		const dragHandle = heading.createDiv({ cls: "nexus-settings-moc-drag", text: "⋮⋮" });
		dragHandle.draggable = false;

		heading.addEventListener("dragstart", (e) => {
			this.draggedIndex = index;
			heading.classList.add("nexus-dragging");
			if (e.dataTransfer) e.dataTransfer.effectAllowed = "move";
		});

		heading.addEventListener("dragend", () => {
			heading.classList.remove("nexus-dragging");
			this.draggedIndex = null;
		});

		heading.addEventListener("dragover", (e) => {
			e.preventDefault();
			if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
			heading.classList.add("nexus-drag-over");
		});

		heading.addEventListener("dragleave", () => {
			heading.classList.remove("nexus-drag-over");
		});

		heading.addEventListener("drop", async (e) => {
			e.preventDefault();
			heading.classList.remove("nexus-drag-over");
			if (this.draggedIndex === null || this.draggedIndex === index) return;
			const [moved] = arr.splice(this.draggedIndex, 1);
			arr.splice(index, 0, moved);
			await this.plugin.saveSettings();
			this.display();
		});

		const isCollapsed = collapsedMap.get(index) ?? true;
		const arrow = heading.createDiv({ cls: `nexus-settings-moc-arrow ${isCollapsed ? "collapsed" : ""}` });
		arrow.innerHTML = SVG.chevronDown;

		const titleWrap = heading.createDiv({ cls: "nexus-settings-moc-title" });
		titleWrap.addEventListener("click", (e) => e.stopPropagation());

		const actions = heading.createDiv({ cls: "nexus-settings-moc-actions" });
		actions.addEventListener("click", (e) => e.stopPropagation());

		return { titleWrap, actions };
	}

	private addVaultListSelector(
		parent: HTMLElement,
		paddingLeft: string,
		currentValue: string,
		onChange: (value: string) => void,
	): void {
		const row = parent.createDiv({ cls: "nexus-column-slot-row" });
		row.style.display = "flex";
		row.style.alignItems = "center";
		row.style.gap = "8px";
		row.style.paddingLeft = paddingLeft;

		const label = row.createEl("span", { text: "List:", cls: "setting-item-description" });
		label.style.minWidth = "40px";

		const select = row.createEl("select", { cls: "dropdown" });
		select.createEl("option", { text: "— Select list —", value: "" });
		for (const vl of this.plugin.settings.vaultLists) {
			const opt = select.createEl("option", { text: vl.name, value: vl.name });
			if (vl.name === currentValue) opt.selected = true;
		}
		select.addEventListener("change", () => onChange(select.value));

		if (this.plugin.settings.vaultLists.length === 0) {
			const hint = row.createEl("span", {
				text: "Add vault lists in the Components tab first",
				cls: "setting-item-description",
			});
			hint.style.color = "var(--text-muted)";
			hint.style.fontStyle = "italic";
		}
	}

	private addDividerLabelInput(
		parent: HTMLElement,
		paddingLeft: string,
		currentValue: string,
		onChange: (value: string) => void,
	): void {
		const row = parent.createDiv({ cls: "nexus-column-slot-row" });
		row.style.display = "flex";
		row.style.alignItems = "center";
		row.style.gap = "8px";
		row.style.paddingLeft = paddingLeft;

		const label = row.createEl("span", { text: "Label:", cls: "setting-item-description" });
		label.style.minWidth = "40px";

		const input = row.createEl("input", { type: "text", cls: "setting-text-input" });
		input.value = currentValue;
		input.placeholder = "Recently Modified";
		input.addEventListener("change", () => onChange(input.value));
	}

	// ═══════════════════════════════════════════════════════
	//  TAB: Dashboard (layout builder)
	// ═══════════════════════════════════════════════════════

	private displayDashboardTab(containerEl: HTMLElement): void {
		containerEl.createEl("p", {
			text: "Build your dashboard layout by arranging rows, columns, and dividers. Assign content to each slot.",
			cls: "setting-item-description",
		});

		// ── Row layouts ──────────────────────────────────
		new Setting(containerEl).setHeading().setName("Row layouts");
		containerEl.createEl("p", {
			text: "Rows place content side-by-side in columns. Assign a content slot to each column.",
			cls: "setting-item-description",
		});

		const rowLayouts = this.plugin.settings.rowLayouts;
		for (let i = 0; i < rowLayouts.length; i++) {
			this.renderRowLayoutCard(containerEl, rowLayouts[i], i);
		}

		new Setting(containerEl)
			.setName("Add row layout")
			.setDesc("Create a new row with columns")
			.addButton((btn) =>
				btn
					.setButtonText("+ Add Row")
					.setCta()
					.onClick(async () => {
						const n = rowLayouts.length + 1;
						rowLayouts.push({
							name: `Row ${n}`,
							columns: 2,
							proportion: "50/50",
							align: "top",
							slots: ["moc-cards", "none"],
						});
						await this.plugin.saveSettings();
						this.display();
					})
			);

		// ── Column layouts ────────────────────────────────
		new Setting(containerEl).setHeading().setName("Column layouts");
		containerEl.createEl("p", {
			text: "Columns place content vertically. Add slots to build a vertical column of dashboard sections.",
			cls: "setting-item-description",
		});

		const columnLayouts = this.plugin.settings.columnLayouts;
		for (let i = 0; i < columnLayouts.length; i++) {
			this.renderColumnLayoutCard(containerEl, columnLayouts[i], i);
		}

		new Setting(containerEl)
			.setName("Add column layout")
			.setDesc("Create a new vertical column")
			.addButton((btn) =>
				btn
					.setButtonText("+ Add Column")
					.setCta()
					.onClick(async () => {
						const n = columnLayouts.length + 1;
						columnLayouts.push({
							name: `Column ${n}`,
							spacing: "1rem",
							align: "stretch",
							slots: ["moc-cards"],
						});
						await this.plugin.saveSettings();
						this.display();
					})
			);

		// ── Saved row proportions ─────────────────────────
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
		const isCollapsed = this.collapsedRowCards.get(index) ?? true;

		const heading = containerEl.createDiv({ cls: "nexus-settings-moc-heading" });
		const { titleWrap, actions } = this.setupDragAndDrop(heading, index, this.plugin.settings.rowLayouts, this.collapsedRowCards);

		// Title with slot summary
		const slots = layout.slots || [];
		const slotSummary = slots.map((s) => {
			if (Array.isArray(s)) {
				return s.map((sub) => CONTENT_SLOT_OPTIONS[sub] || "Empty").join(" + ");
			}
			return CONTENT_SLOT_OPTIONS[s] || "Empty";
		}).join(" | ");
		titleWrap.createEl("span", { text: `${layout.name} (${layout.columns} cols: ${slotSummary})` });

		// Delete button
		const deleteBtn = actions.createEl("button", { cls: "nexus-settings-moc-btn--delete", attr: { "aria-label": "Remove" } });
		setIcon(deleteBtn, "trash");
		deleteBtn.addEventListener("click", async (e) => {
			e.stopPropagation();
			new ConfirmModal(
				this.app,
				`Remove "${layout.name}"?`,
				"This row layout will be removed from your dashboard.",
				async () => {
					this.plugin.settings.rowLayouts.splice(index, 1);
					await this.plugin.saveSettings();
					this.display();
				}
			).open();
		});

		// Toggle collapse
		heading.addEventListener("click", () => {
			this.collapsedRowCards.set(index, !isCollapsed);
			this.display();
		});

		if (isCollapsed) return;

		// ── Expanded content ──────────────────────────────────────

		// Visual row preview with slot labels
		const preview = containerEl.createDiv({ cls: "nexus-row-editor-visual" });
		const cols = layout.columns;
		const parts = layout.proportion.split("/").map((s) => parseInt(s.trim(), 10));

		for (let i = 0; i < cols; i++) {
			const colEl = preview.createDiv({ cls: "nexus-row-editor-col" });
			const width = (Number.isFinite(parts[i]) && (parts[i] ?? 0) > 0) ? (parts[i] as number) : Math.floor(100 / cols);
			colEl.style.width = `${width}%`;
			const slot = layout.slots?.[i] || "none";
			if (Array.isArray(slot)) {
				for (const sub of slot) {
					const subEl = colEl.createDiv({ cls: "nexus-row-editor-col-sub" });
					subEl.createEl("span", { text: CONTENT_SLOT_OPTIONS[sub] || "Empty", cls: "nexus-row-editor-col-label" });
				}
			} else {
				const slotLabel = CONTENT_SLOT_OPTIONS[slot as ContentSlotType] || "Empty";
				colEl.createEl("span", { text: slotLabel, cls: "nexus-row-editor-col-label" });
			}
		}

		// Edit fields
		const fields = containerEl.createDiv({ cls: "nexus-row-editor-fields" });

		// Name
		const nameSetting = new Setting(fields);
		nameSetting.setName("Name");
		nameSetting.addText((text) =>
			text
				.setPlaceholder("Layout name")
				.setValue(layout.name)
				.onChange(async (value) => {
					this.plugin.settings.rowLayouts[index].name = value || `Row ${index + 1}`;
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
					const safeCols = Number.isFinite(value) && value >= 1 ? value : 2;
					this.plugin.settings.rowLayouts[index].columns = safeCols;
					const part = Math.floor(100 / safeCols);
					const newParts: number[] = [];
					for (let j = 0; j < safeCols - 1; j++) {
						newParts.push(part);
					}
					newParts.push(100 - part * (safeCols - 1));
					this.plugin.settings.rowLayouts[index].proportion = newParts.join("/");
					const currentSlots = this.plugin.settings.rowLayouts[index].slots || [];
					while (currentSlots.length < safeCols) {
						currentSlots.push("none");
					}
					while (currentSlots.length > safeCols) {
						currentSlots.pop();
					}
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

		// ── Slot editors per column ──
		const currentSlots = layout.slots || [];
		if (!layout.slotHeadings) layout.slotHeadings = {};

		for (let i = 0; i < layout.columns; i++) {
			const slotVal = currentSlots[i] || "none";
			const isSubSlot = Array.isArray(slotVal);
			const slotList: ContentSlotType[] = isSubSlot ? slotVal as ContentSlotType[] : [slotVal as ContentSlotType];

			const colHeading = fields.createEl("div", { cls: "nexus-col-slot-heading" });
			colHeading.createEl("strong", { text: `Column ${i + 1}` });

			for (let si = 0; si < slotList.length; si++) {
				const subKey = isSubSlot ? `${i}-${si}` : String(i);
				const currentSlot = slotList[si];

				const slotRow = fields.createDiv({ cls: "nexus-column-slot-row" });
				slotRow.style.display = "flex";
				slotRow.style.alignItems = "center";
				slotRow.style.gap = "8px";

				if (isSubSlot) {
					const slotLabelEl = slotRow.createEl("span", { text: `Slot ${si + 1}:`, cls: "setting-item-description" });
					slotLabelEl.style.minWidth = "60px";
				}

				const slotSelect = slotRow.createEl("select", { cls: "dropdown" });
				for (const [key, label] of Object.entries(CONTENT_SLOT_OPTIONS)) {
					const opt = slotSelect.createEl("option", { text: label, value: key });
					if (key === currentSlot) opt.selected = true;
				}
				slotSelect.addEventListener("change", async () => {
					const newVal = slotSelect.value as ContentSlotType;
					if (isSubSlot) {
						(this.plugin.settings.rowLayouts[index].slots[i] as ContentSlotType[])[si] = newVal;
					} else {
						this.plugin.settings.rowLayouts[index].slots[i] = newVal;
					}
					await this.plugin.saveSettings();
					this.display();
				});

				// Remove button for sub-slots
				if (isSubSlot && slotList.length > 1) {
					const removeBtn = slotRow.createEl("button", { cls: "nexus-row-editor-card-btn" });
					setIcon(removeBtn, "x");
					removeBtn.addEventListener("click", async () => {
						const arr = this.plugin.settings.rowLayouts[index].slots[i] as ContentSlotType[];
						arr.splice(si, 1);
						if (arr.length === 1) {
							this.plugin.settings.rowLayouts[index].slots[i] = arr[0];
						}
						const headings = this.plugin.settings.rowLayouts[index].slotHeadings || {};
						delete headings[`${i}-${si}`];
						await this.plugin.saveSettings();
						this.display();
					});
				}

				// Heading config fields (when slot is "heading")
				if (currentSlot === "heading") {
					const headingCfg = layout.slotHeadings?.[subKey] || { text: "Section" };

					const textRow = fields.createDiv({ cls: "nexus-column-slot-row" });
					textRow.style.display = "flex";
					textRow.style.alignItems = "center";
					textRow.style.gap = "8px";
					textRow.style.paddingLeft = isSubSlot ? "68px" : "8px";
					const textLabel = textRow.createEl("span", { text: "Text:", cls: "setting-item-description" });
					textLabel.style.minWidth = "40px";
					const textInput = textRow.createEl("input", { type: "text", cls: "setting-text-input" });
					textInput.value = headingCfg.text || "";
					textInput.placeholder = "Heading text";
					textInput.addEventListener("change", async () => {
						const h = (this.plugin.settings.rowLayouts[index].slotHeadings ??= {});
						h[subKey] = { ...(h[subKey] || { text: "Section" }), text: textInput.value };
						await this.plugin.saveSettings();
					});

					const colorRow = fields.createDiv({ cls: "nexus-column-slot-row" });
					colorRow.style.display = "flex";
					colorRow.style.alignItems = "center";
					colorRow.style.gap = "8px";
					colorRow.style.paddingLeft = isSubSlot ? "68px" : "8px";
					const colorLabel = colorRow.createEl("span", { text: "Color:", cls: "setting-item-description" });
					colorLabel.style.minWidth = "40px";
					const colorInput = colorRow.createEl("input", { type: "text", cls: "setting-text-input" });
					colorInput.value = headingCfg.color || "";
					colorInput.placeholder = "CSS color (optional)";
					colorInput.addEventListener("change", async () => {
						const h = (this.plugin.settings.rowLayouts[index].slotHeadings ??= {});
						h[subKey] = { ...(h[subKey] || { text: "Section" }), color: colorInput.value || undefined };
						await this.plugin.saveSettings();
					});

					const asRow = fields.createDiv({ cls: "nexus-column-slot-row" });
					asRow.style.display = "flex";
					asRow.style.alignItems = "center";
					asRow.style.gap = "8px";
					asRow.style.paddingLeft = isSubSlot ? "68px" : "8px";

					const alignLabel = asRow.createEl("span", { text: "Align:", cls: "setting-item-description" });
					alignLabel.style.minWidth = "40px";
					const alignSelect = asRow.createEl("select", { cls: "dropdown" });
					for (const [ak, al] of [["left", "Left"], ["center", "Center"], ["right", "Right"]]) {
						const opt = alignSelect.createEl("option", { text: al, value: ak });
						if (ak === (headingCfg.align || "left")) opt.selected = true;
					}
					alignSelect.addEventListener("change", async () => {
						const h = (this.plugin.settings.rowLayouts[index].slotHeadings ??= {});
						h[subKey] = { ...(h[subKey] || { text: "Section" }), align: alignSelect.value as "left" | "center" | "right" };
						await this.plugin.saveSettings();
					});

					const sizeLabel = asRow.createEl("span", { text: "Size:", cls: "setting-item-description" });
					sizeLabel.style.marginLeft = "12px";
					const sizeSelect = asRow.createEl("select", { cls: "dropdown" });
					for (const [sk, sl] of [["small", "Small"], ["medium", "Medium"], ["large", "Large"]]) {
						const opt = sizeSelect.createEl("option", { text: sl, value: sk });
						if (sk === (headingCfg.size || "medium")) opt.selected = true;
					}
					sizeSelect.addEventListener("change", async () => {
						const h = (this.plugin.settings.rowLayouts[index].slotHeadings ??= {});
						h[subKey] = { ...(h[subKey] || { text: "Section" }), size: sizeSelect.value as "small" | "medium" | "large" };
						await this.plugin.saveSettings();
					});
				}

				// Vault list selector (when slot is "vault-activity")
				if (currentSlot === "vault-activity") {
					this.addVaultListSelector(
						fields,
						isSubSlot ? "68px" : "8px",
						this.plugin.settings.rowLayouts[index].vaultListSlots?.[subKey] || "",
						async (value) => {
							(this.plugin.settings.rowLayouts[index].vaultListSlots ??= {})[subKey] = value;
							await this.plugin.saveSettings();
						},
					);
				}

				// Divider label input (when slot is "divider")
				if (currentSlot === "divider") {
					this.addDividerLabelInput(
						fields,
						isSubSlot ? "68px" : "8px",
						this.plugin.settings.rowLayouts[index].dividerSlots?.[subKey] || "",
						async (value) => {
							(this.plugin.settings.rowLayouts[index].dividerSlots ??= {})[subKey] = value;
							await this.plugin.saveSettings();
						},
					);
				}
			}

			// "+ Add Slot" button per column
			const addSlotRow = fields.createDiv({ cls: "nexus-column-slot-row" });
			addSlotRow.style.paddingLeft = isSubSlot ? "68px" : "8px";
			const addSlotBtn = addSlotRow.createEl("button", { cls: "nexus-row-editor-card-btn" });
			addSlotBtn.textContent = "+ Add Slot";
			addSlotBtn.addEventListener("click", async () => {
				const current = this.plugin.settings.rowLayouts[index].slots[i];
				if (Array.isArray(current)) {
					current.push("none");
				} else {
					this.plugin.settings.rowLayouts[index].slots[i] = [current, "none"];
				}
				await this.plugin.saveSettings();
				this.display();
			});
		}
	}

	private renderColumnLayoutCard(containerEl: HTMLElement, layout: ColumnLayoutEntry, index: number): void {
		const isCollapsed = this.collapsedColCards.get(index) ?? true;

		const heading = containerEl.createDiv({ cls: "nexus-settings-moc-heading" });
		const { titleWrap, actions } = this.setupDragAndDrop(heading, index, this.plugin.settings.columnLayouts, this.collapsedColCards);

		// Title with slot summary
		const slots = layout.slots || [];
		const slotSummary = slots.map((s) => CONTENT_SLOT_OPTIONS[s] || "Empty").join(" → ");
		titleWrap.createEl("span", { text: `${layout.name} (${slotSummary})` });

		// Delete button
		const deleteBtn = actions.createEl("button", { cls: "nexus-settings-moc-btn--delete", attr: { "aria-label": "Remove" } });
		setIcon(deleteBtn, "trash");
		deleteBtn.addEventListener("click", async (e) => {
			e.stopPropagation();
			new ConfirmModal(
				this.app,
				`Remove "${layout.name}"?`,
				"This column layout will be removed from your dashboard.",
				async () => {
					this.plugin.settings.columnLayouts.splice(index, 1);
					await this.plugin.saveSettings();
					this.display();
				}
			).open();
		});

		// Toggle collapse
		heading.addEventListener("click", () => {
			this.collapsedColCards.set(index, !isCollapsed);
			this.display();
		});

		if (isCollapsed) return;

		// ── Expanded content ──────────────────────────────────────

		// Visual column preview
		const preview = containerEl.createDiv({ cls: "nexus-row-editor-visual" });
		preview.style.flexDirection = "column";
		preview.style.gap = "4px";
		const previewSlots = layout.slots || [];
		for (const slot of previewSlots) {
			const slotEl = preview.createDiv({ cls: "nexus-row-editor-col" });
			slotEl.style.width = "100%";
			slotEl.style.minHeight = "24px";
			slotEl.createEl("span", { text: CONTENT_SLOT_OPTIONS[slot] || "Empty", cls: "nexus-row-editor-col-label" });
		}

		// Edit fields
		const fields = containerEl.createDiv({ cls: "nexus-row-editor-fields" });

		// Name
		const nameSetting = new Setting(fields);
		nameSetting.setName("Name");
		nameSetting.addText((text) =>
			text
				.setPlaceholder("Column name")
				.setValue(layout.name)
				.onChange(async (value) => {
					this.plugin.settings.columnLayouts[index].name = value || `Column ${index + 1}`;
					await this.plugin.saveSettings();
				})
		);

		// Spacing
		const spacingSetting = new Setting(fields);
		spacingSetting.setName("Spacing");
		spacingSetting.addText((text) =>
			text
				.setPlaceholder("1rem")
				.setValue(layout.spacing)
				.onChange(async (value) => {
					this.plugin.settings.columnLayouts[index].spacing = value || "1rem";
					await this.plugin.saveSettings();
				})
		);

		// Alignment
		const alignSetting = new Setting(fields);
		alignSetting.setName("Horizontal align");
		alignSetting.addDropdown((dropdown) => {
			dropdown.addOption("stretch", "Stretch");
			dropdown.addOption("left", "Left");
			dropdown.addOption("center", "Center");
			dropdown.addOption("right", "Right");
			dropdown.setValue(layout.align);
			dropdown.onChange(async (value) => {
				this.plugin.settings.columnLayouts[index].align = value as "left" | "center" | "right" | "stretch";
				await this.plugin.saveSettings();
			});
		});

		// Slot list
		const colSlots = layout.slots || [];
		for (let i = 0; i < colSlots.length; i++) {
			const slotRow = fields.createDiv({ cls: "nexus-column-slot-row" });
			slotRow.style.display = "flex";
			slotRow.style.alignItems = "center";
			slotRow.style.gap = "8px";

			const slotLabel = slotRow.createEl("span", { text: `Slot ${i + 1}:`, cls: "setting-item-description" });
			slotLabel.style.minWidth = "60px";

			const slotSelect = slotRow.createEl("select", { cls: "dropdown" });
			for (const [key, label] of Object.entries(CONTENT_SLOT_OPTIONS)) {
				const opt = slotSelect.createEl("option", { text: label, value: key });
				if (key === colSlots[i]) opt.selected = true;
			}
			slotSelect.addEventListener("change", async () => {
				this.plugin.settings.columnLayouts[index].slots[i] = slotSelect.value as ContentSlotType;
				await this.plugin.saveSettings();
			});

			const removeBtn = slotRow.createEl("button", { cls: "nexus-row-editor-card-btn" });
			setIcon(removeBtn, "x");
			removeBtn.addEventListener("click", async () => {
				this.plugin.settings.columnLayouts[index].slots.splice(i, 1);
				await this.plugin.saveSettings();
				this.display();
			});

			// Vault list selector (when slot is "vault-activity")
			if (colSlots[i] === "vault-activity") {
				this.addVaultListSelector(
					fields,
					"68px",
					this.plugin.settings.columnLayouts[index].vaultListSlots?.[String(i)] || "",
					async (value) => {
						(this.plugin.settings.columnLayouts[index].vaultListSlots ??= {})[String(i)] = value;
						await this.plugin.saveSettings();
					},
				);
			}

			// Divider label input (when slot is "divider")
			if (colSlots[i] === "divider") {
				this.addDividerLabelInput(
					fields,
					"68px",
					this.plugin.settings.columnLayouts[index].dividerSlots?.[String(i)] || "",
					async (value) => {
						(this.plugin.settings.columnLayouts[index].dividerSlots ??= {})[String(i)] = value;
						await this.plugin.saveSettings();
					},
				);
			}
		}

		// Add slot button
		const addSlotBtn = fields.createEl("button", { cls: "nexus-row-editor-card-btn" });
		addSlotBtn.textContent = "+ Add Slot";
		addSlotBtn.addEventListener("click", async () => {
			this.plugin.settings.columnLayouts[index].slots.push("none");
			await this.plugin.saveSettings();
			this.display();
		});
	}

	// ═══════════════════════════════════════════════════════
	//  TAB: Components (card/link/stats configs)
	// ═══════════════════════════════════════════════════════

	private displayComponentsTab(containerEl: HTMLElement): void {
		containerEl.createEl("p", {
			text: "Configure the content that fills your dashboard layout slots.",
			cls: "setting-item-description",
		});

		// ── MOC Cards ──────────────────────────────────
		new Setting(containerEl).setHeading().setName("MOC cards");
		containerEl.createEl("p", {
			text: "Configure the MOC cards shown on your dashboard.",
			cls: "setting-item-description",
		});

		new Setting(containerEl)
			.setName("Show MOC cards")
			.setDesc("Show map of content cards on the dashboard")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.showMocCards)
					.onChange(async (value) => {
						this.plugin.settings.showMocCards = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Show divider")
			.setDesc("Show a divider label above MOC cards")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.showMocDivider)
					.onChange(async (value) => {
						this.plugin.settings.showMocDivider = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Divider label")
			.setDesc("Text shown in the divider above MOC cards")
			.addText((text) =>
				text
					.setPlaceholder("MOC CARDS")
					.setValue(this.plugin.settings.mocDividerLabel)
					.onChange(async (value) => {
						this.plugin.settings.mocDividerLabel = value || "MOC CARDS";
						await this.plugin.saveSettings();
					})
			);

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

		// ── Stats ──────────────────────────────────────
		new Setting(containerEl).setHeading().setName("Stats");

		new Setting(containerEl)
			.setName("Show stats")
			.setDesc("Show vault statistics on the dashboard")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.showStats)
					.onChange(async (value) => {
						this.plugin.settings.showStats = value;
						await this.plugin.saveSettings();
					})
			);

		containerEl.createEl("p", {
			text: "Configure the stat counters shown on the dashboard.",
			cls: "setting-item-description",
		});

		this.plugin.settings.stats.forEach((stat, i) => {
			this.renderStatEntry(containerEl, stat, i);
		});

		new Setting(containerEl)
			.setName("Add stat")
			.setDesc("Add a new stat counter")
			.addButton((btn) =>
				btn
					.setButtonText("+ Add Stat")
					.setCta()
					.onClick(async () => {
						this.plugin.settings.stats.push({ folder: "", label: "New Stat" });
						await this.plugin.saveSettings();
						this.display();
					})
			);

		// ── Search ─────────────────────────────────────
		new Setting(containerEl).setHeading().setName("Search");

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

		new Setting(containerEl)
			.setName("Search default")
			.setDesc("Default search scope")
			.addDropdown((dropdown) => {
				dropdown.addOption("vault", "Vault");
				dropdown.addOption("cards", "Cards");
				dropdown.setValue(this.plugin.settings.searchDefault);
				dropdown.onChange(async (value) => {
					this.plugin.settings.searchDefault = value as "vault" | "cards";
					await this.plugin.saveSettings();
				});
			});

		// ── Vault Activity Lists ─────────────────────────
		new Setting(containerEl).setHeading().setName("Vault Activity Lists");
		containerEl.createEl("p", {
			text: "Configure named vault activity presets for use in layout slots. Each list filters vault notes by path and/or tags, and renders in terminal log style.",
			cls: "setting-item-description",
		});

		this.plugin.settings.vaultLists.forEach((vl, i) => {
			this.renderVaultListEntry(containerEl, vl, i);
		});

		new Setting(containerEl)
			.setName("Add vault activity list")
			.setDesc("Add a new named vault activity preset for use in layout slots.")
			.addButton((btn) =>
				btn
					.setButtonText("+ Add List")
					.setCta()
					.onClick(async () => {
						this.plugin.settings.vaultLists.push({
							name: "New List",
							path: "",
							tags: "",
							count: this.plugin.settings.vaultActivityCount,
							showDivider: true,
						});
						await this.plugin.saveSettings();
						this.display();
					})
			);

		// ── Divider ────────────────────────────────────
		new Setting(containerEl).setHeading().setName("Divider");

		containerEl.createEl("p", {
			text: "Customize the appearance of section dividers. Labels are configured per component above.",
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
			text: "Configure the quick links shown on the dashboard.",
			cls: "setting-item-description",
		});

		new Setting(containerEl)
			.setName("Show quick links")
			.setDesc("Show quick links section on the dashboard")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.showQuickLinks)
					.onChange(async (value) => {
						this.plugin.settings.showQuickLinks = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Show divider")
			.setDesc("Show a divider label above quick links")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.showQuickLinksDivider)
					.onChange(async (value) => {
						this.plugin.settings.showQuickLinksDivider = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Divider label")
			.setDesc("Text shown in the divider above quick links")
			.addText((text) =>
				text
					.setPlaceholder("Quick Links")
					.setValue(this.plugin.settings.quickLinksDividerLabel)
					.onChange(async (value) => {
						this.plugin.settings.quickLinksDividerLabel = value || "Quick Links";
						await this.plugin.saveSettings();
					})
			);

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

		// ── Heatmap ─────────────────────────────────────
		new Setting(containerEl).setHeading().setName("Heatmap");
		containerEl.createEl("p", {
			text: "GitHub-style contribution calendar showing daily vault activity.",
			cls: "setting-item-description",
		});

		new Setting(containerEl)
			.setName("Show heatmap")
			.setDesc("Show the contribution heatmap on the dashboard")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.showHeatmap)
					.onChange(async (value) => {
						this.plugin.settings.showHeatmap = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Weeks")
			.setDesc("Number of weeks to display (8–52)")
			.addSlider((slider) =>
				slider
					.setLimits(8, 52, 1)
					.setValue(this.plugin.settings.heatmapWeeks)
					.setDynamicTooltip()
					.onChange(async (value) => {
						this.plugin.settings.heatmapWeeks = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Label")
			.setDesc("Text shown in the divider above the heatmap")
			.addText((text) =>
				text
					.setPlaceholder("CONTRIBUTION ACTIVITY")
					.setValue(this.plugin.settings.heatmapLabel)
					.onChange(async (value) => {
						this.plugin.settings.heatmapLabel = value;
						await this.plugin.saveSettings();
					})
			);

		// ── Activity Timeline ──────────────────────────
		new Setting(containerEl).setHeading().setName("Activity Timeline");
		containerEl.createEl("p", {
			text: "Terminal-style chronological log of vault file activity.",
			cls: "setting-item-description",
		});

		new Setting(containerEl)
			.setName("Show activity timeline")
			.setDesc("Show the activity timeline on the dashboard")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.showActivityTimeline)
					.onChange(async (value) => {
						this.plugin.settings.showActivityTimeline = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Number of entries")
			.setDesc("How many activity entries to show")
			.addSlider((slider) =>
				slider
					.setLimits(5, 50, 1)
					.setValue(this.plugin.settings.activityTimelineCount)
					.setDynamicTooltip()
					.onChange(async (value) => {
						this.plugin.settings.activityTimelineCount = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Label")
			.setDesc("Text shown in the divider above the timeline")
			.addText((text) =>
				text
					.setPlaceholder("ACTIVITY")
					.setValue(this.plugin.settings.activityTimelineLabel)
					.onChange(async (value) => {
						this.plugin.settings.activityTimelineLabel = value;
						await this.plugin.saveSettings();
					})
			);

		// ── Clock ──────────────────────────────────────
		new Setting(containerEl).setHeading().setName("Clock");
		containerEl.createEl("p", {
			text: "Real-time digital clock with optional second timezone.",
			cls: "setting-item-description",
		});

		new Setting(containerEl)
			.setName("Show clock")
			.setDesc("Show the clock on the dashboard")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.showClock)
					.onChange(async (value) => {
						this.plugin.settings.showClock = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Timezone")
			.setDesc("IANA timezone (e.g. America/New_York). Leave empty for local time.")
			.addText((text) =>
				text
					.setPlaceholder("Local time")
					.setValue(this.plugin.settings.clockTimezone)
					.onChange(async (value) => {
						this.plugin.settings.clockTimezone = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Show date")
			.setDesc("Show the date below the time")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.clockShowDate)
					.onChange(async (value) => {
						this.plugin.settings.clockShowDate = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Show seconds")
			.setDesc("Show seconds in the clock")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.clockShowSeconds)
					.onChange(async (value) => {
						this.plugin.settings.clockShowSeconds = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Format")
			.setDesc("12-hour or 24-hour format")
			.addDropdown((dropdown) => {
				dropdown.addOption("12h", "12-hour");
				dropdown.addOption("24h", "24-hour");
				dropdown.setValue(this.plugin.settings.clockFormat);
				dropdown.onChange(async (value) => {
					this.plugin.settings.clockFormat = value as "12h" | "24h";
					await this.plugin.saveSettings();
				});
			});

		new Setting(containerEl)
			.setName("Label")
			.setDesc("Text shown in the divider above the clock")
			.addText((text) =>
				text
					.setPlaceholder("")
					.setValue(this.plugin.settings.clockLabel)
					.onChange(async (value) => {
						this.plugin.settings.clockLabel = value;
						await this.plugin.saveSettings();
					})
			);

		// ── File Types ─────────────────────────────────
		new Setting(containerEl).setHeading().setName("File Type Distribution");
		containerEl.createEl("p", {
			text: "Horizontal bar chart showing file type breakdown in the vault.",
			cls: "setting-item-description",
		});

		new Setting(containerEl)
			.setName("Show file type chart")
			.setDesc("Show the file type distribution on the dashboard")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.showFileTypeChart)
					.onChange(async (value) => {
						this.plugin.settings.showFileTypeChart = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Max types")
			.setDesc("Maximum file types to display (3–15)")
			.addSlider((slider) =>
				slider
					.setLimits(3, 15, 1)
					.setValue(this.plugin.settings.fileTypeChartMax)
					.setDynamicTooltip()
					.onChange(async (value) => {
						this.plugin.settings.fileTypeChartMax = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Label")
			.setDesc("Text shown in the divider above the chart")
			.addText((text) =>
				text
					.setPlaceholder("FILE TYPES")
					.setValue(this.plugin.settings.fileTypeChartLabel)
					.onChange(async (value) => {
						this.plugin.settings.fileTypeChartLabel = value;
						await this.plugin.saveSettings();
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
				if (!data || typeof data !== "object") {
					new Notice("Invalid settings file: not a valid JSON object");
					return;
				}
				if (data.mocs && !Array.isArray(data.mocs)) {
					new Notice("Invalid settings file: mocs must be an array");
					return;
				}
				if (data.stats && !Array.isArray(data.stats)) {
					new Notice("Invalid settings file: stats must be an array");
					return;
				}
				if (data.mocs) {
					const validMocs = data.mocs.every(
						(m: Record<string, unknown>) => m && typeof m.path === "string" && typeof m.title === "string"
					);
					if (!validMocs) {
						new Notice("Invalid settings file: malformed MOC entries");
						return;
					}
				}
				if (data.stats) {
					const validStats = data.stats.every(
						(s: Record<string, unknown>) => s && typeof s.folder === "string" && typeof s.label === "string"
					);
					if (!validStats) {
						new Notice("Invalid settings file: malformed stat entries");
						return;
					}
				}
				if (data.vaultLists && !Array.isArray(data.vaultLists)) {
					new Notice("Invalid settings file: vaultLists must be an array");
					return;
				}
				if (data.vaultLists) {
					const validVl = data.vaultLists.every(
						(v: Record<string, unknown>) => v && typeof v.name === "string"
					);
					if (!validVl) {
						new Notice("Invalid settings file: malformed vault list entries");
						return;
					}
				}
				const validKeys = Object.keys(DEFAULT_SETTINGS);
				const filtered: Record<string, unknown> = {};
				for (const key of validKeys) {
					if (key in data) {
						filtered[key] = data[key];
					}
				}
				Object.assign(this.plugin.settings, filtered);
				await this.plugin.saveSettings();
				this.display();
				new Notice("Settings imported");
			} catch {
				new Notice("Invalid settings file");
			}
		};
		input.click();
	}

	// ── MOC Card with drag-and-drop + color picker ────────────

	renderMocCard(containerEl: HTMLElement, moc: MocEntry, index: number): void {
		const isCollapsed = this.collapsedCards.get(index) ?? true;

		const heading = containerEl.createDiv({ cls: "nexus-settings-moc-heading" });
		const { titleWrap, actions } = this.setupDragAndDrop(heading, index, this.plugin.settings.mocs, this.collapsedCards);

		// Title
		titleWrap.createEl("span", { text: moc.title || "Untitled" });

		// Delete button
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
			this.collapsedCards.set(index, !isCollapsed);
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

	// ── Stats entry ──────────────────────────────────────────────

	renderStatEntry(containerEl: HTMLElement, stat: StatEntry, index: number): void {
		const folders = getVaultFolders(this.app);
		if (stat.folder && !folders.includes(stat.folder)) {
			folders.push(stat.folder);
			folders.sort();
		}

		const setting = new Setting(containerEl);

		setting.setName(stat.label);
		setting.addText((text) =>
			text
				.setPlaceholder("Label")
				.setValue(stat.label)
				.onChange(async (value) => {
					this.plugin.settings.stats[index].label = value;
					await this.plugin.saveSettings();
				})
		);
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

		const label = row.createEl("span", { cls: "nexus-settings-divider-preview-label", text: this.plugin.settings.vaultActivityLabel || "VAULT ACTIVITY" });
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

	// ── Vault List Entry ────────────────────────────────────

	renderVaultListEntry(containerEl: HTMLElement, vl: VaultListEntry, index: number): void {
		const setting = new Setting(containerEl);

		setting.setName(vl.name || "Untitled");
		setting.addText((text) =>
			text
				.setPlaceholder("Path")
				.setValue(vl.path)
				.onChange(async (value) => {
					this.plugin.settings.vaultLists[index].path = value;
					await this.plugin.saveSettings();
				})
		);
		setting.addText((text) =>
			text
				.setPlaceholder("Tags")
				.setValue(vl.tags)
				.onChange(async (value) => {
					this.plugin.settings.vaultLists[index].tags = value;
					await this.plugin.saveSettings();
				})
		);
		setting.addText((text) =>
			text
				.setPlaceholder("Count")
				.setValue(String(vl.count))
				.onChange(async (value) => {
					const n = parseInt(value, 10);
					this.plugin.settings.vaultLists[index].count = Number.isFinite(n) && n >= 1 ? n : 9;
					await this.plugin.saveSettings();
				})
		);
		setting.addToggle((toggle) =>
			toggle
				.setTooltip("Show divider")
				.setValue(vl.showDivider)
				.onChange(async (value) => {
					this.plugin.settings.vaultLists[index].showDivider = value;
					await this.plugin.saveSettings();
				})
		);
		setting.addExtraButton((btn) =>
			btn
				.setIcon("trash")
				.setTooltip("Remove")
				.onClick(async () => {
					this.plugin.settings.vaultLists.splice(index, 1);
					await this.plugin.saveSettings();
					this.display();
				})
		);
	}
}
