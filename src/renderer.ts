import { MarkdownRenderChild, TFolder, Menu } from "obsidian";
import type NexusDashboardPlugin from "./main";
import { NexusSettings } from "./settings";
import { SMALL_ICONS, ICONS, DEFAULT_ICON } from "./icons";
import { renderFiglet, getFontByName } from "./figlet";
import { parseDashboard, buildDefaultConfig } from "./parser";
import { DashboardConfig, HeaderConfig, SectionConfig, CardConfig } from "./types";

export class NexusRenderer extends MarkdownRenderChild {
	private plugin: NexusDashboardPlugin;
	private source: string;
	private rendering = false;

	constructor(containerEl: HTMLElement, plugin: NexusDashboardPlugin, source: string) {
		super(containerEl);
		this.plugin = plugin;
		this.source = source;
	}

	async onload(): Promise<void> {
		await this.render();
	}

	onunload(): void {}

	async render(): Promise<void> {
		if (this.rendering) return;
		this.rendering = true;
		try {
			await this._render();
		} finally {
			this.rendering = false;
		}
	}

	private async _render(): Promise<void> {
		const { containerEl } = this;
		containerEl.empty();

		const sourceContent = this.source.trim();
		const baseConfig = this.buildConfigFromSettings();

		let config: DashboardConfig;
		if (sourceContent) {
			const codeBlockConfig = parseDashboard(sourceContent);
			config = this.mergeConfigs(baseConfig, codeBlockConfig, sourceContent);
		} else {
			config = baseConfig;
		}

		// ── Greeting ──────────────────────────────────────
		if (config.greeting) {
			this.renderGreeting(containerEl);
		}

		// ── Header ────────────────────────────────────────
		if (config.header.enabled) {
			this.renderHeader(containerEl, config.header);
		}

		// ── Toolbar ───────────────────────────────────────
		if (config.toolbar) {
			this.renderToolbar(containerEl);
		}

		// ── Stats bar ─────────────────────────────────────
		if (config.stats.enabled && config.stats.items.length > 0) {
			this.renderStatsBar(containerEl, config.stats);
		}

		// ── Sections ──────────────────────────────────────
		for (const section of config.sections) {
			this.renderSection(containerEl, section);
		}

		// ── Recently modified ─────────────────────────────
		if (config.recently) {
			await this.renderRecentlyModified(containerEl);
		}

		// ── Graph links ───────────────────────────────────
		if (config.graph.enabled) {
			this.renderGraphLinks(containerEl, config.graph);
		}
	}

	// ── Config merge ───────────────────────────────────────────

	private mergeConfigs(base: DashboardConfig, override: DashboardConfig, source: string): DashboardConfig {
		const merged: DashboardConfig = { ...base };

		if (source.includes("toolbar:")) {
			merged.toolbar = override.toolbar;
		}
		if (source.includes("greeting:")) {
			merged.greeting = override.greeting;
		}
		if (override.header.enabled) {
			merged.header = { ...base.header, ...override.header, enabled: true };
		}
		if (override.stats.enabled !== base.stats.enabled) {
			merged.stats = { ...base.stats, enabled: override.stats.enabled };
		}
		if (override.sections.length > 0) {
			merged.sections = override.sections;
		}
		if (source.includes("recently:")) {
			merged.recently = override.recently;
		}
		if (override.graph.enabled) {
			merged.graph = { ...base.graph, ...override.graph, enabled: true };
		}

		return merged;
	}

	// ── Build config from settings ─────────────────────────────

	private buildConfigFromSettings(): DashboardConfig {
		const opts = this.plugin.settings;
		const config = buildDefaultConfig();

		config.header = {
			text: opts.headerText || "NEXUS",
			font: opts.asciiDefaultFont || "ANSI Shadow",
			color: opts.asciiDefaultColor || "#8A5CF6",
			size: "normal",
			enabled: true,
			align: opts.asciiDefaultAlign || "center",
		};

		config.toolbar = false;
		config.greeting = false;

		config.stats = {
			enabled: opts.showStats,
			items: (opts.stats || []).map((s) => ({
				label: s.label,
				folder: s.folder,
			})),
		};

		if (opts.mocs && opts.mocs.length > 0) {
			const section: SectionConfig = {
				title: "",
				divider: false,
				columns: opts.mocGridColumns as 2 | 3 | 4,
				cards: opts.mocs.map((moc) => ({
					type: "big" as const,
					label: moc.title,
					desc: moc.desc,
					path: moc.path,
					icon: moc.icon,
					color: moc.color,
				})),
			};
			config.sections.push(section);
		}

		config.recently = opts.showRecently;
		return config;
	}

