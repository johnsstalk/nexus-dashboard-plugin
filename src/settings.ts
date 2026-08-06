import {
	App,
	PluginSettingTab,
	Setting,
	Notice,
	setIcon,
	Modal,
	ToggleComponent,
	TextComponent,
	DropdownComponent,
	ExtraButtonComponent,
	copy,
} from "obsidian";
import type NexusDashboardPlugin from "./main";
import type {
	MocEntry,
	RowLayoutEntry,
	ColumnLayoutEntry,
	StatEntry,
	ContentSlotType,
	VaultListEntry,
	HeadingConfig,
	DividerDesign,
	StatMetric,
	StatScope,
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
import { safeParseInt } from "./utils";
import { statSummary } from "./stats";

export const ICON_NAMES = Object.keys(ICONS);

export const CONTENT_SLOT_OPTIONS: Record<ContentSlotType, string> = {
	none: "Empty",
	stats: "Stats",
	search: "Search",
	heading: "Heading",
	"moc-cards": "MOC Cards",
	"quick-links": "Quick Links",
	"vault-activity": "Vault Activity",
	divider: "Divider",
	heatmap: "Heatmap",
	timeline: "Activity Timeline",
	clock: "Clock",
	filetypes: "File Types",
	tasks: "Task Summary",
};

let vaultFoldersCache: string[] | null = null;
let vaultFoldersCacheAt = 0;

/** Drop the cached vault-folder list (e.g. after a folder rename/move). */
export function clearVaultFoldersCache(): void {
	vaultFoldersCache = null;
	vaultFoldersCacheAt = 0;
}

function getVaultFolders(app: App): string[] {
	const now = Date.now();
	if (vaultFoldersCache && now - vaultFoldersCacheAt < 5000) {
		return vaultFoldersCache;
	}
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
	vaultFoldersCache = Array.from(folders).sort();
	vaultFoldersCacheAt = now;
	return vaultFoldersCache;
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

interface DividerControlSettings {
	show: boolean;
	label: string;
	labelPlaceholder: string;
	onShow: (value: boolean) => Promise<void>;
	onLabel: (value: string) => Promise<void>;
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

	/** Namespaced key under which a card's collapsed state is persisted. */
	private static collapseKey(scope: string, id: string | number): string {
		return `${scope}:${id}`;
	}

	/** True when the card (by persisted key) is collapsed; cards default to collapsed. */
	private isCollapsed(key: string): boolean {
		return this.plugin.settings.collapseState[key] ?? true;
	}

	private setCollapsed(key: string, value: boolean): void {
		this.plugin.settings.collapseState[key] = value;
	}

	private deleteCollapsed(key: string): void {
		delete this.plugin.settings.collapseState[key];
	}

	/** Whether a content slot is available — toggled-off components appear greyed out. */
	private isSlotEnabled(slot: ContentSlotType): boolean {
		const s = this.plugin.settings;
		switch (slot) {
			case "stats":
				return s.showStats;
			case "search":
				return s.showSearch;
			case "moc-cards":
				return s.showMocCards;
			case "quick-links":
				return s.showQuickLinks;
			case "vault-activity":
				return s.showVaultActivity;
			case "heatmap":
				return s.showHeatmap;
			case "timeline":
				return s.showActivityTimeline;
			case "clock":
				return s.showClock;
			case "filetypes":
				return s.showFileTypeChart;
			case "tasks":
				return s.showTaskSummary;
			case "none":
			case "heading":
			case "divider":
				return true;
		}
	}

	/** All persisted collapse keys shown on the Components tab. */
	private collectComponentKeys(): string[] {
		const keys: string[] = [];
		for (const id of [
			"moc-cards",
			"stats",
			"search",
			"vault-activity",
			"quick-links",
			"heatmap",
			"activity-timeline",
			"clock",
			"file-types",
			"task-summary",
			"divider-style",
		]) {
			keys.push(NexusSettingTab.collapseKey("component", id));
		}
		for (let i = 0; i < this.plugin.settings.mocs.length; i++) {
			keys.push(NexusSettingTab.collapseKey("moc", i));
		}
		return keys;
	}

	/** All persisted collapse keys shown on the Dashboard tab. */
	private collectLayoutKeys(): string[] {
		const keys: string[] = [];
		this.plugin.settings.rowLayouts.forEach((l, i) => {
			keys.push(NexusSettingTab.collapseKey("row", l.id || `row-${i}`));
		});
		this.plugin.settings.columnLayouts.forEach((l, i) => {
			keys.push(NexusSettingTab.collapseKey("col", l.id || String(i)));
		});
		return keys;
	}

	/** Collapse/expand every card in the given key list at once. */
	private renderCollapseAllBar(parent: HTMLElement, keys: string[]): void {
		const bar = parent.createDiv({ cls: "nexus-settings-collapse-bar" });
		const collapseBtn = bar.createEl("button", { text: "Collapse all", cls: "mod-cta" });
		collapseBtn.addEventListener("click", () => {
			for (const key of keys) this.setCollapsed(key, true);
			void this.plugin.saveSettings();
			this.renderActiveTab();
		});
		const expandBtn = bar.createEl("button", { text: "Expand all" });
		expandBtn.addEventListener("click", () => {
			for (const key of keys) this.setCollapsed(key, false);
			void this.plugin.saveSettings();
			this.renderActiveTab();
		});
	}

	constructor(app: App, plugin: NexusDashboardPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	/**
	 * Save settings to disk and re-render only the active tab content.
	 * Preserves the title and tab bar DOM (avoids full-page churn on every edit).
	 */
	private async saveAndRefresh(): Promise<void> {
		await this.plugin.saveSettings();
		this.renderActiveTab();
	}

	/** Re-render the currently-active tab content without touching the chrome. */
	private renderActiveTab(): void {
		const content = this.containerEl.querySelector<HTMLElement>(".nexus-settings-content");
		if (!content) return;
		content.empty();
		try {
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
		} catch (err) {
			// eslint-disable-next-line no-console -- error guard; console is the only place the user can see render failures
			console.error("Nexus Dashboard: failed to render settings tab", err);
			new Notice("Nexus Dashboard: failed to render settings tab — see console");
			content.createEl("p", {
				text: "An error occurred while rendering this tab. Check the developer console for details.",
				cls: "setting-item-description",
			});
		}
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
		tabBar.setAttribute("role", "tablist");
		for (const tab of SETTING_TABS) {
			const isActive = tab.id === this.activeTab;
			const tabEl = tabBar.createDiv({
				cls: `nexus-settings-tab ${isActive ? "active" : ""}`,
				attr: {
					role: "tab",
					"aria-selected": isActive ? "true" : "false",
					tabindex: isActive ? "0" : "-1",
				},
			});
			setIcon(tabEl, tab.icon);
			tabEl.createEl("span", { text: tab.name });
			const activate = () => {
				this.activeTab = tab.id;
				this.display();
			};
			tabEl.addEventListener("click", activate);
			tabEl.addEventListener("keydown", (e) => {
				if (e.key === "Enter" || e.key === " ") {
					e.preventDefault();
					activate();
				}
			});
		}

		// ── Tab content ──────────────────────────────────
		containerEl.createDiv({ cls: "nexus-settings-content" });
		this.renderActiveTab();
	}

	// ═══════════════════════════════════════════════════════
	//  TAB: General
	// ═══════════════════════════════════════════════════════

	private displayGeneralTab(containerEl: HTMLElement): void {
		new Setting(containerEl)
			.setName("Open on startup")
			.setDesc("Automatically open the dashboard when Obsidian starts")
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.openOnStartup).onChange(async (value) => {
					this.plugin.settings.openOnStartup = value;
					await this.plugin.saveSettings();
				}),
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
					.onClick(() => this.exportSettings()),
			);

		new Setting(containerEl)
			.setName("Import settings")
			.setDesc("Load settings from a previously exported JSON file")
			.addButton((btn) =>
				btn
					.setButtonText("Import")
					.setWarning()
					.onClick(() => this.importSettings()),
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
								await this.saveAndRefresh();
							},
						).open();
					}),
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
				toggle.setValue(this.plugin.settings.showHeader).onChange(async (value) => {
					this.plugin.settings.showHeader = value;
					await this.plugin.saveSettings();
				}),
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
					}),
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
					}),
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
		isCollapsed: boolean,
		showHandle = true,
	): { titleWrap: HTMLElement; actions: HTMLElement } {
		heading.draggable = true;

		if (showHandle) {
			const dragHandle = heading.createDiv({ cls: "nexus-settings-moc-drag", text: "⋮⋮" });
			dragHandle.draggable = false;
		}

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
			await this.saveAndRefresh();
		});

		const arrow = heading.createDiv({
			cls: `nexus-settings-moc-arrow ${isCollapsed ? "collapsed" : ""}`,
		});
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

	/** Assign stable ids to row/column layouts that lack one. */
	private ensureLayoutIds(): void {
		const stamp = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
		for (let i = 0; i < this.plugin.settings.rowLayouts.length; i++) {
			if (!this.plugin.settings.rowLayouts[i].id) {
				this.plugin.settings.rowLayouts[i].id = `row-${stamp}-${i}`;
			}
		}
		for (let i = 0; i < this.plugin.settings.columnLayouts.length; i++) {
			if (!this.plugin.settings.columnLayouts[i].id) {
				this.plugin.settings.columnLayouts[i].id = `col-${stamp}-${i}`;
			}
		}
	}

	/** Live-update the row preview column widths from a "50/25/25" proportion string. */
	private updateRowPreviewWidths(previewColEls: HTMLElement[], value: string, cols: number): void {
		const parts = value.split("/").map((s) => parseInt(s.trim(), 10));
		for (let i = 0; i < previewColEls.length; i++) {
			const pct = Number.isFinite(parts[i]) ? parts[i] : 100 / cols;
			previewColEls[i].style.width = `${Math.min(100, Math.max(0, pct))}%`;
		}
	}

	/** Drop out-of-range or malformed per-slot override keys after an import. */
	private pruneSlotOverrides(
		map: Record<string, unknown> | undefined,
		slots: (ContentSlotType | ContentSlotType[])[],
	): void {
		if (!map) return;
		for (const key of Object.keys(map)) {
			const m = /^(\d+)(?:-(\d+))?$/.exec(key);
			if (!m) {
				delete map[key];
				continue;
			}
			const col = parseInt(m[1], 10);
			if (col >= slots.length) {
				delete map[key];
				continue;
			}
			if (m[2] !== undefined) {
				const sub = parseInt(m[2], 10);
				const slotVal = slots[col];
				const subLen = Array.isArray(slotVal) ? slotVal.length : 1;
				if (sub >= subLen) delete map[key];
			}
		}
	}

	/** Normalise imported settings so arrays/overrides stay within valid bounds. */
	private sanitizeImportedSettings(): void {
		const s = this.plugin.settings;

		if (Array.isArray(s.quickLinks)) {
			s.quickLinks = s.quickLinks
				.filter((l) => l && typeof l.url === "string")
				.map((l) => ({
					url: l.url,
					label: typeof l.label === "string" ? l.label : "",
					icon: typeof l.icon === "string" ? l.icon : "",
				}))
				.slice(0, 50);
		}

		if (Array.isArray(s.rowLayouts)) {
			for (const row of s.rowLayouts) {
				row.columns = Math.max(1, Math.min(12, safeParseInt(row.columns, 2, 1) ?? 2));
				if (!Array.isArray(row.slots)) row.slots = [];
				row.slots = row.slots.slice(0, 12);
				while (row.slots.length < row.columns) row.slots.push("none");
				row.slots = row.slots.slice(0, row.columns);
				this.pruneSlotOverrides(row.slotHeadings, row.slots);
				this.pruneSlotOverrides(row.vaultListSlots, row.slots);
				this.pruneSlotOverrides(row.dividerSlots, row.slots);
			}
		}

		if (Array.isArray(s.columnLayouts)) {
			for (const col of s.columnLayouts) {
				if (!Array.isArray(col.slots)) col.slots = [];
				col.slots = col.slots.slice(0, 12);
				this.pruneSlotOverrides(col.slotHeadings, col.slots);
				this.pruneSlotOverrides(col.vaultListSlots, col.slots);
				this.pruneSlotOverrides(col.dividerSlots, col.slots);
			}
		}

		if (Array.isArray(s.vaultLists)) {
			for (const vl of s.vaultLists) {
				vl.count = Math.max(3, Math.min(50, safeParseInt(vl.count, 9, 3) ?? 9));
			}
		}
	}

	/** Commit a free-typed icon input value on blur so it isn't lost (#17). */
	private addIconPickerCommitBlur(
		input: HTMLInputElement,
		preview: HTMLElement,
		onCommit: (value: string) => void,
	): void {
		const commit = () => {
			onCommit(input.value);
			preview.innerHTML = SMALL_ICONS[input.value] || SMALL_ICONS["MOC"] || "";
		};
		input.addEventListener("change", commit);
		input.addEventListener("blur", commit);
	}

	// ═══════════════════════════════════════════════════════
	//  TAB: Dashboard (layout builder)
	// ═══════════════════════════════════════════════════════

	private displayDashboardTab(containerEl: HTMLElement): void {
		containerEl.createEl("p", {
			text:
				"Build your dashboard layout by arranging rows, columns, and dividers. Assign content to each slot.",
			cls: "setting-item-description",
		});

		this.renderCollapseAllBar(containerEl, this.collectLayoutKeys());

		this.ensureLayoutIds();

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
							id: `row-${Date.now()}-${n}`,
							name: `Row ${n}`,
							columns: 2,
							proportion: "50/50",
							align: "top",
							slots: ["moc-cards", "none"],
						});
						await this.saveAndRefresh();
					}),
			);

		// ── Column layouts ────────────────────────────────
		new Setting(containerEl).setHeading().setName("Column layouts");
		containerEl.createEl("p", {
			text:
				"Columns place content vertically. Add slots to build a vertical column of dashboard sections.",
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
							id: `col-${Date.now()}-${n}`,
							name: `Column ${n}`,
							spacing: "1rem",
							align: "stretch",
							slots: ["moc-cards"],
						});
						await this.saveAndRefresh();
					}),
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
								await this.saveAndRefresh();
							}),
					);
			}
		}
	}

	private renderRowLayoutCard(
		containerEl: HTMLElement,
		layout: RowLayoutEntry,
		index: number,
	): void {
		const layoutId = layout.id || `row-${index}`;
		const isCollapsed = this.isCollapsed(NexusSettingTab.collapseKey("row", layoutId));

		const heading = containerEl.createDiv({ cls: "nexus-settings-moc-heading" });
		const { titleWrap, actions } = this.setupDragAndDrop(
			heading,
			index,
			this.plugin.settings.rowLayouts,
			isCollapsed,
		);

		// Title with slot summary
		const slots = layout.slots || [];
		const slotSummary = slots
			.map((s) => {
				if (Array.isArray(s)) {
					return s.map((sub) => CONTENT_SLOT_OPTIONS[sub] || "Empty").join(" + ");
				}
				return CONTENT_SLOT_OPTIONS[s] || "Empty";
			})
			.join(" | ");
		titleWrap.createEl("span", { text: `${layout.name} (${layout.columns} cols: ${slotSummary})` });

		// Delete button
		const deleteBtn = actions.createEl("button", {
			cls: "nexus-settings-moc-btn--delete",
			attr: { "aria-label": "Remove" },
		});
		setIcon(deleteBtn, "trash");
		deleteBtn.addEventListener("click", async (e) => {
			e.stopPropagation();
			new ConfirmModal(
				this.app,
				`Remove "${layout.name}"?`,
				"This row layout will be removed from your dashboard.",
				async () => {
					this.plugin.settings.rowLayouts.splice(index, 1);
					await this.saveAndRefresh();
				},
			).open();
		});

		// Toggle collapse
		heading.addEventListener("click", () => {
			this.setCollapsed(NexusSettingTab.collapseKey("row", layoutId), !isCollapsed);
			this.saveAndRefresh();
		});

		if (isCollapsed) return;

		// ── Expanded content ──────────────────────────────────────

		// Visual row preview with slot labels
		const preview = containerEl.createDiv({ cls: "nexus-row-editor-visual" });
		const cols = layout.columns;
		const previewColEls: HTMLElement[] = [];
		const parts = layout.proportion.split("/").map((s) => parseInt(s.trim(), 10));

		for (let i = 0; i < cols; i++) {
			const colEl = preview.createDiv({ cls: "nexus-row-editor-col" });
			previewColEls.push(colEl);
			const width = Math.min(
				100,
				safeParseInt(String(parts[i] ?? 0), Math.floor(100 / cols), 1) ?? Math.floor(100 / cols),
			);
			colEl.style.width = `${width}%`;
			const slot = layout.slots?.[i] || "none";
			if (Array.isArray(slot)) {
				for (const sub of slot) {
					const subEl = colEl.createDiv({ cls: "nexus-row-editor-col-sub" });
					subEl.createEl("span", {
						text: CONTENT_SLOT_OPTIONS[sub] || "Empty",
						cls: "nexus-row-editor-col-label",
					});
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
				}),
		);

		// Columns
		const colSetting = new Setting(fields);
		colSetting.setName("Columns");
		colSetting.addSlider((slider) => {
			const applyColumns = (value: number) => {
				const safeCols = Number.isFinite(value) && value >= 1 ? value : 2;
				const layoutRef = this.plugin.settings.rowLayouts[index];
				layoutRef.columns = safeCols;
				const part = Math.floor(100 / safeCols);
				const newParts: number[] = [];
				for (let j = 0; j < safeCols - 1; j++) {
					newParts.push(part);
				}
				newParts.push(100 - part * (safeCols - 1));
				layoutRef.proportion = newParts.join("/");
				const currentSlots = layoutRef.slots || [];
				while (currentSlots.length < safeCols) {
					currentSlots.push("none");
				}
				while (currentSlots.length > safeCols) {
					currentSlots.pop();
				}
				this.pruneSlotOverrides(layoutRef.slotHeadings, currentSlots);
				this.pruneSlotOverrides(layoutRef.vaultListSlots, currentSlots);
				this.pruneSlotOverrides(layoutRef.dividerSlots, currentSlots);
			};
			slider
				.setLimits(1, 4, 1)
				.setValue(layout.columns)
				.setDynamicTooltip()
				.onChange(async (value) => {
					applyColumns(value);
					await this.saveAndRefresh();
				});
		});

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
					this.updateRowPreviewWidths(previewColEls, value, cols);
				}),
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
			const slotList: ContentSlotType[] = isSubSlot
				? (slotVal as ContentSlotType[])
				: [slotVal as ContentSlotType];

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
					const slotLabelEl = slotRow.createEl("span", {
						text: `Slot ${si + 1}:`,
						cls: "setting-item-description",
					});
					slotLabelEl.style.minWidth = "60px";
				}

				const slotSelect = slotRow.createEl("select", { cls: "dropdown" });
				for (const [key, label] of Object.entries(CONTENT_SLOT_OPTIONS)) {
					const opt = slotSelect.createEl("option", { text: label, value: key });
					if (!this.isSlotEnabled(key as ContentSlotType)) opt.disabled = true;
					if (key === currentSlot) opt.selected = true;
				}
				slotSelect.addEventListener("change", async () => {
					const newVal = slotSelect.value as ContentSlotType;
					if (isSubSlot) {
						(this.plugin.settings.rowLayouts[index].slots[i] as ContentSlotType[])[si] = newVal;
					} else {
						this.plugin.settings.rowLayouts[index].slots[i] = newVal;
					}
					await this.saveAndRefresh();
				});

				// Remove button for sub-slots
				if (isSubSlot && slotList.length > 1) {
					const removeBtn = slotRow.createEl("button", { cls: "nexus-row-editor-card-btn" });
					setIcon(removeBtn, "x");
					removeBtn.addEventListener("click", async () => {
						const layoutRef = this.plugin.settings.rowLayouts[index];
						const arr = layoutRef.slots[i] as ContentSlotType[];
						const oldLen = arr.length;
						arr.splice(si, 1);
						if (arr.length === 1) {
							layoutRef.slots[i] = arr[0];
						}
						// Shift overrides down so configs follow their slots (#1/#2)
						for (const map of [
							layoutRef.slotHeadings,
							layoutRef.vaultListSlots,
							layoutRef.dividerSlots,
						]) {
							if (!map) continue;
							for (let p = si; p < arr.length; p++) {
								const from = `${i}-${p + 1}`;
								if (from in map) map[`${i}-${p}`] = map[from];
							}
							for (let p = arr.length; p < oldLen; p++) {
								delete map[`${i}-${p}`];
							}
							if (arr.length === 1 && `${i}-0` in map) {
								map[String(i)] = map[`${i}-0`];
								delete map[`${i}-0`];
							}
						}
						await this.saveAndRefresh();
					});
				}

				// Heading config fields (when slot is "heading")
				if (currentSlot === "heading") {
					this.renderHeadingConfigEditor(
						fields,
						subKey,
						isSubSlot,
						() => {
							return (this.plugin.settings.rowLayouts[index].slotHeadings || {})[subKey];
						},
						async (patch) => {
							const h = (this.plugin.settings.rowLayouts[index].slotHeadings ??= {});
							h[subKey] = { ...(h[subKey] || { text: "Section" }), ...patch };
							await this.plugin.saveSettings();
						},
					);
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
				const layoutRef = this.plugin.settings.rowLayouts[index];
				const current = layoutRef.slots[i];
				if (Array.isArray(current)) {
					current.push("none");
				} else {
					layoutRef.slots[i] = [current, "none"];
					// Migrate the single-slot config to the first sub-slot key (#3)
					for (const map of [layoutRef.slotHeadings, layoutRef.vaultListSlots, layoutRef.dividerSlots]) {
						if (!map) continue;
						if (String(i) in map) {
							map[`${i}-0`] = map[String(i)];
							delete map[String(i)];
						}
					}
				}
				await this.saveAndRefresh();
			});
		}
	}

	private renderColumnLayoutCard(
		containerEl: HTMLElement,
		layout: ColumnLayoutEntry,
		index: number,
	): void {
		const layoutId = layout.id || String(index);
		const isCollapsed = this.isCollapsed(NexusSettingTab.collapseKey("col", layoutId));

		const heading = containerEl.createDiv({ cls: "nexus-settings-moc-heading" });
		const { titleWrap, actions } = this.setupDragAndDrop(
			heading,
			index,
			this.plugin.settings.columnLayouts,
			isCollapsed,
		);

		// Title with slot summary
		const slots = layout.slots || [];
		const slotSummary = slots.map((s) => CONTENT_SLOT_OPTIONS[s] || "Empty").join(" → ");
		titleWrap.createEl("span", { text: `${layout.name} (${slotSummary})` });

		// Delete button
		const deleteBtn = actions.createEl("button", {
			cls: "nexus-settings-moc-btn--delete",
			attr: { "aria-label": "Remove" },
		});
		setIcon(deleteBtn, "trash");
		deleteBtn.addEventListener("click", async (e) => {
			e.stopPropagation();
			new ConfirmModal(
				this.app,
				`Remove "${layout.name}"?`,
				"This column layout will be removed from your dashboard.",
				async () => {
					this.plugin.settings.columnLayouts.splice(index, 1);
					this.deleteCollapsed(NexusSettingTab.collapseKey("col", layoutId));
					await this.saveAndRefresh();
				},
			).open();
		});

		// Toggle collapse
		heading.addEventListener("click", () => {
			this.setCollapsed(NexusSettingTab.collapseKey("col", layoutId), !isCollapsed);
			void this.plugin.saveSettings();
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
			slotEl.createEl("span", {
				text: CONTENT_SLOT_OPTIONS[slot] || "Empty",
				cls: "nexus-row-editor-col-label",
			});
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
				}),
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
				}),
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
				this.plugin.settings.columnLayouts[index].align = value as
					"left" | "center" | "right" | "stretch";
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

			const slotLabel = slotRow.createEl("span", {
				text: `Slot ${i + 1}:`,
				cls: "setting-item-description",
			});
			slotLabel.style.minWidth = "60px";

			const slotSelect = slotRow.createEl("select", { cls: "dropdown" });
			for (const [key, label] of Object.entries(CONTENT_SLOT_OPTIONS)) {
				const opt = slotSelect.createEl("option", { text: label, value: key });
				if (!this.isSlotEnabled(key as ContentSlotType)) opt.disabled = true;
				if (key === colSlots[i]) opt.selected = true;
			}
			slotSelect.addEventListener("change", async () => {
				this.plugin.settings.columnLayouts[index].slots[i] = slotSelect.value as ContentSlotType;
				await this.saveAndRefresh();
			});

			const removeBtn = slotRow.createEl("button", { cls: "nexus-row-editor-card-btn" });
			setIcon(removeBtn, "x");
			removeBtn.addEventListener("click", async () => {
				const layoutRef = this.plugin.settings.columnLayouts[index];
				const oldLen = layoutRef.slots.length;
				layoutRef.slots.splice(i, 1);
				// Shift overrides down so configs follow their slots (#3)
				for (const map of [layoutRef.slotHeadings, layoutRef.vaultListSlots, layoutRef.dividerSlots]) {
					if (!map) continue;
					for (let p = i; p < layoutRef.slots.length; p++) {
						const from = String(p + 1);
						if (from in map) map[String(p)] = map[from];
					}
					for (let p = layoutRef.slots.length; p < oldLen; p++) {
						delete map[String(p)];
					}
				}
				await this.saveAndRefresh();
			});

			// Heading config fields (when slot is "heading")
			if (colSlots[i] === "heading") {
				const subKey = String(i);
				this.renderHeadingConfigEditor(
					fields,
					subKey,
					false,
					() => {
						return (this.plugin.settings.columnLayouts[index].slotHeadings || {})[subKey];
					},
					async (patch) => {
						const h = (this.plugin.settings.columnLayouts[index].slotHeadings ??= {});
						h[subKey] = { ...(h[subKey] || { text: "Section" }), ...patch };
						await this.plugin.saveSettings();
					},
				);
			}

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
			await this.saveAndRefresh();
		});
	}

	private renderHeadingConfigEditor(
		fields: HTMLElement,
		_subKey: string,
		isSubSlot: boolean,
		getCfg: () => HeadingConfig | undefined,
		onUpdate: (patch: Partial<HeadingConfig>) => Promise<void>,
	): void {
		const headingCfg = getCfg() || { text: "Section" };
		const pad = isSubSlot ? "68px" : "8px";

		const textRow = fields.createDiv({ cls: "nexus-column-slot-row" });
		textRow.style.display = "flex";
		textRow.style.alignItems = "center";
		textRow.style.gap = "8px";
		textRow.style.paddingLeft = pad;
		const textLabel = textRow.createEl("span", { text: "Text:", cls: "setting-item-description" });
		textLabel.style.minWidth = "40px";
		const textInput = textRow.createEl("input", { type: "text", cls: "setting-text-input" });
		textInput.value = headingCfg.text || "";
		textInput.placeholder = "Heading text";
		textInput.addEventListener("change", () => {
			void onUpdate({ text: textInput.value });
		});

		const colorRow = fields.createDiv({ cls: "nexus-column-slot-row" });
		colorRow.style.display = "flex";
		colorRow.style.alignItems = "center";
		colorRow.style.gap = "8px";
		colorRow.style.paddingLeft = pad;
		const colorLabel = colorRow.createEl("span", { text: "Color:", cls: "setting-item-description" });
		colorLabel.style.minWidth = "40px";
		const colorInput = colorRow.createEl("input", { type: "text", cls: "setting-text-input" });
		colorInput.value = headingCfg.color || "";
		colorInput.placeholder = "CSS color (optional)";
		colorInput.addEventListener("change", () => {
			void onUpdate({ color: colorInput.value || undefined });
		});

		const asRow = fields.createDiv({ cls: "nexus-column-slot-row" });
		asRow.style.display = "flex";
		asRow.style.alignItems = "center";
		asRow.style.gap = "8px";
		asRow.style.paddingLeft = pad;

		const alignLabel = asRow.createEl("span", { text: "Align:", cls: "setting-item-description" });
		alignLabel.style.minWidth = "40px";
		const alignSelect = asRow.createEl("select", { cls: "dropdown" });
		for (const [ak, al] of [
			["left", "Left"],
			["center", "Center"],
			["right", "Right"],
		]) {
			const opt = alignSelect.createEl("option", { text: al, value: ak });
			if (ak === (headingCfg.align || "left")) opt.selected = true;
		}
		alignSelect.addEventListener("change", () => {
			void onUpdate({ align: alignSelect.value as "left" | "center" | "right" });
		});

		const sizeLabel = asRow.createEl("span", { text: "Size:", cls: "setting-item-description" });
		sizeLabel.style.marginLeft = "12px";
		const sizeSelect = asRow.createEl("select", { cls: "dropdown" });
		for (const [sk, sl] of [
			["small", "Small"],
			["medium", "Medium"],
			["large", "Large"],
		]) {
			const opt = sizeSelect.createEl("option", { text: sl, value: sk });
			if (sk === (headingCfg.size || "medium")) opt.selected = true;
		}
		sizeSelect.addEventListener("change", () => {
			void onUpdate({ size: sizeSelect.value as "small" | "medium" | "large" });
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

		this.renderCollapseAllBar(containerEl, this.collectComponentKeys());

		this.renderMocCardsSection(containerEl);

		// ── Stats ──────────────────────────────────────
		this.renderStatsSection(containerEl);

		// ── Search ─────────────────────────────────────
		this.renderSearchSection(containerEl);

		// ── Vault Activity ──────────────────────────────
		this.renderVaultActivitySection(containerEl);

		// ── Quick Links ────────────────────────────────
		this.renderQuickLinksSection(containerEl);

		// ── Heatmap ─────────────────────────────────────
		this.renderHeatmapSection(containerEl);

		// ── Activity Timeline (incl. tracking) ─────────
		this.renderActivityTimelineSection(containerEl);

		// ── Clock ──────────────────────────────────────
		this.renderClockSection(containerEl);

		// ── File Types ─────────────────────────────────
		this.renderFileTypesSection(containerEl);

		// ── Task Summary ───────────────────────────────
		this.renderTaskSummarySection(containerEl);

		// ── Divider style (global) ─────────────────────
		this.renderDividerStyleSection(containerEl);
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
						(m: Record<string, unknown>) =>
							m && typeof m.path === "string" && typeof m.title === "string",
					);
					if (!validMocs) {
						new Notice("Invalid settings file: malformed MOC entries");
						return;
					}
				}
				if (data.stats) {
					const validStats = data.stats.every(
						(s: Record<string, unknown>) =>
							s && typeof s.folder === "string" && typeof s.label === "string",
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
						(v: Record<string, unknown>) => v && typeof v.name === "string",
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
				this.sanitizeImportedSettings();
				await this.saveAndRefresh();
				new Notice("Settings imported");
			} catch {
				new Notice("Invalid settings file");
			}
		};
		input.click();
	}

	// ── MOC Card with drag-and-drop + color picker ────────────

	renderMocCard(containerEl: HTMLElement, moc: MocEntry, index: number): void {
		const isCollapsed = this.isCollapsed(NexusSettingTab.collapseKey("moc", index));

		const heading = containerEl.createDiv({ cls: "nexus-settings-moc-heading" });
		const { titleWrap, actions } = this.setupDragAndDrop(
			heading,
			index,
			this.plugin.settings.mocs,
			this.isCollapsed(NexusSettingTab.collapseKey("moc", index)),
			false,
		);

		// Title
		titleWrap.createEl("span", { text: moc.title || "Untitled" });

		// Delete button
		const removeBtn = actions.createEl("button", {
			cls: "nexus-settings-moc-btn--delete",
			attr: { "aria-label": "Remove" },
		});
		setIcon(removeBtn, "trash");
		removeBtn.addEventListener("click", async (e) => {
			e.stopPropagation();
			new ConfirmModal(
				this.app,
				`Remove "${moc.title}"?`,
				"This MOC card will be removed from the dashboard. You can add it back later.",
				async () => {
					this.plugin.settings.mocs.splice(index, 1);
					await this.saveAndRefresh();
				},
			).open();
		});

		// Toggle collapse
		heading.addEventListener("click", () => {
			this.setCollapsed(NexusSettingTab.collapseKey("moc", index), !isCollapsed);
			void this.plugin.saveSettings();
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

		const datalist = notePathSetting.settingEl.createEl("datalist", {
			attr: { id: notePathDatalistId },
		});
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
					}),
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
					}),
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
					iconGrid
						.querySelectorAll(".nexus-icon-picker-item")
						.forEach((el) => el.classList.remove("nexus-icon-picker-item-active"));
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
			// Commit typed value so it isn't lost when the user clicks away (#17)
			iconPreview.innerHTML = SMALL_ICONS[iconInput.value] || SMALL_ICONS["MOC"] || "";
			this.plugin.settings.mocs[index].icon = iconInput.value;
			void this.plugin.saveSettings();
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
			this.plugin.settings.mocs[index].icon = iconInput.value;
			void this.plugin.saveSettings();
		});

		iconInput.addEventListener("keydown", (e) => {
			if (e.key === "Escape") {
				iconInput.blur();
			}
			if (e.key === "Enter") {
				this.plugin.settings.mocs[index].icon = iconInput.value;
				void this.plugin.saveSettings();
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
		const folders = [...getVaultFolders(this.app)];
		if (stat.folder && !folders.includes(stat.folder)) {
			folders.push(stat.folder);
			folders.sort();
		}

		const wrap = containerEl.createDiv({ cls: "nexus-stat-entry" });

		// Row 1: label | metric | delete
		const rowTop = wrap.createDiv({ cls: "nexus-stat-entry-row" });

		const labelField = rowTop.createDiv({ cls: "nexus-stat-entry-label" });
		new TextComponent(labelField)
			.setPlaceholder("Label")
			.setValue(stat.label)
			.onChange(async (value) => {
				this.plugin.settings.stats[index].label = value;
				await this.plugin.saveSettings();
			});

		const metricField = rowTop.createDiv({ cls: "nexus-stat-entry-metric" });
		new DropdownComponent(metricField)
			.addOption("files", "Files")
			.addOption("notes", "Notes")
			.addOption("size", "Size")
			.addOption("tags", "Tags")
			.setValue(stat.metric ?? "files")
			.onChange(async (value) => {
				this.plugin.settings.stats[index].metric = value as StatMetric;
				await this.plugin.saveSettings();
				updateSummary();
			});

		const deleteField = rowTop.createDiv({ cls: "nexus-stat-entry-delete" });
		new ExtraButtonComponent(deleteField)
			.setIcon("trash")
			.setTooltip("Remove")
			.onClick(async () => {
				new ConfirmModal(
					this.app,
					`Remove stat "${stat.label}"?`,
					"This stat will be removed from the dashboard.",
					async () => {
						this.plugin.settings.stats.splice(index, 1);
						await this.saveAndRefresh();
					},
				).open();
			});

		// Row 2: filter | scope | recursion
		const rowBottom = wrap.createDiv({ cls: "nexus-stat-entry-row" });

		const filterField = rowBottom.createDiv({ cls: "nexus-stat-entry-filter" });
		const filterDropdown = new DropdownComponent(filterField).addOption("", "All files");
		for (const f of folders) {
			filterDropdown.addOption(f, f);
		}
		filterDropdown.setValue(stat.folder).onChange(async (value) => {
			this.plugin.settings.stats[index].folder = value;
			await this.plugin.saveSettings();
			updateSummary();
		});

		const scopeField = rowBottom.createDiv({ cls: "nexus-stat-entry-scope" });
		new DropdownComponent(scopeField)
			.addOption("all", "All time")
			.addOption("today", "Today")
			.addOption("week", "This week")
			.addOption("month", "This month")
			.addOption("year", "This year")
			.setValue(stat.scope ?? "all")
			.onChange(async (value) => {
				this.plugin.settings.stats[index].scope = value as StatScope;
				await this.plugin.saveSettings();
				updateSummary();
			});

		const recursiveField = rowBottom.createDiv({ cls: "nexus-stat-entry-recursive" });
		const recursive = stat.recursive ?? true;
		new DropdownComponent(recursiveField)
			.addOption("recursive", "Incl. subfolders")
			.addOption("direct", "Direct only")
			.setValue(recursive ? "recursive" : "direct")
			.onChange(async (value) => {
				this.plugin.settings.stats[index].recursive = value === "recursive";
				await this.plugin.saveSettings();
				updateSummary();
			});

		const summary = wrap.createEl("div", { cls: "nexus-stat-entry-summary" });
		const updateSummary = (): void => {
			const text = statSummary(stat);
			summary.setText(text);
			summary.setAttr("title", text);
		};
		updateSummary();
	}

	// ── Divider preview ───────────────────────────────────────

	private renderDividerPreview(containerEl: HTMLElement, labelText?: string): void {
		const existing = containerEl.querySelector(".nexus-settings-divider-preview");
		if (existing) existing.remove();

		const d = this.plugin.settings.dividerDesign;
		const preview = containerEl.createDiv({ cls: "nexus-settings-divider-preview" });
		const row = preview.createDiv({ cls: "nexus-settings-divider-preview-row" });

		const lineLeft = row.createDiv({ cls: "nexus-settings-divider-preview-line" });
		lineLeft.style.background = d.gradient;
		lineLeft.style.height = d.lineWidth;

		const labelEl = row.createEl("span", {
			cls: "nexus-settings-divider-preview-label",
			text: labelText || "DIVIDER",
		});
		labelEl.style.fontSize = d.labelSize;
		labelEl.style.fontWeight = d.labelWeight;
		labelEl.style.color = d.labelColor;
		labelEl.style.letterSpacing = d.labelSpacing;

		const lineRight = row.createDiv({ cls: "nexus-settings-divider-preview-line" });
		lineRight.style.background = d.gradient;
		lineRight.style.height = d.lineWidth;
	}

	// ── Component cards ──────────────────────────────────────

	private renderComponentCardHeader(
		containerEl: HTMLElement,
		id: string,
		title: string,
		description: string,
		enabled: boolean,
	): { card: HTMLElement; header: HTMLElement; body: HTMLElement | null; isCollapsed: boolean } {
		const isCollapsed = this.isCollapsed(NexusSettingTab.collapseKey("component", id));

		const card = containerEl.createDiv({ cls: "nexus-component-card" });
		if (!enabled) card.classList.add("is-disabled");

		const header = card.createDiv({ cls: "nexus-component-card-header" });

		const chevron = header.createDiv({
			cls: `nexus-component-card-chevron ${isCollapsed ? "collapsed" : ""}`,
		});
		chevron.innerHTML = SVG.chevronDown;

		const titleWrap = header.createDiv({ cls: "nexus-component-card-title" });
		titleWrap.createEl("span", { text: title, cls: "nexus-component-card-title-text" });
		titleWrap.createEl("span", { text: description, cls: "nexus-component-card-title-desc" });

		return {
			card,
			header,
			body: isCollapsed ? null : card.createDiv({ cls: "nexus-component-card-body" }),
			isCollapsed,
		};
	}

	private renderComponentCard(
		containerEl: HTMLElement,
		id: string,
		title: string,
		description: string,
		enabled: boolean,
		dividerSettings: DividerControlSettings | null,
		onToggle: (value: boolean) => Promise<void>,
		renderBody: (bodyEl: HTMLElement) => void,
	): void {
		const { header, body, isCollapsed } = this.renderComponentCardHeader(
			containerEl,
			id,
			title,
			description,
			enabled,
		);

		const toggleEl = header.createDiv({ cls: "nexus-component-card-toggle" });
		const toggle = new ToggleComponent(toggleEl);
		toggle.setValue(enabled);
		toggle.onChange(async (value) => {
			await onToggle(value);
			this.display();
		});

		header.addEventListener("click", (e) => {
			if (toggleEl.contains(e.target as Node)) return;
			this.setCollapsed(NexusSettingTab.collapseKey("component", id), !isCollapsed);
			void this.plugin.saveSettings();
			this.display();
		});

		if (!body) return;

		if (dividerSettings) {
			this.renderDividerControl(body, dividerSettings);
		}

		renderBody(body);
	}

	private renderDividerControl(parent: HTMLElement, settings: DividerControlSettings): void {
		const group = parent.createDiv({ cls: "nexus-settings-subgroup" });

		let labelInput: TextComponent | null = null;

		new Setting(group)
			.setName("Show divider")
			.setDesc("Show a divider above this component. Text shown inside the divider.")
			.addToggle((toggle) =>
				toggle.setValue(settings.show).onChange(async (value) => {
					await settings.onShow(value);
					labelInput?.setDisabled(!value);
				}),
			)
			.addText((text) => {
				labelInput = text
					.setPlaceholder(settings.labelPlaceholder)
					.setValue(settings.label)
					.setDisabled(!settings.show)
					.onChange(async (value) => {
						await settings.onLabel(value);
					});
			});
	}

	private renderSubgroup(parent: HTMLElement, title: string): HTMLElement {
		const group = parent.createDiv({ cls: "nexus-settings-subgroup" });
		group.createEl("div", { text: title, cls: "nexus-settings-subgroup-title" });
		return group;
	}

	// ── Component sections ───────────────────────────────────

	private renderMocCardsSection(containerEl: HTMLElement): void {
		this.renderComponentCard(
			containerEl,
			"moc-cards",
			"MOC Cards",
			"Map of content cards",
			this.plugin.settings.showMocCards,
			{
				show: this.plugin.settings.showMocDivider,
				label: this.plugin.settings.mocDividerLabel,
				labelPlaceholder: "MOC CARDS",
				onShow: async (value) => {
					this.plugin.settings.showMocDivider = value;
					await this.plugin.saveSettings();
				},
				onLabel: async (value) => {
					this.plugin.settings.mocDividerLabel = value || "MOC CARDS";
					await this.plugin.saveSettings();
				},
			},
			async (value) => {
				this.plugin.settings.showMocCards = value;
				await this.plugin.saveSettings();
			},
			(body) => {
				body.createEl("p", {
					text: "Configure the MOC cards shown on your dashboard.",
					cls: "setting-item-description",
				});

				this.plugin.settings.mocs.forEach((moc, i) => {
					this.renderMocCard(body, moc, i);
				});

				new Setting(body)
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
								await this.saveAndRefresh();
							}),
					);

				new Setting(body)
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
							}),
					);

				new Setting(body)
					.setName("Show graph links")
					.setDesc("Inject graph wikilinks on empty code blocks (can be overridden per-block)")
					.addToggle((toggle) =>
						toggle.setValue(this.plugin.settings.showGraph).onChange(async (value) => {
							this.plugin.settings.showGraph = value;
							await this.plugin.saveSettings();
						}),
					);
			},
		);
	}

	private renderStatsSection(containerEl: HTMLElement): void {
		this.renderComponentCard(
			containerEl,
			"stats",
			"Stats",
			"Vault statistics counters",
			this.plugin.settings.showStats,
			null,
			async (value) => {
				this.plugin.settings.showStats = value;
				await this.plugin.saveSettings();
			},
			(body) => {
				body.createEl("p", {
					text: "Configure the stat counters shown on the dashboard.",
					cls: "setting-item-description",
				});

				this.plugin.settings.stats.forEach((stat, i) => {
					try {
						this.renderStatEntry(body, stat, i);
					} catch (err) {
						// eslint-disable-next-line no-console -- error guard; one bad entry shouldn't blank the tab
						console.error("[NEXUS] Failed to render stat entry:", err);
					}
				});

				new Setting(body)
					.setName("Add stat")
					.setDesc("Add a new stat counter")
					.addButton((btn) =>
						btn
							.setButtonText("+ Add Stat")
							.setCta()
							.onClick(async () => {
								this.plugin.settings.stats.push({
									folder: "",
									label: "New Stat",
									metric: "files",
									scope: "all",
									recursive: true,
								});
								await this.saveAndRefresh();
							}),
					);

				// ── New Note button ─────────────────────
				const nnGroup = this.renderSubgroup(body, "New Note button");

				new Setting(nnGroup)
					.setName("Show button")
					.setDesc('Show a "+ New Note" button next to the stats.')
					.addToggle((toggle) =>
						toggle.setValue(this.plugin.settings.statsNewNote.enabled).onChange(async (value) => {
							this.plugin.settings.statsNewNote.enabled = value;
							await this.plugin.saveSettings();
						}),
					);

				new Setting(nnGroup)
					.setName("Button label")
					.setDesc(
						"Text shown on the button. New notes are named with today's date (e.g. 2026-08-06.md).",
					)
					.addText((text) =>
						text
							.setPlaceholder("+ New Note")
							.setValue(this.plugin.settings.statsNewNote.label)
							.onChange(async (value) => {
								this.plugin.settings.statsNewNote.label = value || "+ New Note";
								await this.plugin.saveSettings();
							}),
					);

				const folders = getVaultFolders(this.app);
				new Setting(nnGroup)
					.setName("Create note in")
					.setDesc("Folder for new notes (e.g. Journal, Inbox). Blank = vault root.")
					.addDropdown((dropdown) => {
						dropdown.addOption("", "Vault root");
						for (const f of folders) {
							dropdown.addOption(f, f);
						}
						dropdown.setValue(this.plugin.settings.statsNewNote.folder);
						dropdown.onChange(async (value) => {
							this.plugin.settings.statsNewNote.folder = value;
							await this.plugin.saveSettings();
						});
					});

				new Setting(nnGroup)
					.setName("Template file")
					.setDesc("Optional template applied to new notes. Blank = empty note.")
					.addText((text) =>
						text
							.setPlaceholder("Templates/Daily Note")
							.setValue(this.plugin.settings.statsNewNote.template)
							.onChange(async (value) => {
								this.plugin.settings.statsNewNote.template = value.trim();
								await this.plugin.saveSettings();
							}),
					);

				// ── Copy DSL ─────────────────────────────
				new Setting(body)
					.setName("Copy as code block")
					.setDesc("Copy your current stats configuration as a dashboard code block.")
					.addButton((btn) =>
						btn.setButtonText("Copy").onClick(() => {
							copy(this.buildStatsDsl());
							new Notice("Nexus Dashboard: stats code block copied");
						}),
					);
			},
		);
	}

	private buildStatsDsl(): string {
		const opts = this.plugin.settings;
		const lines: string[] = ["stats:", "  show: true"];
		for (const s of opts.stats) {
			lines.push(`  - label: "${s.label}"`);
			lines.push(`    path: "${s.folder}"`);
			lines.push(`    metric: ${s.metric ?? "files"}`);
			lines.push(`    scope: ${s.scope ?? "all"}`);
			lines.push(`    recursive: ${s.recursive ?? true}`);
		}
		const nn = opts.statsNewNote;
		if (nn?.enabled) {
			lines.push(`  new-note: true`);
			if (nn.folder) lines.push(`  new-note-folder: "${nn.folder}"`);
			if (nn.template) lines.push(`  new-note-template: "${nn.template}"`);
			if (nn.label && nn.label !== "+ New Note") {
				lines.push(`  new-note-label: "${nn.label}"`);
			}
		}
		return lines.join("\n");
	}

	private renderSearchSection(containerEl: HTMLElement): void {
		this.renderComponentCard(
			containerEl,
			"search",
			"Search",
			"Vault-wide search bar",
			this.plugin.settings.showSearch,
			null,
			async (value) => {
				this.plugin.settings.showSearch = value;
				await this.plugin.saveSettings();
			},
			(body) => {
				new Setting(body)
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
			},
		);
	}

	private renderVaultActivitySection(containerEl: HTMLElement): void {
		this.renderComponentCard(
			containerEl,
			"vault-activity",
			"Vault Activity",
			"Terminal-style file lists",
			this.plugin.settings.showVaultActivity,
			{
				show: this.plugin.settings.showVaultActivityDivider,
				label: this.plugin.settings.vaultActivityLabel,
				labelPlaceholder: "VAULT ACTIVITY",
				onShow: async (value) => {
					this.plugin.settings.showVaultActivityDivider = value;
					await this.plugin.saveSettings();
				},
				onLabel: async (value) => {
					this.plugin.settings.vaultActivityLabel = value;
					await this.plugin.saveSettings();
				},
			},
			async (value) => {
				this.plugin.settings.showVaultActivity = value;
				await this.plugin.saveSettings();
			},
			(body) => {
				body.createEl("p", {
					text:
						"Show a terminal-style list of files. Pick a preset per slot; a slot with no list selected shows recently modified files from the whole vault. Leave a list's label empty to hide its header.",
					cls: "setting-item-description",
				});

				const defaultGroup = this.renderSubgroup(body, "Default list");
				new Setting(defaultGroup)
					.setName("Count")
					.setDesc("Number of files shown in slots with no list selected")
					.addSlider((slider) =>
						slider
							.setLimits(3, 50, 1)
							.setValue(this.plugin.settings.vaultActivityCount)
							.setDynamicTooltip()
							.onChange(async (value) => {
								this.plugin.settings.vaultActivityCount = value;
								await this.plugin.saveSettings();
							}),
					);

				new Setting(defaultGroup)
					.setName("Show fade mask")
					.setDesc("Fade the bottom of the list to hint at more content")
					.addToggle((toggle) =>
						toggle.setValue(this.plugin.settings.vaultActivityShowFade).onChange(async (value) => {
							this.plugin.settings.vaultActivityShowFade = value;
							await this.plugin.saveSettings();
						}),
					);

				new Setting(defaultGroup)
					.setName("Maximum list height")
					.setDesc("Max height of the list before scrolling (120–800px)")
					.addSlider((slider) =>
						slider
							.setLimits(120, 800, 10)
							.setValue(this.plugin.settings.vaultActivityMaxHeight)
							.setDynamicTooltip()
							.onChange(async (value) => {
								this.plugin.settings.vaultActivityMaxHeight = value;
								await this.plugin.saveSettings();
							}),
					);

				const listsGroup = this.renderSubgroup(body, "Vault lists");
				this.plugin.settings.vaultLists.forEach((vl, i) => {
					this.renderVaultListEntry(listsGroup, vl, i);
				});

				new Setting(listsGroup)
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
									label: "",
								});
								await this.saveAndRefresh();
							}),
					);
			},
		);
	}

	private renderQuickLinksSection(containerEl: HTMLElement): void {
		this.renderComponentCard(
			containerEl,
			"quick-links",
			"Quick Links",
			"Links to open instantly",
			this.plugin.settings.showQuickLinks,
			null,
			async (value) => {
				this.plugin.settings.showQuickLinks = value;
				await this.plugin.saveSettings();
			},
			(body) => {
				this.renderQuickLinksEditor(body);

				this.plugin.settings.showBookmarksAsLinks ??= false;
				new Setting(body)
					.setName("Show Obsidian bookmarks")
					.setDesc("Display items from the built-in Bookmarks plugin as quick links on the dashboard.")
					.addToggle((toggle) =>
						toggle.setValue(this.plugin.settings.showBookmarksAsLinks).onChange(async (value) => {
							this.plugin.settings.showBookmarksAsLinks = value;
							await this.saveAndRefresh();
						}),
					);
			},
		);
	}

	private renderHeatmapSection(containerEl: HTMLElement): void {
		this.renderComponentCard(
			containerEl,
			"heatmap",
			"Heatmap",
			"GitHub-style contribution calendar",
			this.plugin.settings.showHeatmap,
			{
				show: this.plugin.settings.showHeatmapDivider,
				label: this.plugin.settings.heatmapLabel,
				labelPlaceholder: "CONTRIBUTION ACTIVITY",
				onShow: async (value) => {
					this.plugin.settings.showHeatmapDivider = value;
					await this.plugin.saveSettings();
				},
				onLabel: async (value) => {
					this.plugin.settings.heatmapLabel = value;
					await this.plugin.saveSettings();
				},
			},
			async (value) => {
				this.plugin.settings.showHeatmap = value;
				await this.plugin.saveSettings();
			},
			(body) => {
				new Setting(body)
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
							}),
					);
			},
		);
	}

	private renderActivityTimelineSection(containerEl: HTMLElement): void {
		this.renderComponentCard(
			containerEl,
			"activity-timeline",
			"Activity Timeline",
			"Chronological log of vault activity",
			this.plugin.settings.showActivityTimeline,
			{
				show: this.plugin.settings.showActivityTimelineDivider,
				label: this.plugin.settings.activityTimelineLabel,
				labelPlaceholder: "ACTIVITY",
				onShow: async (value) => {
					this.plugin.settings.showActivityTimelineDivider = value;
					await this.plugin.saveSettings();
				},
				onLabel: async (value) => {
					this.plugin.settings.activityTimelineLabel = value;
					await this.plugin.saveSettings();
				},
			},
			async (value) => {
				this.plugin.settings.showActivityTimeline = value;
				await this.plugin.saveSettings();
			},
			(body) => {
				const displayGroup = this.renderSubgroup(body, "Display");
				new Setting(displayGroup)
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
							}),
					);

				const listGroup = this.renderSubgroup(body, "List appearance");
				new Setting(listGroup)
					.setName("Show fade mask")
					.setDesc("Fade the bottom of the list to hint at more content")
					.addToggle((toggle) =>
						toggle.setValue(this.plugin.settings.activityTimelineShowFade).onChange(async (value) => {
							this.plugin.settings.activityTimelineShowFade = value;
							await this.plugin.saveSettings();
						}),
					);

				new Setting(listGroup)
					.setName("Maximum list height")
					.setDesc("Max height of the list before scrolling (120–800px)")
					.addSlider((slider) =>
						slider
							.setLimits(120, 800, 10)
							.setValue(this.plugin.settings.activityTimelineMaxHeight)
							.setDynamicTooltip()
							.onChange(async (value) => {
								this.plugin.settings.activityTimelineMaxHeight = value;
								await this.plugin.saveSettings();
							}),
					);

				new Setting(listGroup)
					.setName("Relative times")
					.setDesc('Show "3m ago" instead of clock times')
					.addToggle((toggle) =>
						toggle.setValue(this.plugin.settings.activityTimelineShowRelative).onChange(async (value) => {
							this.plugin.settings.activityTimelineShowRelative = value;
							await this.plugin.saveSettings();
						}),
					);

				new Setting(listGroup)
					.setName("Show date separators")
					.setDesc('Show "Today" / "Yesterday" / date headings')
					.addToggle((toggle) =>
						toggle.setValue(this.plugin.settings.activityTimelineShowDate).onChange(async (value) => {
							this.plugin.settings.activityTimelineShowDate = value;
							await this.plugin.saveSettings();
						}),
					);

				new Setting(listGroup)
					.setName("Show filter chips")
					.setDesc("Show interactive action filter chips above the list")
					.addToggle((toggle) =>
						toggle.setValue(this.plugin.settings.activityTimelineShowChips).onChange(async (value) => {
							this.plugin.settings.activityTimelineShowChips = value;
							await this.plugin.saveSettings();
						}),
					);

				new Setting(listGroup)
					.setName('Show "load more" button')
					.setDesc("Show a button to load more entries beyond the count")
					.addToggle((toggle) =>
						toggle.setValue(this.plugin.settings.activityTimelineShowMore).onChange(async (value) => {
							this.plugin.settings.activityTimelineShowMore = value;
							await this.plugin.saveSettings();
						}),
					);

				new Setting(listGroup)
					.setName("Group by")
					.setDesc("Group timeline entries by day or by file")
					.addDropdown((dropdown) => {
						dropdown.addOption("day", "Day");
						dropdown.addOption("file", "File");
						dropdown.setValue(this.plugin.settings.activityTimelineGroup);
						dropdown.onChange(async (value) => {
							this.plugin.settings.activityTimelineGroup = value as "day" | "file";
							await this.plugin.saveSettings();
						});
					});

				const filterGroup = this.renderSubgroup(body, "Filtering");
				new Setting(filterGroup)
					.setName("Only markdown")
					.setDesc("Only show activity for markdown files")
					.addToggle((toggle) =>
						toggle.setValue(this.plugin.settings.activityTimelineOnlyMarkdown).onChange(async (value) => {
							this.plugin.settings.activityTimelineOnlyMarkdown = value;
							await this.plugin.saveSettings();
						}),
					);

				new Setting(filterGroup)
					.setName("Include folders")
					.setDesc("Restrict to these folder paths (comma-separated). Empty shows everything.")
					.addText((text) =>
						text
							.setPlaceholder("Journal, Projects")
							.setValue(this.plugin.settings.activityTimelineIncludeFolders)
							.onChange(async (value) => {
								this.plugin.settings.activityTimelineIncludeFolders = value;
								await this.plugin.saveSettings();
							}),
					);

				const trackingGroup = this.renderSubgroup(body, "Tracking");
				new Setting(trackingGroup)
					.setName("Enable activity tracking")
					.setDesc("Record vault file/folder events and persist them to data.json")
					.addToggle((toggle) =>
						toggle.setValue(this.plugin.settings.activityTrackingEnabled).onChange(async (value) => {
							this.plugin.settings.activityTrackingEnabled = value;
							await this.plugin.saveSettings();
						}),
					);

				new Setting(trackingGroup)
					.setName("Track task checkboxes")
					.setDesc("Record when a task checkbox is toggled")
					.addToggle((toggle) =>
						toggle.setValue(this.plugin.settings.activityTaskTracking).onChange(async (value) => {
							this.plugin.settings.activityTaskTracking = value;
							await this.plugin.saveSettings();
						}),
					);

				new Setting(trackingGroup)
					.setName("Log size")
					.setDesc("Maximum number of events kept in the activity log (50–5000)")
					.addSlider((slider) =>
						slider
							.setLimits(50, 5000, 50)
							.setValue(this.plugin.settings.activityLogMax)
							.setDynamicTooltip()
							.onChange(async (value) => {
								this.plugin.settings.activityLogMax = value;
								await this.plugin.saveSettings();
							}),
					);

				new Setting(trackingGroup)
					.setName("Clear activity log")
					.setDesc("Remove all recorded activity events")
					.addButton((button) =>
						button
							.setButtonText("Clear")
							.setWarning()
							.onClick(() => {
								this.plugin.clearActivityLog();
							}),
					);
			},
		);
	}

	private renderClockSection(containerEl: HTMLElement): void {
		this.renderComponentCard(
			containerEl,
			"clock",
			"Clock",
			"Real-time digital clock",
			this.plugin.settings.showClock,
			{
				show: this.plugin.settings.showClockDivider,
				label: this.plugin.settings.clockLabel,
				labelPlaceholder: "CLOCK",
				onShow: async (value) => {
					this.plugin.settings.showClockDivider = value;
					await this.plugin.saveSettings();
				},
				onLabel: async (value) => {
					this.plugin.settings.clockLabel = value;
					await this.plugin.saveSettings();
				},
			},
			async (value) => {
				this.plugin.settings.showClock = value;
				await this.plugin.saveSettings();
			},
			(body) => {
				new Setting(body)
					.setName("Timezone")
					.setDesc("IANA timezone (e.g. America/New_York). Leave empty for local time.")
					.addText((text) =>
						text
							.setPlaceholder("Local time")
							.setValue(this.plugin.settings.clockTimezone)
							.onChange(async (value) => {
								this.plugin.settings.clockTimezone = value;
								await this.plugin.saveSettings();
							}),
					);

				new Setting(body)
					.setName("Show date")
					.setDesc("Show the date below the time")
					.addToggle((toggle) =>
						toggle.setValue(this.plugin.settings.clockShowDate).onChange(async (value) => {
							this.plugin.settings.clockShowDate = value;
							await this.plugin.saveSettings();
						}),
					);

				new Setting(body)
					.setName("Show seconds")
					.setDesc("Show seconds in the clock")
					.addToggle((toggle) =>
						toggle.setValue(this.plugin.settings.clockShowSeconds).onChange(async (value) => {
							this.plugin.settings.clockShowSeconds = value;
							await this.plugin.saveSettings();
						}),
					);

				new Setting(body)
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
			},
		);
	}

	private renderFileTypesSection(containerEl: HTMLElement): void {
		this.renderComponentCard(
			containerEl,
			"file-types",
			"File Types",
			"Horizontal bar chart of vault file types",
			this.plugin.settings.showFileTypeChart,
			{
				show: this.plugin.settings.showFileTypeChartDivider,
				label: this.plugin.settings.fileTypeChartLabel,
				labelPlaceholder: "FILE TYPES",
				onShow: async (value) => {
					this.plugin.settings.showFileTypeChartDivider = value;
					await this.plugin.saveSettings();
				},
				onLabel: async (value) => {
					this.plugin.settings.fileTypeChartLabel = value;
					await this.plugin.saveSettings();
				},
			},
			async (value) => {
				this.plugin.settings.showFileTypeChart = value;
				await this.plugin.saveSettings();
			},
			(body) => {
				new Setting(body)
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
							}),
					);
			},
		);
	}

	private renderTaskSummarySection(containerEl: HTMLElement): void {
		this.renderComponentCard(
			containerEl,
			"task-summary",
			"Task Summary",
			"Open/done tasks with progress",
			this.plugin.settings.showTaskSummary,
			{
				show: this.plugin.settings.showTaskSummaryDivider,
				label: this.plugin.settings.taskSummaryLabel,
				labelPlaceholder: "TASKS",
				onShow: async (value) => {
					this.plugin.settings.showTaskSummaryDivider = value;
					await this.plugin.saveSettings();
				},
				onLabel: async (value) => {
					this.plugin.settings.taskSummaryLabel = value;
					await this.plugin.saveSettings();
				},
			},
			async (value) => {
				this.plugin.settings.showTaskSummary = value;
				await this.plugin.saveSettings();
			},
			(body) => {
				const viewGroup = this.renderSubgroup(body, "Display");
				new Setting(viewGroup)
					.setName("Show progress bar")
					.setDesc("Show a progress bar below the stats counters")
					.addToggle((toggle) =>
						toggle.setValue(this.plugin.settings.taskSummaryShowProgress).onChange(async (value) => {
							this.plugin.settings.taskSummaryShowProgress = value;
							await this.plugin.saveSettings();
						}),
					);

				new Setting(viewGroup)
					.setName("Show task list")
					.setDesc("Show a scrollable list of unchecked tasks")
					.addToggle((toggle) =>
						toggle.setValue(this.plugin.settings.taskSummaryShowList).onChange(async (value) => {
							this.plugin.settings.taskSummaryShowList = value;
							await this.plugin.saveSettings();
						}),
					);

				new Setting(viewGroup)
					.setName("Show fade mask")
					.setDesc("Fade the bottom of the list to hint at more content")
					.addToggle((toggle) =>
						toggle.setValue(this.plugin.settings.taskSummaryShowFade).onChange(async (value) => {
							this.plugin.settings.taskSummaryShowFade = value;
							await this.plugin.saveSettings();
						}),
					);

				new Setting(viewGroup)
					.setName("Maximum list height")
					.setDesc("Max height of the list before scrolling (120–800px)")
					.addSlider((slider) =>
						slider
							.setLimits(120, 800, 10)
							.setValue(this.plugin.settings.taskSummaryMaxHeight)
							.setDynamicTooltip()
							.onChange(async (value) => {
								this.plugin.settings.taskSummaryMaxHeight = value;
								await this.plugin.saveSettings();
							}),
					);

				const filterGroup = this.renderSubgroup(body, "Filtering");
				new Setting(filterGroup)
					.setName("Folder filter")
					.setDesc("Only count tasks in this vault folder (leave empty for all)")
					.addText((text) =>
						text
							.setPlaceholder("Knowledge/Tasks & Action Management")
							.setValue(this.plugin.settings.taskSummaryPath)
							.onChange(async (value) => {
								this.plugin.settings.taskSummaryPath = value;
								await this.plugin.saveSettings();
							}),
					);

				new Setting(filterGroup)
					.setName("Tag filter")
					.setDesc("Comma-separated frontmatter tags to filter task files (leave empty for all)")
					.addText((text) =>
						text
							.setPlaceholder("todo, tasks")
							.setValue(this.plugin.settings.taskSummaryTags)
							.onChange(async (value) => {
								this.plugin.settings.taskSummaryTags = value;
								await this.plugin.saveSettings();
							}),
					);

				new Setting(filterGroup)
					.setName("Max tasks in list")
					.setDesc("Maximum number of tasks to display in the list (5–30)")
					.addSlider((slider) =>
						slider
							.setLimits(5, 30, 1)
							.setValue(this.plugin.settings.taskSummaryCount)
							.setDynamicTooltip()
							.onChange(async (value) => {
								this.plugin.settings.taskSummaryCount = value;
								await this.plugin.saveSettings();
							}),
					);
			},
		);
	}

	private renderDividerStyleSection(containerEl: HTMLElement): void {
		const { header, body, isCollapsed } = this.renderComponentCardHeader(
			containerEl,
			"divider-style",
			"Divider Style",
			"Global appearance of section dividers",
			true,
		);

		header.addEventListener("click", () => {
			this.setCollapsed(NexusSettingTab.collapseKey("component", "divider-style"), !isCollapsed);
			void this.plugin.saveSettings();
			this.display();
		});

		if (!body) return;

		body.createEl("p", {
			text: "Customize the appearance of section dividers. Labels are configured per component above.",
			cls: "setting-item-description",
		});

		const currentPreset = detectDividerPreset(this.plugin.settings.dividerDesign);
		new Setting(body)
			.setName("Divider style")
			.setDesc("Choose a divider style preset")
			.addDropdown((dropdown) => {
				for (const [key, name] of Object.entries(DIVIDER_PRESET_NAMES)) {
					dropdown.addOption(key, name);
				}
				dropdown.addOption("custom", "Custom…");
				dropdown.setValue(currentPreset);
				dropdown.onChange(async (value) => {
					if (value === "custom") {
						await this.plugin.saveSettings();
						this.display();
						return;
					}
					const preset = DIVIDER_PRESETS[value];
					if (preset) {
						this.plugin.settings.dividerDesign = { ...preset };
						await this.plugin.saveSettings();
						this.renderDividerPreview(dividerPreviewEl);
					}
				});
			});

		const dividerPreviewEl = body.createDiv();
		this.renderDividerPreview(dividerPreviewEl);

		// Custom style fields when no preset matches
		if (currentPreset === "custom") {
			const customGroup = this.renderSubgroup(body, "Custom style");
			const dd = this.plugin.settings.dividerDesign;
			const customFields: [string, string, keyof DividerDesign][] = [
				["Gradient", "CSS background (e.g. linear-gradient(90deg, #333, transparent))", "gradient"],
				["Line width", "CSS height (e.g. 2px)", "lineWidth"],
				["Label size", "CSS font-size (e.g. 0.75rem)", "labelSize"],
				["Label weight", "CSS font-weight (e.g. 600)", "labelWeight"],
				["Label color", "CSS color", "labelColor"],
				["Label spacing", "CSS margin (e.g. 0 0 0.5rem)", "labelSpacing"],
			];
			for (const [label, desc, key] of customFields) {
				new Setting(customGroup)
					.setName(label)
					.setDesc(desc)
					.addText((text) =>
						text.setValue(dd[key] || "").onChange(async (value) => {
							(this.plugin.settings.dividerDesign as unknown as Record<string, string>)[key] = value;
							await this.plugin.saveSettings();
							this.renderDividerPreview(dividerPreviewEl);
						}),
					);
			}
		}
	}

	// ── Quick Links ─────────────────────────────────────────

	/**
	 * MOC-style quick links editor. Each link is a heading row with a drag
	 * handle, chevron, label and trash button. Click to expand/collapse; drag
	 * to reorder; trash to delete. Mirrors MOC Cards.
	 */
	private renderQuickLinksEditor(containerEl: HTMLElement): void {
		const links = this.plugin.settings.quickLinks;

		if (links.length === 0) {
			const emptyRow = new Setting(containerEl);
			emptyRow.setName("Quick links");
			emptyRow.setDesc("No quick links yet.");
			emptyRow.addButton((btn) =>
				btn
					.setButtonText("+ Add Link")
					.setCta()
					.onClick(async () => {
						this.addQuickLink();
					}),
			);
			return;
		}

		links.forEach((link, index) => {
			const isCollapsed = this.isCollapsed(NexusSettingTab.collapseKey("quicklink", index));

			const heading = containerEl.createDiv({ cls: "nexus-settings-moc-heading" });
			const { titleWrap, actions } = this.setupDragAndDrop(
				heading,
				index,
				this.plugin.settings.quickLinks,
				this.isCollapsed(NexusSettingTab.collapseKey("quicklink", index)),
				true,
			);

			// Title
			titleWrap.createEl("span", { text: link.label || `Link ${index + 1}` });

			// Delete button
			const removeBtn = actions.createEl("button", {
				cls: "nexus-settings-moc-btn--delete",
				attr: { "aria-label": "Remove" },
			});
			setIcon(removeBtn, "trash");
			removeBtn.addEventListener("click", async (e) => {
				e.stopPropagation();
				new ConfirmModal(
					this.app,
					`Remove "${link.label}"?`,
					"This quick link will be removed from the dashboard.",
					async () => {
						this.plugin.settings.quickLinks.splice(index, 1);
						await this.saveAndRefresh();
					},
				).open();
			});

			// Toggle collapse
			heading.addEventListener("click", () => {
				this.setCollapsed(NexusSettingTab.collapseKey("quicklink", index), !isCollapsed);
				void this.plugin.saveSettings();
				this.display();
			});

			if (isCollapsed) return;

			new Setting(containerEl).setName("Label").addText((text) =>
				text
					.setPlaceholder("Google")
					.setValue(link.label)
					.onChange(async (value) => {
						this.plugin.settings.quickLinks[index].label = value;
						await this.plugin.saveSettings();
					}),
			);

			new Setting(containerEl).setName("URL").addText((text) =>
				text
					.setPlaceholder("https://example.com")
					.setValue(link.url)
					.onChange(async (value) => {
						this.plugin.settings.quickLinks[index].url = value;
						await this.plugin.saveSettings();
					}),
			);

			// ── Icon picker (searchable, commits typed value) ──────
			const iconSetting = new Setting(containerEl)
				.setName("Icon")
				.setDesc("Type to search, click to select");
			const iconWrapper = iconSetting.settingEl.createDiv({ cls: "nexus-icon-picker-wrapper" });
			const iconRow = iconWrapper.createDiv({ cls: "nexus-icon-picker-row" });
			const iconPreview = iconRow.createDiv({ cls: "nexus-icon-picker-preview" });
			iconPreview.innerHTML = SMALL_ICONS[link.icon] || SMALL_ICONS["Link"] || "";
			const iconInput = iconRow.createEl("input", {
				cls: "nexus-icon-picker-input",
				attr: { type: "text", placeholder: "Search icons..." },
			});
			iconInput.value = link.icon;
			const iconGrid = iconWrapper.createDiv({ cls: "nexus-icon-picker-grid" });

			const renderLinkIconGrid = (filter: string) => {
				iconGrid.empty();
				const lower = filter.toLowerCase();
				const matches = ICON_NAMES.filter((name) => name.toLowerCase().includes(lower));
				for (const name of matches) {
					const btn = iconGrid.createDiv({ cls: "nexus-icon-picker-item" });
					if (name === iconInput.value) btn.classList.add("nexus-icon-picker-item-active");
					btn.innerHTML = SMALL_ICONS[name] || "";
					btn.createEl("span", { text: name, cls: "nexus-icon-picker-label" });
					btn.addEventListener("click", () => {
						iconInput.value = name;
						iconPreview.innerHTML = SMALL_ICONS[name] || SMALL_ICONS["Link"] || "";
						this.plugin.settings.quickLinks[index].icon = name;
						void this.plugin.saveSettings();
						iconGrid
							.querySelectorAll(".nexus-icon-picker-item")
							.forEach((el) => el.classList.remove("nexus-icon-picker-item-active"));
						btn.classList.add("nexus-icon-picker-item-active");
					});
				}
				if (matches.length === 0) {
					iconGrid.createEl("div", { text: "No icons found", cls: "nexus-icon-picker-empty" });
				}
			};

			renderLinkIconGrid("");
			iconInput.addEventListener("input", () => renderLinkIconGrid(iconInput.value));
			iconInput.addEventListener("focus", () => {
				iconGrid.classList.add("nexus-icon-picker-grid-open");
				renderLinkIconGrid(iconInput.value);
			});
			iconInput.addEventListener("blur", () => {
				setTimeout(() => {
					iconGrid.classList.remove("nexus-icon-picker-grid-open");
				}, 200);
			});
			this.addIconPickerCommitBlur(iconInput, iconPreview, (value) => {
				this.plugin.settings.quickLinks[index].icon = value;
				void this.plugin.saveSettings();
			});
			iconInput.addEventListener("keydown", (e) => {
				if (e.key === "Escape") iconInput.blur();
				if (e.key === "Enter") {
					this.plugin.settings.quickLinks[index].icon = iconInput.value;
					void this.plugin.saveSettings();
					iconInput.blur();
				}
			});
		});

		// "+ Add Link" button
		new Setting(containerEl)
			.setName("Add quick link")
			.setDesc("Add a new link to the dashboard.")
			.addButton((btn) =>
				btn
					.setButtonText("+ Add Link")
					.setCta()
					.onClick(async () => {
						await this.addQuickLink();
					}),
			);
	}

	private async addQuickLink(): Promise<void> {
		this.plugin.settings.quickLinks.push({
			label: "New Link",
			url: "https://example.com",
			icon: "Link",
		});
		await this.saveAndRefresh();
	}

	// ── Vault List Entry ────────────────────────────────────

	renderVaultListEntry(containerEl: HTMLElement, vl: VaultListEntry, index: number): void {
		const entry = containerEl.createDiv({ cls: "nexus-vault-list-entry" });

		const head = entry.createDiv({ cls: "nexus-vault-list-entry-head" });
		head.createSpan({ cls: "nexus-vault-list-entry-name", text: vl.name || "Untitled" });
		const removeBtn = head.createEl("button", {
			cls: "nexus-settings-moc-btn--delete",
			attr: { "aria-label": "Remove" },
		});
		setIcon(removeBtn, "trash");
		removeBtn.addEventListener("click", async () => {
			new ConfirmModal(
				this.app,
				`Remove "${vl.name}"?`,
				"This vault list will be removed from the dashboard.",
				async () => {
					this.plugin.settings.vaultLists.splice(index, 1);
					await this.saveAndRefresh();
				},
			).open();
		});

		const grid = entry.createDiv({ cls: "nexus-vault-list-entry-grid" });

		this.addVaultListField(grid, "Path", vl.path, (value) => {
			this.plugin.settings.vaultLists[index].path = value;
		});
		this.addVaultListField(grid, "Tags", vl.tags, (value) => {
			this.plugin.settings.vaultLists[index].tags = value;
		});
		this.addVaultListField(grid, "Count", String(vl.count), (value) => {
			const parsed = safeParseInt(value, undefined) ?? 9;
			this.plugin.settings.vaultLists[index].count = Math.max(3, Math.min(50, parsed));
		});
		this.addVaultListField(grid, "Label", vl.label, (value) => {
			this.plugin.settings.vaultLists[index].label = value;
		});
	}

	private addVaultListField(
		parent: HTMLElement,
		label: string,
		value: string,
		onValue: (value: string) => void,
	): void {
		const field = parent.createDiv({ cls: "nexus-vault-list-entry-field" });
		field.createEl("label", { cls: "nexus-vault-list-entry-field-label", text: label });
		const input = field.createEl("input", {
			cls: "nexus-vault-list-entry-input",
			attr: { type: "text", value },
		});
		let timer: ReturnType<typeof setTimeout> | null = null;
		input.addEventListener("input", () => {
			onValue(input.value);
			if (timer) clearTimeout(timer);
			timer = setTimeout(() => {
				void this.plugin.saveSettings();
			}, 200);
		});
	}
}
