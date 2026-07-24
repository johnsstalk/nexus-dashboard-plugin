import { MarkdownRenderChild, TFolder, Menu, Notice, TFile } from "obsidian";
import type NexusDashboardPlugin from "./main";
import { NexusSettings } from "./types";
import { DIVIDER_PRESETS } from "./defaults";
import { SMALL_ICONS, ICONS, DEFAULT_ICON } from "./icons";
import { renderFiglet, getFontByName } from "./figlet";
import { parseDashboard, buildDefaultConfig } from "./parser";
import {
	DashboardConfig,
	DashboardBlock,
	DividerBlockConfig,
	HeaderConfig,
	SectionConfig,
	CardConfig,
	LinksConfig,
	RowConfig,
	StackConfig,
	RecentlyConfig,
	SearchConfig,
} from "./types";

export class NexusRenderer extends MarkdownRenderChild {
	private plugin: NexusDashboardPlugin;
	private source: string;
	private sourcePath: string;
	private rendering = false;
	private renderQueued = false;
	private searchAbortController: AbortController | null = null;

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
		if (this.searchAbortController) {
			this.searchAbortController.abort();
			this.searchAbortController = null;
		}
	}

	async render(): Promise<void> {
		if (this.rendering) {
			this.renderQueued = true;
			return;
		}
		this.rendering = true;
		try {
			await this._render();
		} finally {
			this.rendering = false;
			if (this.renderQueued) {
				this.renderQueued = false;
				this.render();
			}
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

		// ── Search bar ────────────────────────────────────
		if (config.search?.show) {
			this.renderSearchBar(containerEl, config.search);
		}

		// ── Blocks (unified dispatch) ─────────────────────
		for (const block of config.blocks) {
			try {
				await this.renderBlock(containerEl, block, config);
			} catch (err) {
				console.error("[NEXUS RENDER ERROR] block render failed:", err);
			}
		}

		// ── Recently modified (root-level boolean) ────────
		if (config.recently === true) {
			const recentConfig: RecentlyConfig = {
				kind: "recently",
				show: true,
				path: this.plugin.settings.recentPath || undefined,
				tags: this.plugin.settings.recentTags
					? this.plugin.settings.recentTags.split(",").map((s) => s.trim()).filter((s) => s.length > 0)
					: undefined,
			};
			await this.renderRecentlyModified(containerEl, recentConfig);
		}

		// ── Graph links (metadataCache injection) ─────────
		if (config.graph.enabled) {
			this.injectGraphLinks(config);
		}
	}

	// ── Unified block dispatch ───────────────────────────────

	private async renderBlock(containerEl: HTMLElement, block: DashboardBlock, config: DashboardConfig): Promise<void> {
		switch (block.kind) {
			case "divider":
				this.renderStandaloneDivider(containerEl, block);
				break;
			case "section":
				this.renderSection(containerEl, block);
				break;
			case "links":
				this.renderLinks(containerEl, block);
				break;
			case "row":
				this.renderRow(containerEl, block, config);
				break;
			case "stack":
				this.renderStack(containerEl, block, config);
				break;
			case "recently":
				await this.renderRecentlyModified(containerEl, block);
				break;
		}
	}

	// ── Config merge ───────────────────────────────────────────

	private mergeConfigs(base: DashboardConfig, override: DashboardConfig, source: string): DashboardConfig {
		const merged: DashboardConfig = { ...base };

		// Header
		if (source.includes("header:")) {
			const entries = Object.entries(override.header).filter(([_, v]) => v);
			merged.header = { ...base.header, ...Object.fromEntries(entries), enabled: true };
		} else {
			merged.header = { ...base.header, enabled: false };
		}

		// Stats — respect settings toggle when code block doesn't override
		if (source.includes("stats:")) {
			merged.stats = { ...base.stats, enabled: override.stats.enabled };
		} else {
			merged.stats = { ...base.stats, enabled: false };
		}

		// Blocks — detect ALL block types
		const hasBlocks = source.includes("section:") ||
			source.includes("divider:") ||
			source.includes("links:") ||
			source.includes("row:") ||
			source.includes("stack:");
		if (hasBlocks) {
			merged.blocks = override.blocks;
		} else {
			merged.blocks = [];
		}

		// Recently
		if (source.includes("recently:")) {
			merged.recently = override.recently;
		} else {
			merged.recently = false;
		}

		// Graph — respect settings toggle when code block doesn't override
		if (source.includes("graph:")) {
			merged.graph = { ...base.graph, ...override.graph };
		}

		// Search
		if (source.includes("search:")) {
			merged.search = override.search;
		} else {
			merged.search = undefined;
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
			size: opts.asciiDefaultSize ?? 1,
			mobileSize: opts.asciiMobileSize,
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
				columns: opts.mocGridColumns,
				cards: opts.mocs.map((moc) => ({
					type: "big" as const,
					label: moc.title,
					desc: moc.desc,
					path: moc.path,
					icon: moc.icon,
				})),
			};
			config.blocks.push(section);
		}

		// Quick Links from settings
		if (opts.quickLinks && opts.quickLinks.length > 0) {
			const linksBlock: LinksConfig = {
				kind: "links",
				title: "Quick Links",
				columns: 3,
				items: opts.quickLinks.map((link) => ({
					url: link.url,
					label: link.label,
					icon: link.icon,
				})),
			};
			config.blocks.push(linksBlock);
		}

		// Search
		if (opts.showSearch) {
			config.search = { show: true, default: opts.searchDefault || "vault" };
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
		pre.style.setProperty("--nexus-ascii-size", String(header.size));
		pre.style.setProperty("--nexus-ascii-mobile-size", String(header.mobileSize ?? header.size * 0.5));

		if (document.body.classList.contains("is-phone")) {
			pre.style.visibility = "hidden";
			requestAnimationFrame(() => {
				const naturalWidth = pre.scrollWidth;
				const availableWidth = wrapper.clientWidth;
				if (naturalWidth > availableWidth && availableWidth > 0) {
					const currentPx = parseFloat(getComputedStyle(pre).fontSize);
					const targetPx = (availableWidth / naturalWidth) * currentPx;
					pre.style.setProperty("font-size", `${targetPx}px`, "important");
				}
				pre.style.visibility = "visible";
			});
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

	// ── Render: Standalone Divider ─────────────────────────────

	private renderStandaloneDivider(containerEl: HTMLElement, divider: DividerBlockConfig): void {
		if (!divider.title) return;
		this.renderDivider(containerEl, divider.title, divider.type);
	}

	// ── Render: Section ───────────────────────────────────────

	private renderSection(containerEl: HTMLElement, section: SectionConfig): void {
		if (section.cards.length === 0 && !section.divider) return;

		const sectionEl = containerEl.createDiv({ cls: "nexus-section" });

		// Render divider before cards if present
		if (section.divider && section.divider.title) {
			this.renderDivider(sectionEl, section.divider.title, section.divider.type);
		}

		if (section.cards.length === 0) return;

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

	// ── Render: Links ─────────────────────────────────────────

	private renderLinks(containerEl: HTMLElement, links: LinksConfig): void {
		if (links.items.length === 0) return;

		const wrapper = containerEl.createDiv({ cls: "nexus-links" });

		if (links.title) {
			this.renderDivider(wrapper, links.title);
		}

		const cols = links.columns || 3;
		const gridEl = wrapper.createDiv({ cls: `nexus-links-grid nexus-links-grid--cols-${cols}` });

		for (const item of links.items) {
			const itemEl = gridEl.createEl("a", { cls: "nexus-link-item" });
			itemEl.href = item.url;
			itemEl.target = "_blank";
			itemEl.rel = "noopener";

			// Icon
			const iconName = item.icon || "Link";
			const svg = SMALL_ICONS[iconName] || SMALL_ICONS["Link"] || DEFAULT_ICON;
			const iconEl = itemEl.createDiv({ cls: "nexus-link-icon" });
			iconEl.innerHTML = svg;

			// Label
			const label = item.label || new URL(item.url).hostname || item.url;
			itemEl.createEl("span", { text: label, cls: "nexus-link-label" });

			// Optional description
			if (item.desc) {
				itemEl.createEl("span", { text: item.desc, cls: "nexus-link-desc" });
			}
		}
	}

	// ── Render: Row ───────────────────────────────────────────

	private renderRow(containerEl: HTMLElement, row: RowConfig, config: DashboardConfig): void {
		if (row.children.length === 0) return;

		const cols = row.columns || row.children.length || 2;
		const defaultProportion = this.getRowProportion(row);
		const rowIndex = config.blocks.indexOf(row);

		// Load saved proportion from drag, then user-specified, then default
		const savedProportion = this.getRowProportionSaved(rowIndex >= 0 ? rowIndex : 0);
		const proportion = savedProportion || row.proportion || defaultProportion;

		const rowEl = containerEl.createDiv({ cls: "nexus-row" });
		rowEl.style.setProperty("--nexus-row-cols", String(cols));
		rowEl.style.setProperty("--nexus-row-proportion", proportion);

		// Apply gap property
		if (row.gap) {
			rowEl.style.gap = row.gap;
		}

		const children = row.children;
		const colWidths = this.parseProportion(proportion, cols);
		const isCustomProportion = proportion !== defaultProportion;

		for (let i = 0; i < children.length && i < cols; i++) {
			const colEl = rowEl.createDiv({ cls: "nexus-row-col" });
			if (isCustomProportion) {
				colEl.style.setProperty("--nexus-row-width", colWidths[i] || `${100 / cols}%`);
			}

			const child = children[i];
			if (child.kind === "section" || child.kind === "divider" || child.kind === "links" || child.kind === "recently") {
				this.renderBlock(colEl, child, config);
			} else if (child.kind === "row" || child.kind === "stack") {
				this.renderBlock(colEl, child, config);
			}

			if (i < children.length - 1 && i < cols - 1) {
				const dividerEl = rowEl.createDiv({ cls: "nexus-row-divider" });
				this.setupColumnDrag(dividerEl, rowEl, colWidths, i, rowIndex);
			}
		}
	}

	// ── Render: Stack ─────────────────────────────────────────

	private renderStack(containerEl: HTMLElement, stack: StackConfig, config: DashboardConfig): void {
		if (stack.children.length === 0) return;

		const stackEl = containerEl.createDiv({ cls: "nexus-stack" });

		// Apply spacing (vertical gap)
		if (stack.spacing) {
			stackEl.style.gap = stack.spacing;
		}

		// Apply horizontal alignment
		if (stack.align && stack.align !== "stretch") {
			stackEl.style.alignItems = stack.align === "left" ? "flex-start" : 
									  stack.align === "right" ? "flex-end" : "center";
		}

		// Render children with dividers between them
		for (let i = 0; i < stack.children.length; i++) {
			const child = stack.children[i];
			const itemEl = stackEl.createDiv({ cls: "nexus-stack-item" });
			
			if (child.kind === "section" || child.kind === "divider" || child.kind === "links" || child.kind === "recently") {
				this.renderBlock(itemEl, child, config);
			} else if (child.kind === "row") {
				this.renderBlock(itemEl, child, config);
			}

			if (i < stack.children.length - 1) {
				stackEl.createDiv({ cls: "nexus-stack-divider" });
			}
		}
	}

	// ── Render: Search Bar ────────────────────────────────────

	private renderSearchBar(containerEl: HTMLElement, search: SearchConfig): void {
		const wrapper = containerEl.createDiv({ cls: "nexus-search" });
		const input = wrapper.createEl("input", {
			cls: "nexus-search-input",
			attr: {
				type: "text",
				placeholder: search.placeholder || "Search notes...",
			},
		});

		const resultsEl = wrapper.createDiv({ cls: "nexus-search-results" });
		resultsEl.style.display = "none";

		let debounceTimer: ReturnType<typeof setTimeout>;

		input.addEventListener("input", () => {
			clearTimeout(debounceTimer);
			debounceTimer = setTimeout(() => {
				const query = input.value.trim().toLowerCase();
				if (query.length < 2) {
					resultsEl.style.display = "none";
					resultsEl.empty();
					return;
				}

				const files = this.plugin.app.vault.getMarkdownFiles();
				const matches = files
					.filter((f) => f.basename.toLowerCase().includes(query) || f.path.toLowerCase().includes(query))
					.slice(0, 10);

				resultsEl.empty();
				if (matches.length === 0) {
					resultsEl.style.display = "none";
					return;
				}

				resultsEl.style.display = "block";
				for (const file of matches) {
					const resultEl = resultsEl.createDiv({ cls: "nexus-search-result" });
					const nameEl = resultEl.createEl("span", { text: file.basename, cls: "nexus-search-result-name" });
					const pathEl = resultEl.createEl("span", { text: file.path, cls: "nexus-search-result-path" });

					const openFile = () => {
						this.plugin.app.workspace.openLinkText(file.path, "", false);
						input.value = "";
						resultsEl.style.display = "none";
						resultsEl.empty();
					};

					resultEl.addEventListener("click", openFile);
					nameEl.addEventListener("click", openFile);
					pathEl.addEventListener("click", openFile);
				}
			}, 200);
		});

		// Close on escape or outside click
		input.addEventListener("keydown", (e) => {
			if (e.key === "Escape") {
				input.value = "";
				resultsEl.style.display = "none";
				resultsEl.empty();
				input.blur();
			}
		});

		if (this.searchAbortController) {
			this.searchAbortController.abort();
		}
		this.searchAbortController = new AbortController();
		const signal = this.searchAbortController.signal;

		document.addEventListener("click", (e) => {
			if (!wrapper.contains(e.target as Node)) {
				resultsEl.style.display = "none";
				resultsEl.empty();
			}
		}, { signal });
	}

	// ── Render: Recently Modified ──────────────────────────────

	private async renderRecentlyModified(containerEl: HTMLElement, config: RecentlyConfig): Promise<void> {
		const opts = this.plugin.settings;
		const count = config.count ?? opts.recentCount ?? 9;
		const exclude = opts.excludeFolders || [];

		let files = this.plugin.app.vault.getMarkdownFiles();

		// Path filter
		if (config.path) {
			const paths = config.path.split(",").map((p) => p.trim().toLowerCase()).filter((p) => p.length > 0);
			files = files.filter((f) => {
				const pathLower = f.path.toLowerCase();
				return paths.some((p) => pathLower.startsWith(p + "/") || pathLower === p);
			});
		}

		// Tag filter
		if (config.tags && config.tags.length > 0) {
			files = files.filter((f) => {
				const cache = this.plugin.app.metadataCache.getFileCache(f);
				const tags: string[] = [];
				if (cache?.frontmatter?.tags) {
					const fmTags = cache.frontmatter.tags;
					if (Array.isArray(fmTags)) {
						tags.push(...fmTags.map((t: string) => String(t).toLowerCase()));
					} else {
						tags.push(String(fmTags).toLowerCase());
					}
				}
				if (cache?.frontmatter?.tag) {
					tags.push(String(cache.frontmatter.tag).toLowerCase());
				}
				return config.tags?.some((t) => tags.includes(t.toLowerCase())) ?? false;
			});
		}

		// Exclude folders
		files = files.filter((f) => {
			const firstFolder = f.path.split("/")[0];
			return !exclude.includes(firstFolder);
		});

		// Sort by mtime and limit
		files = files.sort((a, b) => b.stat.mtime - a.stat.mtime).slice(0, count);

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

	/** Inject card paths into Obsidian's metadataCache for Graph View */
	private injectGraphLinks(config: DashboardConfig): void {
		const paths: string[] = [];
		const exclude = config.graph.exclude;
		this.collectCardPaths(config.blocks, paths, exclude);
		if (paths.length === 0) return;

		const sourcePath = this.sourcePath;
		const resolvedLinks = this.plugin.app.metadataCache.resolvedLinks;

		if (!resolvedLinks[sourcePath]) {
			resolvedLinks[sourcePath] = {};
		}

		for (const p of paths) {
			const file = this.plugin.app.vault.getAbstractFileByPath(p);
			if (file) {
				resolvedLinks[sourcePath][p] = (resolvedLinks[sourcePath][p] || 0) + 1;
			}
		}

		this.plugin.app.metadataCache.trigger("resolve", sourcePath);
	}

	/** Recursively collect card paths from all block types */
	private collectCardPaths(blocks: DashboardBlock[], paths: string[], exclude: string[]): void {
		for (const block of blocks) {
			if (block.kind === "section") {
				for (const card of block.cards) {
					if (!paths.includes(card.path) && !exclude.some((ex) => card.path.includes(ex))) {
						paths.push(card.path);
					}
				}
			} else if (block.kind === "row") {
				this.collectCardPaths(block.children, paths, exclude);
			} else if (block.kind === "stack") {
				this.collectCardPaths(block.children, paths, exclude);
			} else if (block.kind === "links") {
				for (const item of block.items) {
					if (item.url.startsWith("obsidian://")) {
						const match = item.url.match(/file=([^&]+)/);
						if (match) {
							const path = decodeURIComponent(match[1]);
							if (!paths.includes(path) && !exclude.some((ex) => path.includes(ex))) {
								paths.push(path);
							}
						}
					}
				}
			}
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

	// ── Shared: Card ─────────────────────────────────────────

	private createCard(card: CardConfig): HTMLElement {
		const isMini = card.type === "mini";
		const sizeClass = isMini ? "nexus-card-mini" : "nexus-card";

		const cardEl = document.createElement("div");
		cardEl.className = sizeClass;

		// Navigate on click
		cardEl.addEventListener("click", (e) => {
			e.preventDefault();
			if (card.path) {
				const file = this.plugin.app.vault.getAbstractFileByPath(card.path);
				if (file instanceof TFile) {
					this.plugin.app.workspace.openLinkText(card.path, "", false);
				} else {
					new Notice(`File not found: ${card.path}`);
				}
			}
		});

		// Right-click context menu
		cardEl.addEventListener("contextmenu", (e) => {
			e.preventDefault();
			const menu = new Menu();

			menu.addItem((item) => {
				item.setTitle("Open").setIcon("file-text").onClick(() => {
					const file = this.plugin.app.vault.getAbstractFileByPath(card.path);
					if (file instanceof TFile) {
						this.plugin.app.workspace.openLinkText(card.path, "", false);
					} else {
						new Notice(`File not found: ${card.path}`);
					}
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

	// ── Row: proportion helpers ────────────────────────────────

	private getRowProportion(row: RowConfig): string {
		const n = row.columns || row.children.length || 2;
		const part = Math.floor(100 / n);
		const parts = Array(n - 1).fill(part);
		parts.push(100 - part * (n - 1));
		return parts.join("/");
	}

	private parseProportion(proportion: string, cols: number): string[] {
		const parts = proportion.split("/").map((s) => s.trim());
		const widths: string[] = [];
		for (let i = 0; i < cols; i++) {
			const val = parseInt(parts[i] || "0", 10);
			if (Number.isFinite(val) && val > 0) {
				widths.push(`${val}%`);
			} else {
				widths.push(`${100 / cols}%`);
			}
		}
		return widths;
	}

	private getRowProportionKey(rowIndex: number, prefix: string = "row"): string {
		return `${this.sourcePath}:${prefix}:${rowIndex}`;
	}

	private getRowProportionSaved(rowIndex: number, prefix: string = "row"): string | null {
		const key = this.getRowProportionKey(rowIndex, prefix);
		const sizes = this.plugin.settings.rowSizes;
		if (sizes && sizes[key]) return sizes[key];

		// Auto-migrate legacy key (format: {sourcePath}:0)
		if (prefix === "row") {
			const legacyKey = `${this.sourcePath}:0`;
			if (sizes && sizes[legacyKey]) {
				const val = sizes[legacyKey];
				sizes[key] = val;
				delete sizes[legacyKey];
				this.plugin.saveSettings();
				return val;
			}
		}
		return null;
	}

	// ── Row: column drag ──────────────────────────────────────

	private setupColumnDrag(dividerEl: HTMLElement, rowEl: HTMLElement, colWidths: string[], dividerIdx: number, rowIndex: number): void {
		const MIN_WIDTH = 20;
		const DIVIDER_WIDTH = 8;
		let isDragging = false;
		let startX = 0;
		let startLeftWidth = 0;

		const cols = rowEl.querySelectorAll(".nexus-row-col");
		const leftCol = cols[dividerIdx] as HTMLElement;
		const rightCol = cols[dividerIdx + 1] as HTMLElement;
		if (!leftCol || !rightCol) return;

		const onMouseMove = (e: MouseEvent) => {
			if (!isDragging) return;
			const rowRect = rowEl.getBoundingClientRect();
			const dx = e.clientX - startX;
			const rowWidth = rowRect.width;
			const numDividers = cols.length - 1;
			const availableWidth = rowWidth - (numDividers * DIVIDER_WIDTH);

			let leftPct = (startLeftWidth + dx) / availableWidth * 100;
			leftPct = Math.max(MIN_WIDTH, Math.min(100 - MIN_WIDTH, leftPct));
			const rightPct = 100 - leftPct;

			leftCol.style.setProperty("--nexus-row-width", `${leftPct}%`);
			rightCol.style.setProperty("--nexus-row-width", `${rightPct}%`);
		};

		const onMouseUp = () => {
			if (!isDragging) return;
			isDragging = false;
			dividerEl.removeClass("dragging");
			document.removeEventListener("mousemove", onMouseMove);
			document.removeEventListener("mouseup", onMouseUp);

			const leftPct = parseFloat(leftCol.style.getPropertyValue("--nexus-row-width")) || 50;
			const rightPct = parseFloat(rightCol.style.getPropertyValue("--nexus-row-width")) || 50;
			const proportion = `${Math.round(leftPct)}/${Math.round(rightPct)}`;
			this.saveRowProportion(proportion, rowIndex);
		};

		dividerEl.addEventListener("mousedown", (e) => {
			isDragging = true;
			startX = e.clientX;
			startLeftWidth = leftCol.getBoundingClientRect().width;
			dividerEl.addClass("dragging");
			e.preventDefault();
			document.addEventListener("mousemove", onMouseMove);
			document.addEventListener("mouseup", onMouseUp);
		});
	}

	private saveRowProportion(proportion: string, rowIndex: number): void {
		const key = this.getRowProportionKey(rowIndex, "row");
		const settings = this.plugin.settings;
		if (!settings.rowSizes) settings.rowSizes = {};
		settings.rowSizes[key] = proportion;
		this.plugin.saveSettings();
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