	// ── Render: Greeting ───────────────────────────────────────

	private renderGreeting(containerEl: HTMLElement): void {
		const hour = new Date().getHours();
		let period = "Good evening";
		if (hour < 12) period = "Good morning";
		else if (hour < 18) period = "Good afternoon";

		const name = this.plugin.settings.greetingName;
		const greeting = name ? `${period}, ${name}` : period;

		const el = containerEl.createDiv({ cls: "nexus-greeting" });
		el.textContent = greeting;
	}

	// ── Render: Header ─────────────────────────────────────────

	private renderHeader(containerEl: HTMLElement, header: HeaderConfig): void {
		const font = getFontByName(header.font);
		const rendered = renderFiglet(header.text, { font });
		const wrapper = containerEl.createDiv({ cls: "ascii-header-wrapper" });
		wrapper.dataset.align = header.align || "center";
		const pre = wrapper.createEl("pre", { text: rendered, cls: "ascii-header-output" });
		if (header.color) pre.style.color = header.color;
		if (header.size === "small") pre.style.fontSize = "0.6em";
	}

	// ── Render: Toolbar ────────────────────────────────────────

	private renderToolbar(containerEl: HTMLElement): void {
		const toolbar = containerEl.createDiv({ cls: "nexus-toolbar" });

		const actions = [
			{
				icon: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14"/><path d="M5 12h14"/></svg>`,
				label: "New note",
				action: () => this.createNote(),
			},
			{
				icon: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M3 9h18"/><path d="M9 21V9"/></svg>`,
				label: "Open daily",
				action: () => this.openDailyNote(),
			},
			{
				icon: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>`,
				label: "Search",
				action: () => this.openSearch(),
			},
			{
				icon: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>`,
				label: "Random note",
				action: () => this.openRandomNote(),
			},
		];

		for (const action of actions) {
			const btn = toolbar.createEl("button", { cls: "nexus-toolbar-btn" });
			btn.innerHTML = action.icon;
			btn.createEl("span", { text: action.label });
			btn.addEventListener("click", action.action);
		}
	}

	private async createNote(): Promise<void> {
		let name = "Untitled";
		let counter = 1;
		while (this.plugin.app.vault.getAbstractFileByPath(`${name}.md`)) {
			name = `Untitled ${counter}`;
			counter++;
		}
		const file = await this.plugin.app.vault.create(`${name}.md`, "");
		await this.plugin.app.workspace.openLinkText(file.path, "", false);
	}

	private openDailyNote(): void {
		const daily = this.plugin.app.vault.getMarkdownFiles().find((f) => {
			const now = new Date();
			const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
			return f.path.includes(today);
		});
		if (daily) {
			this.plugin.app.workspace.openLinkText(daily.path, "", false);
		} else {
			// Fallback: open a daily note via the daily notes plugin if available
			(this.plugin.app as any).commands?.executeCommandById("daily-notes");
		}
	}

	private openSearch(): void {
		(this.plugin.app as any).commands?.executeCommandById("switcher:open");
	}

	private openRandomNote(): void {
		const files = this.plugin.app.vault.getMarkdownFiles();
		if (files.length > 0) {
			const random = files[Math.floor(Math.random() * files.length)];
			this.plugin.app.workspace.openLinkText(random.path, "", false);
		}
	}

	// ── Render: Stats Bar ──────────────────────────────────────

	private renderStatsBar(containerEl: HTMLElement, stats: DashboardConfig["stats"]): void {
		const bar = containerEl.createDiv({ cls: "nexus-stats" });
		for (const item of stats.items) {
			const count = this.countFiles(item.folder);
			const card = bar.createEl("div", { cls: "nexus-stat-card" });
			card.createEl("span", { text: String(count), cls: "nexus-stat-num" });
			card.createEl("span", { text: item.label, cls: "nexus-stat-label" });
		}
	}

	// ── Render: Section (with collapsible support) ─────────────

	private renderSection(containerEl: HTMLElement, section: SectionConfig): void {
		const sectionEl = containerEl.createDiv({ cls: "nexus-section" });

		// Divider with label
		if (section.divider && section.title) {
			this.renderDivider(sectionEl, section.title);
		}

		// Card grid
		const gridEl = sectionEl.createDiv({
			cls: `nexus-grid nexus-grid--cols-${section.columns}`,
		});

		for (const cardConfig of section.cards) {
			const cardEl = this.createCard(cardConfig);
			gridEl.appendChild(cardEl);
		}
	}

