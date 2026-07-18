import { MarkdownRenderChild, TFolder, TFile, Menu } from "obsidian";
import type NexusDashboardPlugin from "./main";
import { NexusSettings, DIVIDER_PRESETS } from "./settings";
import { SMALL_ICONS, ICONS, DEFAULT_ICON } from "./icons";
import { renderFiglet, getFontByName } from "./figlet";
import { parseDashboard, buildDefaultConfig } from "./parser";
import { DashboardConfig, DividerBlockConfig, HeaderConfig, SectionConfig, CardConfig } from "./types";

export class NexusRenderer extends MarkdownRenderChild {
	private plugin: NexusDashboardPlugin;
	private source: string;
	private sourcePath: string;
	private rendering = false;

	constructor(containerEl: HTMLElement, plugin: NexusDashboardPlugin, source: string, sourcePath: string) {
		super(containerEl);
		this.plugin = plugin;
		this.source = source;
		this.sourcePath = sourcePath;
	}

	async onload(): Promise<void> {
		this.plugin.activeRenderers.add(this);
		await this.render();
	}

	onunload(): void {
		this.plugin.activeRenderers.delete(this);
	}

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

		// ── Header ────────────────────────────────────────
		if (config.header.enabled) {
			this.renderHeader(containerEl, config.header);
		}

		// ── Stats bar ─────────────────────────────────────
		if (config.stats.enabled && config.stats.items.length > 0) {
			this.renderStatsBar(containerEl, config.stats);
		}

		// ── Blocks (dividers + sections in order) ─────────
		for (const block of config.blocks) {
			if (block.kind === "divider") {
				this.renderStandaloneDivider(containerEl, block);
			} else {
				this.renderSection(containerEl, block);
			}
		}

		// ── Recently modified ─────────────────────────────
		if (config.recently) {
			await this.renderRecentlyModified(containerEl);
		}