	// ── Shared: Divider ──────────────────────────────────────

	private renderDivider(containerEl: HTMLElement, label: string): void {
		const d = this.plugin.settings.dividerDesign;
		const dividerEl = containerEl.createDiv({ cls: "nexus-section-divider" });
		const lineLeft = dividerEl.createDiv({ cls: "nexus-section-divider-line" });
		lineLeft.style.background = d.gradient;
		lineLeft.style.height = d.lineWidth;
		const labelEl = dividerEl.createSpan({ cls: "nexus-section-divider-label", text: label });
		labelEl.style.fontSize = d.labelSize;
		labelEl.style.fontWeight = d.labelWeight;
		labelEl.style.color = d.labelColor;
		labelEl.style.letterSpacing = d.labelSpacing;
		const lineRight = dividerEl.createDiv({ cls: "nexus-section-divider-line" });
		lineRight.style.background = d.gradient;
		lineRight.style.height = d.lineWidth;
	}

	// ── Render: Card (with context menu + color accent) ────────

	private createCard(card: CardConfig): HTMLElement {
		const isMini = card.type === "mini";
		const sizeClass = isMini ? "nexus-card-mini" : "nexus-card";

		const cardEl = document.createElement("div");
		cardEl.className = sizeClass;

		// Navigate on click
		cardEl.addEventListener("click", (e) => {
			e.preventDefault();
			const file = this.plugin.app.metadataCache.getFirstLinkpathDest(card.path, "");
			if (file) {
				this.plugin.app.workspace.openLinkText(card.path, "", false);
			} else {
				const folder = this.plugin.app.vault.getAbstractFileByPath(card.path);
				if (folder) {
					this.plugin.app.workspace.openLinkText(card.path, "", false);
				}
			}
		});

		// Right-click context menu
		cardEl.addEventListener("contextmenu", (e) => {
			e.preventDefault();
			const menu = new Menu();

			menu.addItem((item) => {
				item.setTitle("Open").setIcon("file-text").onClick(() => {
					this.plugin.app.workspace.openLinkText(card.path, "", false);
				});
			});

			menu.addItem((item) => {
				item.setTitle("Copy path").setIcon("copy").onClick(() => {
					navigator.clipboard.writeText(card.path);
				});
			});

			if (!isMini) {
				menu.addSeparator();

				const mocs = this.plugin.settings.mocs;
				const mocIndex = mocs.findIndex((m) => m.path === card.path && m.title === card.label);

				if (mocIndex > 0) {
					menu.addItem((item) => {
						item.setTitle("Move up").setIcon("arrow-up").onClick(async () => {
							[mocs[mocIndex - 1], mocs[mocIndex]] = [mocs[mocIndex], mocs[mocIndex - 1]];
							await this.plugin.saveSettings();
							this.render();
						});
					});
				}

				if (mocIndex >= 0 && mocIndex < mocs.length - 1) {
					menu.addItem((item) => {
						item.setTitle("Move down").setIcon("arrow-down").onClick(async () => {
							[mocs[mocIndex], mocs[mocIndex + 1]] = [mocs[mocIndex + 1], mocs[mocIndex]];
							await this.plugin.saveSettings();
							this.render();
						});
					});
				}
			}

			menu.showAtMouseEvent(e);
		});

		// Icon
		const iconName = card.icon || "MOC";
		const svg = isMini
			? (SMALL_ICONS[iconName] || SMALL_ICONS["MOC"] || DEFAULT_ICON)
			: (ICONS[iconName] || ICONS["MOC"] || DEFAULT_ICON);

		const iconCls = isMini ? "nexus-card-mini-icon" : "nexus-card-icon";
		const icon = cardEl.createDiv({ cls: iconCls });
		icon.innerHTML = svg;

		// Color accent
		if (card.color) {
			const colorVar = card.color.startsWith("#") ? card.color : `var(--color-${card.color})`;
			icon.style.borderLeft = `3px solid ${colorVar}`;
		}

		// Body
		const bodyCls = isMini ? "nexus-card-mini-body" : "nexus-card-body";
		const titleCls = isMini ? "nexus-card-mini-title" : "nexus-card-title";
		const descCls = isMini ? "nexus-card-mini-desc" : "nexus-card-desc";
		const body = cardEl.createDiv({ cls: bodyCls });
		body.createEl("div", { text: card.label, cls: titleCls });

		if (!isMini && card.desc) {
			body.createEl("div", { text: card.desc, cls: descCls });
		}

		return cardEl;
	}

	// ── Render: Recently Modified ──────────────────────────────

	private async renderRecentlyModified(containerEl: HTMLElement): Promise<void> {
		const opts = this.plugin.settings;
		const count = opts.recentCount || 9;
		const exclude = opts.excludeFolders || [];
		const files = this.plugin.app.vault
			.getMarkdownFiles()
			.filter((f) => {
				const firstFolder = f.path.split("/")[0];
				return !exclude.includes(firstFolder);
			})
			.sort((a, b) => b.stat.mtime - a.stat.mtime)
			.slice(0, count);

		if (files.length === 0) return;

		const wrapperEl = containerEl.createDiv({ cls: "nexus-section" });
		this.renderDivider(wrapperEl, opts.dividerLabel || "Recently Modified");

		const gridEl = wrapperEl.createDiv({
			cls: `nexus-mini-grid`,
		});
		gridEl.style.setProperty("--nexus-mini-columns", String(opts.miniGridColumns));

		for (const file of files) {
			const parent = this.getParentFolder(file.path);
			const card = gridEl.createEl("div", { cls: "nexus-card-mini" });
			card.addEventListener("click", (e) => {
				e.preventDefault();
				this.plugin.app.workspace.openLinkText(file.path, "", false);
			});
			const icon = card.createEl("div", { cls: "nexus-card-mini-icon" });
			icon.innerHTML = this.getFolderIcon(parent);
			const accent = "var(--interactive-accent)";
			icon.style.setProperty("--pill-color", accent);
			icon.style.setProperty("--accent-override", accent);
			icon.style.setProperty("--icon-color", accent);
			const body = card.createEl("div", { cls: "nexus-card-mini-body" });
			body.createEl("div", { text: file.basename, cls: "nexus-card-mini-title" });
			if (parent) {
				body.createEl("div", { text: parent, cls: "nexus-card-mini-desc" });
			}
		}
	}

	// ── Render: Graph Links ────────────────────────────────────

	private renderGraphLinks(containerEl: HTMLElement, graph: DashboardConfig["graph"]): void {
		const graphEl = containerEl.createDiv({ cls: "nexus-graph-links" });
		const allFiles = this.plugin.app.vault.getAllLoadedFiles();
		const folders = allFiles.filter(
			(f): f is TFolder => f instanceof TFolder && !graph.exclude.includes(f.name)
		);
		for (const folder of folders) {
			graphEl.createEl("a", {
				cls: "internal-link",
				text: `[[${folder.name}]]`,
			});
		}
	}

	// ── Shared helpers ─────────────────────────────────────────

	private countFiles(folderPath: string): number {
		if (!folderPath) {
			return this.plugin.app.vault.getFiles().length;
		}
		const files = this.plugin.app.vault.getFiles();
		return files.filter((file) =>
			file.path.toLowerCase().startsWith(folderPath.toLowerCase() + "/")
		).length;
	}

	private getParentFolder(filePath: string): string {
		const parts = filePath.split("/");
		if (parts.length > 1) {
			return parts[parts.length - 2];
		}
		return "";
	}

	private getFolderIcon(folderName: string): string {
		const key = folderName || "Default";
		const icons: Record<string, string> = {
			Default: `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/></svg>`,
			Resources: SMALL_ICONS["Resources"] || DEFAULT_ICON,
			Journal: SMALL_ICONS["Journal"] || DEFAULT_ICON,
			Media: SMALL_ICONS["Media"] || DEFAULT_ICON,
			Trackers: SMALL_ICONS["Trackers"] || DEFAULT_ICON,
			Knowledge: SMALL_ICONS["Knowledge"] || DEFAULT_ICON,
			Personal: SMALL_ICONS["Personal"] || DEFAULT_ICON,
			Project: SMALL_ICONS["Project"] || DEFAULT_ICON,
			Journals: SMALL_ICONS["Journal"] || DEFAULT_ICON,
			Tasks: `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="m9 12 2 2 4-4"/></svg>`,
			Inbox: `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/></svg>`,
		};
		return icons[key] || icons["Default"];
	}
}