		// ── Graph links ───────────────────────────────────
		if (config.graph.enabled) {
			await this.renderGraphLinks(config);
		}
	}

	// ── Config merge ───────────────────────────────────────────

	private mergeConfigs(base: DashboardConfig, override: DashboardConfig, source: string): DashboardConfig {
		const merged: DashboardConfig = { ...base };

		// In populated code blocks, default header to false unless explicitly written
		// Filter out empty values so settings defaults survive the merge
		if (source.includes("header:")) {
			const entries = Object.entries(override.header).filter(([_, v]) => v);
			merged.header = { ...base.header, ...Object.fromEntries(entries), enabled: true };
		} else {
			merged.header = { ...base.header, enabled: false };
		}
		// In populated code blocks, default stats to false unless explicitly written
		// Only merge the enabled flag — preserve items from settings (code block syntax has no stat-item syntax)
		if (source.includes("stats:")) {
			merged.stats = { ...base.stats, enabled: override.stats.enabled };
		} else {
			merged.stats = { ...base.stats, enabled: false };
		}
		// In populated code blocks, default blocks to empty unless explicitly written
		if (source.includes("section:") || source.includes("divider:")) {
			merged.blocks = override.blocks;
		} else {
			merged.blocks = [];
		}
		// In populated code blocks, default recently to false unless explicitly written
		if (source.includes("recently:")) {
			merged.recently = override.recently;
		} else {
			merged.recently = false;
		}
		// In populated code blocks, default graph to false unless explicitly written
		if (source.includes("graph:")) {
			merged.graph = { ...base.graph, ...override.graph };
		} else {
			merged.graph = { ...base.graph, enabled: false };
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

		config.stats = {
			enabled: opts.showStats,
			items: (opts.stats || []).map((s) => ({
				label: s.label,
				folder: s.folder,
			})),
		};

		if (opts.mocs && opts.mocs.length > 0) {
			const section: SectionConfig = {
				kind: "section",
				columns: opts.mocGridColumns as 1 | 2 | 3 | 4,
				cards: opts.mocs.map((moc) => ({
					type: "big" as const,
					label: moc.title,
					desc: moc.desc,
					path: moc.path,
					icon: moc.icon,
					color: moc.color,
				})),
			};
			config.blocks.push(section);
		}

		config.recently = opts.showRecently;
		config.graph = { enabled: opts.showGraph, exclude: [] };
		return config;
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

	// ── Render: Standalone Divider ─────────────────────────────

	private renderStandaloneDivider(containerEl: HTMLElement, divider: DividerBlockConfig): void {
		if (!divider.title) return;
		this.renderDivider(containerEl, divider.title, divider.type);
	}

	// ── Render: Section ───────────────────────────────────────

	private renderSection(containerEl: HTMLElement, section: SectionConfig): void {
		if (section.cards.length === 0) return;

		const sectionEl = containerEl.createDiv({ cls: "nexus-section" });

		const hasMini = section.cards.some(c => c.type === "mini");
		const hasBig = section.cards.some(c => c.type === "big");
		const gridCls = hasMini && !hasBig
			? `nexus-mini-grid nexus-mini-grid--cols-${section.columns}`
			: `nexus-grid nexus-grid--cols-${section.columns}`;
		const gridEl = sectionEl.createDiv({ cls: gridCls });

		for (const cardConfig of section.cards) {
			const cardEl = this.createCard(cardConfig);
			gridEl.appendChild(cardEl);
		}
	}

	// ── Shared: Divider ──────────────────────────────────────

	private renderDivider(containerEl: HTMLElement, label: string, type?: string): void {
		const preset = type && DIVIDER_PRESETS[type] ? DIVIDER_PRESETS[type] : this.plugin.settings.dividerDesign;
		const d = preset;
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
			if (card.path) {
				this.plugin.app.workspace.openLinkText(card.path, "", false);
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

		if (card.desc) {
			body.createEl("div", { text: card.desc, cls: descCls });
		}

		return cardEl;
	}

	// ── Render: Recently Modified ──────────────────────────────

	private async renderRecentlyModified(containerEl: HTMLElement): Promise<void> {
		const opts = this.plugin.settings;
		const count = opts.recentCount ?? 9;
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

	private static readonly GRAPH_START = `<span class="nexus-graph-links">`;
	private static readonly GRAPH_END = `</span>`;

	private async renderGraphLinks(config: DashboardConfig): Promise<void> {
		await this.injectGraphLinksToFile(config);
	}

	private computeGraphWikilinks(config: DashboardConfig): string {
		const paths: string[] = [];
		const exclude = config.graph.exclude;

		for (const block of config.blocks) {
			if (block.kind === "section") {
				for (const card of block.cards) {
					if (!paths.includes(card.path) && !exclude.some((ex) => card.path.includes(ex))) {
						paths.push(card.path);
					}
				}
			}
		}

		if (paths.length === 0) return "";
		return paths.map((p) => `[[${p}]]`).join(" ");
	}

	private async injectGraphLinksToFile(config: DashboardConfig): Promise<void> {
		const file = this.plugin.app.vault.getAbstractFileByPath(this.sourcePath);
		if (!(file instanceof TFile)) return;

		const wikilinks = this.computeGraphWikilinks(config);
		const { GRAPH_START, GRAPH_END } = NexusRenderer;

		const newBlock = wikilinks ? `${GRAPH_START}${wikilinks}${GRAPH_END}` : "";

		try {
			const content = await this.plugin.app.vault.cachedRead(file);
			const startIdx = content.indexOf(GRAPH_START);
			const endIdx = content.indexOf(GRAPH_END);

			let updated: string;
			if (startIdx !== -1 && endIdx !== -1 && startIdx < endIdx) {
				const before = content.substring(0, startIdx);
				const after = content.substring(endIdx + GRAPH_END.length);
				updated = before + newBlock + after;
			} else {
				updated = content.trimEnd() + (newBlock ? `\n\n${newBlock}\n` : "\n");
			}

			if (updated !== content) {
				await this.plugin.app.vault.modify(file, updated);
			}
		} catch (e) {
			console.error("Nexus Dashboard: failed to inject graph links", e);
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
