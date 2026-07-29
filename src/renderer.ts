import { MarkdownRenderChild, Menu, Notice, TFile, TAbstractFile, type EventRef } from "obsidian";
import type NexusDashboardPlugin from "./main";
import { DIVIDER_PRESETS } from "./defaults";
import { SMALL_ICONS, ICONS, DEFAULT_ICON } from "./icons";
import { renderFiglet, getFontByName } from "./figlet";
import { parseDashboard, buildDefaultConfig } from "./parser";
import { safeParseInt, splitCsv } from "./utils";
import {
	DashboardConfig,
	DashboardBlock,
	DividerBlockConfig,
	HeaderConfig,
	HeadingConfig,
	SectionConfig,
	CardConfig,
	LinksConfig,
	RowConfig,
	ColumnConfig,
	RecentlyConfig,
	VaultListConfig,
	VaultActivityConfig,
	SearchConfig,
	ContentSlotType,
	HeatmapConfig,
	TimelineConfig,
	ClockConfig,
	FileTypeChartConfig,
	TaskSummaryConfig,
} from "./types";

export class NexusRenderer extends MarkdownRenderChild {
	private plugin: NexusDashboardPlugin;
	private source: string;
	private sourcePath: string;
	private rendering = false;
	private renderQueued = false;
	private searchAbortController: AbortController | null = null;
	private clockInterval: ReturnType<typeof setInterval> | null = null;
	private timelineEvents: Array<{
		time: number;
		action: "created" | "modified" | "deleted" | "moved";
		path: string;
		oldPath?: string;
	}> = [];
	private vaultEventRefs: EventRef[] = [];

	constructor(
		containerEl: HTMLElement,
		plugin: NexusDashboardPlugin,
		source: string,
		sourcePath: string,
	) {
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
		if (this.clockInterval) {
			clearInterval(this.clockInterval);
			this.clockInterval = null;
		}
		for (const ref of this.vaultEventRefs) {
			this.plugin.app.vault.offref(ref);
		}
		this.vaultEventRefs = [];
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
		const { config: baseConfig, placed } = this.buildConfigFromSettings();

		let config: DashboardConfig;
		if (sourceContent) {
			const codeBlockConfig = parseDashboard(sourceContent);
			config = this.mergeConfigs(baseConfig, codeBlockConfig, sourceContent);
		} else {
			config = baseConfig;
		}

		// Scan blocks recursively for search/stats placed inside rows/columns
		// so the top-level fallback doesn't also render them
		this.scanBlocksForPlaced(config.blocks, placed);

		// ── Header ────────────────────────────────────────
		if (config.header.enabled) {
			this.renderHeader(containerEl, config.header);
		}

		// ── Stats bar ─────────────────────────────────────
		if (!placed.has("stats") && config.stats.enabled && config.stats.items.length > 0) {
			this.renderStatsBar(containerEl, config.stats);
		}

		// ── Search bar ────────────────────────────────────
		if (!placed.has("search") && config.search?.show) {
			this.renderSearchBar(containerEl, config.search);
		}

		// ── Blocks (unified dispatch) ─────────────────────
		for (const block of config.blocks) {
			try {
				await this.renderBlock(containerEl, block, config);
			} catch (err) {
				// eslint-disable-next-line no-console
				console.error("[NEXUS RENDER ERROR] block render failed:", err);
			}
		}

		// ── Graph links (metadataCache injection) ─────────
		if (config.graph.enabled) {
			this.injectGraphLinks(config);
		}
	}

	// ── Unified block dispatch ───────────────────────────────

	private async renderBlock(
		containerEl: HTMLElement,
		block: DashboardBlock,
		config: DashboardConfig,
	): Promise<void> {
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
			case "column":
				this.renderColumn(containerEl, block, config);
				break;
			case "recently":
				await this.renderVaultActivity(containerEl, block);
				break;
			case "vaultlist":
				await this.renderVaultActivity(containerEl, block);
				break;
			case "vault-activity":
				await this.renderVaultActivity(containerEl, block);
				break;
			case "stats":
				this.renderStatsBar(containerEl, block.config);
				break;
			case "search":
				this.renderSearchBar(containerEl, block.config);
				break;
			case "heading":
				this.renderHeading(containerEl, block.config, config);
				break;
			case "heatmap":
				this.renderHeatmap(containerEl, block);
				break;
			case "timeline":
				this.renderTimeline(containerEl, block);
				break;
			case "clock":
				this.renderClock(containerEl, block);
				break;
			case "filetypes":
				this.renderFileTypeChart(containerEl, block);
				break;
			case "tasks":
				await this.renderTaskSummary(containerEl, block);
				break;
		}
	}

	// ── Config merge ───────────────────────────────────────────

	private mergeConfigs(
		base: DashboardConfig,
		override: DashboardConfig,
		source: string,
	): DashboardConfig {
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
		const hasBlocks =
			source.includes("section:") ||
			source.includes("divider:") ||
			source.includes("links:") ||
			source.includes("row:") ||
			source.includes("column:") ||
			source.includes("vaultlist:") ||
			source.includes("vault-activity:") ||
			source.includes("heatmap:") ||
			source.includes("timeline:") ||
			source.includes("clock:") ||
			source.includes("filetypes:");
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

	private buildConfigFromSettings(): { config: DashboardConfig; placed: Set<ContentSlotType> } {
		const opts = this.plugin.settings;
		const config = buildDefaultConfig();

		config.header = {
			text: opts.headerText || "NEXUS",
			font: opts.asciiDefaultFont || "ANSI Shadow",
			color: opts.asciiDefaultColor || "#8A5CF6",
			size: opts.asciiDefaultSize ?? 1,
			mobileSize: opts.asciiMobileSize,
			enabled: opts.showHeader !== false,
			align: opts.asciiDefaultAlign || "center",
		};

		config.stats = {
			enabled: opts.showStats,
			items: (opts.stats || []).map((s) => ({
				label: s.label,
				folder: s.folder,
			})),
		};

		if (opts.showSearch) {
			config.search = { show: true, default: opts.searchDefault || "vault" };
		}

		config.graph = { enabled: opts.showGraph, exclude: opts.excludeFolders || [] };

		// Track which slot types are placed in layouts
		const placed = new Set<ContentSlotType>();

		const renderSlotChildren = (
			slot: ContentSlotType,
			headingOverride?: HeadingConfig,
			vaultListName?: string,
			dividerLabel?: string,
		): DashboardBlock | null => {
			switch (slot) {
				case "moc-cards":
					if (opts.showMocCards !== false && opts.mocs && opts.mocs.length > 0) {
						placed.add("moc-cards");
						return {
							kind: "section",
							columns: opts.mocGridColumns,
							cards: opts.mocs.map((moc) => ({
								type: "big" as const,
								label: moc.title,
								desc: moc.desc,
								path: moc.path,
								icon: moc.icon,
							})),
							divider: opts.showMocDivider
								? { kind: "divider", title: opts.mocDividerLabel || "MOC CARDS" }
								: undefined,
						};
					}
					return null;
				case "quick-links":
					if (opts.showQuickLinks !== false && opts.quickLinks && opts.quickLinks.length > 0) {
						placed.add("quick-links");
						return {
							kind: "links",
							title: opts.showQuickLinksDivider ? opts.quickLinksDividerLabel || "Quick Links" : undefined,
							columns: 1,
							items: opts.quickLinks.map((link) => ({
								url: link.url,
								label: link.label,
								icon: link.icon,
							})),
						} as LinksConfig;
					}
					return null;
				case "vault-activity": {
					// If a vault list name is specified, look it up
					if (vaultListName) {
						const vlEntry = opts.vaultLists.find((v) => v.name === vaultListName);
						if (vlEntry) {
							placed.add("vault-activity");
							return {
								kind: "vault-activity",
								show: true,
								count: vlEntry.count || opts.vaultActivityCount,
								path: vlEntry.path || undefined,
							tags: vlEntry.tags
								? splitCsv(vlEntry.tags)
								: undefined,
								label: vlEntry.name,
							} as VaultActivityConfig;
						}
					}
					// No vault list selected - render nothing
					return null;
				}
				case "divider":
					placed.add("divider");
					return {
						kind: "section",
						columns: 1,
						cards: [],
						divider: {
							kind: "divider",
							title: dividerLabel || "",
							type: "custom",
						},
					};
				case "stats":
					if (!opts.showStats) return null;
					placed.add("stats");
					return { kind: "stats", config: config.stats };
				case "search":
					if (!opts.showSearch) return null;
					placed.add("search");
					return { kind: "search", config: config.search || { show: true } };
				case "heading":
					placed.add("heading");
					return { kind: "heading", config: headingOverride || { text: "Section" } };
				case "heatmap":
					if (!opts.showHeatmap) return null;
					placed.add("heatmap");
					return {
						kind: "heatmap",
						show: true,
						weeks: opts.heatmapWeeks,
						label: opts.heatmapLabel,
					} as HeatmapConfig;
				case "timeline":
					if (!opts.showActivityTimeline) return null;
					placed.add("timeline");
					return {
						kind: "timeline",
						show: true,
						count: opts.activityTimelineCount,
						label: opts.activityTimelineLabel,
					} as TimelineConfig;
				case "clock":
					if (!opts.showClock) return null;
					placed.add("clock");
					return {
						kind: "clock",
						show: true,
						timezone: opts.clockTimezone,
						showDate: opts.clockShowDate,
						showSeconds: opts.clockShowSeconds,
						format: opts.clockFormat,
						label: opts.clockLabel,
					} as ClockConfig;
			case "filetypes":
				if (!opts.showFileTypeChart) return null;
				placed.add("filetypes");
				return {
					kind: "filetypes",
					show: true,
					max: opts.fileTypeChartMax,
					label: opts.fileTypeChartLabel,
				} as FileTypeChartConfig;
			case "tasks":
				if (!opts.showTaskSummary) return null;
				placed.add("tasks");
				return {
					kind: "tasks",
					show: true,
					showProgress: opts.taskSummaryShowProgress,
					showList: opts.taskSummaryShowList,
					count: opts.taskSummaryCount,
					path: opts.taskSummaryPath,
					tags: opts.taskSummaryTags ? splitCsv(opts.taskSummaryTags) : undefined,
					label: opts.taskSummaryLabel,
				} as TaskSummaryConfig;
			default:
					return null;
			}
		};

		// ── Build layout blocks from row/column layouts ──

		// If user has custom row or column layouts, clear the default blocks
		// to prevent components from rendering both in slots AND in defaults
		const hasUserLayouts =
			(opts.rowLayouts && opts.rowLayouts.length > 0) ||
			(opts.columnLayouts && opts.columnLayouts.length > 0);
		if (hasUserLayouts) {
			config.blocks = [];
		}

		if (hasUserLayouts) {
			if (opts.rowLayouts && opts.rowLayouts.length > 0) {
				for (const rowLayout of opts.rowLayouts) {
					const children: DashboardBlock[] = [];
					for (let i = 0; i < rowLayout.columns; i++) {
						const slot = rowLayout.slots?.[i] || "none";
						const headingKey = String(i);

						if (Array.isArray(slot)) {
							// Sub-slots: create a ColumnConfig for this column
							const columnChildren: DashboardBlock[] = [];
							for (let j = 0; j < slot.length; j++) {
								const subSlot = slot[j];
								const subHeadingKey = `${i}-${j}`;
								const headingCfg = rowLayout.slotHeadings?.[subHeadingKey];
								const vlName = rowLayout.vaultListSlots?.[subHeadingKey];
								const dvLabel = rowLayout.dividerSlots?.[subHeadingKey];
								const child = renderSlotChildren(subSlot, headingCfg, vlName, dvLabel);
								if (child) {
									columnChildren.push(child);
								}
							}
							if (columnChildren.length > 0) {
								children.push({
									kind: "column",
									spacing: "0.5rem",
									children: columnChildren as ColumnConfig["children"],
								});
							} else {
								children.push({ kind: "section", columns: 1, cards: [] });
							}
						} else {
							const headingCfg = rowLayout.slotHeadings?.[headingKey];
							const vlName = rowLayout.vaultListSlots?.[headingKey];
							const dvLabel = rowLayout.dividerSlots?.[headingKey];
							const child = renderSlotChildren(slot, headingCfg, vlName, dvLabel);
							if (child) {
								children.push(child);
							} else {
								// empty column placeholder
								children.push({ kind: "section", columns: 1, cards: [] });
							}
						}
					}
					if (children.length > 0) {
						config.blocks.push({
							kind: "row",
							columns: rowLayout.columns,
							proportion: rowLayout.proportion,
							align: rowLayout.align,
							children: children as RowConfig["children"],
						});
					}
				}
			}

			if (opts.columnLayouts && opts.columnLayouts.length > 0) {
				for (const columnLayout of opts.columnLayouts) {
					const children: DashboardBlock[] = [];
					for (let i = 0; i < (columnLayout.slots || []).length; i++) {
						const slot = columnLayout.slots[i];
						const vlName = columnLayout.vaultListSlots?.[String(i)];
						const dvLabel = columnLayout.dividerSlots?.[String(i)];
						const child = renderSlotChildren(slot, undefined, vlName, dvLabel);
						if (child) {
							children.push(child);
						}
					}
					if (children.length > 0) {
						config.blocks.push({
							kind: "column",
							spacing: columnLayout.spacing,
							align: columnLayout.align,
							children: children as ColumnConfig["children"],
						});
					}
				}
			}
		} else {
			// ── Default layout for fresh users (no user layouts configured) ──
			// Row 1: Stats | Clock | Search
			// Row 2: Timeline | MOC Cards | Heatmap
			config.blocks = [];

			const row1Children: DashboardBlock[] = [];
			const r1Stats = renderSlotChildren("stats");
			if (r1Stats) row1Children.push(r1Stats);
			const r1Clock = renderSlotChildren("clock");
			if (r1Clock) row1Children.push(r1Clock);
			const r1Search = renderSlotChildren("search");
			if (r1Search) row1Children.push(r1Search);
			if (row1Children.length > 0) {
				config.blocks.push({
					kind: "row",
					columns: row1Children.length,
					proportion: "33/33/34",
					children: row1Children as RowConfig["children"],
				});
			}

			const row2Children: DashboardBlock[] = [];
			const r2Timeline = renderSlotChildren("timeline");
			if (r2Timeline) row2Children.push(r2Timeline);
			const r2Moc = renderSlotChildren("moc-cards");
			if (r2Moc) row2Children.push(r2Moc);
			const r2Heatmap = renderSlotChildren("heatmap");
			if (r2Heatmap) row2Children.push(r2Heatmap);
			if (row2Children.length > 0) {
				config.blocks.push({
					kind: "row",
					columns: row2Children.length,
					proportion: "33/34/33",
					children: row2Children as RowConfig["children"],
				});
			}
		}

		// ── Fallback: add unplaced content as standalone blocks ──

		const fallbackTypes: ContentSlotType[] = [
			"moc-cards",
			"quick-links",
			"heatmap",
			"timeline",
			"clock",
			"filetypes",
		];
		for (const slotType of fallbackTypes) {
			if (!placed.has(slotType)) {
				const block = renderSlotChildren(slotType);
				if (block) config.blocks.push(block);
			}
		}

		return { config, placed };
	}

	// ── Scan blocks recursively for search/stats placed inside rows/columns ──

	private scanBlocksForPlaced(blocks: DashboardConfig["blocks"], placed: Set<string>): void {
		for (const block of blocks) {
			if (block.kind === "stats") placed.add("stats");
			if (block.kind === "search") placed.add("search");
			if (block.kind === "tasks") placed.add("tasks");
			if (block.kind === "row" || block.kind === "column") {
				this.scanBlocksForPlaced(block.children, placed);
			}
		}
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
		pre.style.setProperty(
			"--nexus-ascii-mobile-size",
			String(header.mobileSize ?? header.size * 0.5),
		);

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

	// ── Render: Heading ────────────────────────────────────────

	private renderHeading(
		containerEl: HTMLElement,
		heading: HeadingConfig,
		config: DashboardConfig,
	): void {
		const headerFont = config.header.font || "ANSI Shadow";
		const font = getFontByName(headerFont);
		const rendered = renderFiglet(heading.text, { font });
		const wrapper = containerEl.createDiv({ cls: "nexus-heading-wrapper" });
		if (heading.align) wrapper.dataset.align = heading.align;
		const pre = wrapper.createEl("pre", { text: rendered, cls: "nexus-heading-output" });
		if (heading.color) pre.style.color = heading.color;
		const sizeMap: Record<string, number> = { small: 0.4, medium: 0.6, large: 0.8 };
		const size = sizeMap[heading.size || "medium"] || 0.6;
		pre.style.setProperty("--nexus-heading-size", String(size));
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

		const hasMini = section.cards.some((c) => c.type === "mini");
		const hasBig = section.cards.some((c) => c.type === "big");
		const gridCls =
			hasMini && !hasBig
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

		const pillsEl = wrapper.createDiv({ cls: "nexus-links-pills" });

		for (const item of links.items) {
			const pill = pillsEl.createEl("a", { cls: "nexus-link-pill" });
			pill.href = item.url;
			pill.target = "_blank";
			pill.rel = "noopener";
			pill.textContent = item.label || item.url;
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
			this.renderBlock(colEl, child, config);

			if (i < children.length - 1 && i < cols - 1) {
				const dividerEl = rowEl.createDiv({ cls: "nexus-row-divider" });
				this.setupColumnDrag(dividerEl, rowEl, colWidths, i, rowIndex);
			}
		}
	}

	// ── Render: Column ─────────────────────────────────────────

	private renderColumn(
		containerEl: HTMLElement,
		column: ColumnConfig,
		config: DashboardConfig,
	): void {
		if (column.children.length === 0) return;

		const columnEl = containerEl.createDiv({ cls: "nexus-column" });

		// Apply spacing (vertical gap)
		if (column.spacing) {
			columnEl.style.gap = column.spacing;
		}

		// Apply horizontal alignment
		if (column.align && column.align !== "stretch") {
			columnEl.style.alignItems =
				column.align === "left" ? "flex-start" : column.align === "right" ? "flex-end" : "center";
		}

		// Render children with dividers between them
		for (let i = 0; i < column.children.length; i++) {
			const child = column.children[i];
			const itemEl = columnEl.createDiv({ cls: "nexus-column-item" });
			this.renderBlock(itemEl, child, config);

			if (i < column.children.length - 1) {
				columnEl.createDiv({ cls: "nexus-column-divider" });
			}
		}
	}

	// ── Render: Search Bar ────────────────────────────────────

	private renderSearchBar(containerEl: HTMLElement, search: SearchConfig): void {
		const wrapper = containerEl.createDiv({ cls: "nexus-search" });

		// Input + clear button wrapper
		const inputWrap = wrapper.createDiv({ cls: "nexus-search-input-wrap" });
		const input = inputWrap.createEl("input", {
			cls: "nexus-search-input",
			attr: {
				type: "text",
				placeholder: search.placeholder || "Search notes...",
			},
		});

		const clearBtn = inputWrap.createSpan({ cls: "nexus-search-clear", text: "\u2715" });
		clearBtn.addEventListener("click", () => {
			resetSearch({ focus: true });
		});

		// Count / no-results text
		const countEl = wrapper.createDiv({ cls: "nexus-search-count" });

		// Results dropdown
		const resultsEl = wrapper.createDiv({ cls: "nexus-search-results" });
		resultsEl.style.display = "none";

		let debounceTimer: ReturnType<typeof setTimeout>;
		let selectedIndex = -1;
		let currentMatches: TFile[] = [];

		const resetSearch = (opts?: { focus?: boolean; blur?: boolean }) => {
			input.value = "";
			clearBtn.classList.remove("visible");
			countEl.textContent = "";
			resultsEl.style.display = "none";
			resultsEl.empty();
			selectedIndex = -1;
			currentMatches = [];
			if (opts?.focus) input.focus();
			if (opts?.blur) input.blur();
		};

		const highlightMatch = (text: string, query: string): string => {
			if (!query) return this.escapeHtml(text);
			const idx = text.toLowerCase().indexOf(query.toLowerCase());
			if (idx === -1) return this.escapeHtml(text);
			const before = text.slice(0, idx);
			const match = text.slice(idx, idx + query.length);
			const after = text.slice(idx + query.length);
			return `${this.escapeHtml(before)}<mark>${this.escapeHtml(match)}</mark>${this.escapeHtml(after)}`;
		};

		const updateSelection = () => {
			const items = resultsEl.querySelectorAll(".nexus-search-result");
			items.forEach((el, i) => {
				el.classList.toggle("selected", i === selectedIndex);
			});
			if (selectedIndex >= 0 && items[selectedIndex]) {
				(items[selectedIndex] as HTMLElement).scrollIntoView({ block: "nearest" });
			}
		};

		const openSelected = () => {
			if (selectedIndex >= 0 && selectedIndex < currentMatches.length) {
				const file = currentMatches[selectedIndex];
				this.plugin.app.workspace.openLinkText(file.path, "", false);
				resetSearch();
			}
		};

		const renderResults = (query: string) => {
			const files = this.plugin.app.vault.getMarkdownFiles();
			currentMatches = files
				.filter((f) => f.basename.toLowerCase().includes(query) || f.path.toLowerCase().includes(query))
				.slice(0, 10);

			resultsEl.empty();
			selectedIndex = -1;

			if (currentMatches.length === 0) {
				resultsEl.style.display = "none";
				countEl.createDiv({ cls: "nexus-search-no-results", text: "No results found" });
				return;
			}

			countEl.textContent = `${currentMatches.length} result${currentMatches.length !== 1 ? "s" : ""}`;
			resultsEl.style.display = "block";

			for (const file of currentMatches) {
				const resultEl = resultsEl.createDiv({ cls: "nexus-search-result" });
				const nameEl = resultEl.createEl("span", { cls: "nexus-search-result-name" });
				nameEl.innerHTML = highlightMatch(file.basename, query);
				const pathEl = resultEl.createEl("span", { text: file.path, cls: "nexus-search-result-path" });

				const openFile = () => {
					this.plugin.app.workspace.openLinkText(file.path, "", false);
					resetSearch();
				};

				resultEl.addEventListener("click", openFile);
				nameEl.addEventListener("click", openFile);
				pathEl.addEventListener("click", openFile);
			}
		};

		input.addEventListener("input", () => {
			const hasText = input.value.length > 0;
			clearBtn.classList.toggle("visible", hasText);

			clearTimeout(debounceTimer);
			debounceTimer = setTimeout(() => {
				const query = input.value.trim().toLowerCase();
				countEl.textContent = "";
				if (query.length < 2) {
					resultsEl.style.display = "none";
					resultsEl.empty();
					currentMatches = [];
					selectedIndex = -1;
					return;
				}
				renderResults(query);
			}, 200);
		});

		// Keyboard navigation
		input.addEventListener("keydown", (e) => {
			const isOpen = resultsEl.style.display === "block";
			if (e.key === "Escape") {
				resetSearch({ blur: true });
				return;
			}
			if (!isOpen) return;

			if (e.key === "ArrowDown") {
				e.preventDefault();
				selectedIndex = Math.min(selectedIndex + 1, currentMatches.length - 1);
				updateSelection();
			} else if (e.key === "ArrowUp") {
				e.preventDefault();
				selectedIndex = Math.max(selectedIndex - 1, 0);
				updateSelection();
			} else if (e.key === "Enter") {
				e.preventDefault();
				openSelected();
			}
		});

		if (this.searchAbortController) {
			this.searchAbortController.abort();
		}
		this.searchAbortController = new AbortController();
		const signal = this.searchAbortController.signal;

		document.addEventListener(
			"click",
			(e) => {
				if (!wrapper.contains(e.target as Node)) {
					resultsEl.style.display = "none";
					resultsEl.empty();
					selectedIndex = -1;
					currentMatches = [];
				}
			},
			{ signal },
		);
	}

	// ── Shared helpers ────────────────────────────────────────

	private escapeHtml(text: string): string {
		const div = document.createElement("div");
		div.textContent = text;
		return div.innerHTML;
	}

	// ── Shared file filtering + card rendering helpers ──────────

	private getFilteredFiles(
		config: { path?: string; tags?: string[]; count?: number },
		defaultCount: number,
	): TFile[] {
		const opts = this.plugin.settings;
		const count = config.count ?? defaultCount;
		const exclude = opts.excludeFolders || [];

		let files = this.plugin.app.vault.getMarkdownFiles();

		if (config.path) {
			const paths = splitCsv(config.path).map((p) => p.toLowerCase());
			files = files.filter((f) => {
				const pathLower = f.path.toLowerCase();
				return paths.some((p) => pathLower.startsWith(p + "/") || pathLower === p);
			});
		}

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

		files = files.filter((f) => {
			const firstFolder = f.path.split("/")[0];
			return !exclude.includes(firstFolder);
		});

		return files.sort((a, b) => b.stat.mtime - a.stat.mtime).slice(0, count);
	}

	// ── Render: Vault Activity ─────────────────────────────────

	private async renderVaultActivity(
		containerEl: HTMLElement,
		config: RecentlyConfig | VaultListConfig | VaultActivityConfig,
	): Promise<void> {
		const opts = this.plugin.settings;
		const filterConfig = { path: config.path, tags: config.tags, count: config.count };
		const files = this.getFilteredFiles(filterConfig, config.count ?? opts.vaultActivityCount ?? 9);
		if (files.length === 0) return;

		const wrapperEl = containerEl.createDiv({ cls: "nexus-section" });

		// Determine label
		let label: string | undefined;
		if (config.kind === "vault-activity") {
			label = config.label || opts.vaultActivityLabel || "VAULT ACTIVITY";
		} else if (config.kind === "vaultlist") {
			label = config.path || "Vault List";
		} else {
			label = "Recently Modified";
		}

		if (label) {
			this.renderDivider(wrapperEl, label);
		}

		// Compact file list
		const listEl = wrapperEl.createDiv({ cls: "nexus-vault-activity" });

		const relativeTime = (mtime: number): string => {
			const now = Date.now();
			const diff = now - mtime;
			const seconds = Math.floor(diff / 1000);
			if (seconds < 60) return "just now";
			const minutes = Math.floor(seconds / 60);
			if (minutes < 60) return `${minutes}m ago`;
			const hours = Math.floor(minutes / 60);
			if (hours < 24) return `${hours}h ago`;
			const days = Math.floor(hours / 24);
			if (days < 30) return `${days}d ago`;
			const months = Math.floor(days / 30);
			return `${months}mo ago`;
		};

		for (const file of files) {
			const row = listEl.createDiv({ cls: "nexus-vault-activity-row" });

			row.createEl("span", {
				text: file.basename,
				cls: "nexus-vault-activity-name",
			});

			row.createEl("span", {
				text: relativeTime(file.stat.mtime),
				cls: "nexus-vault-activity-time",
			});

			row.addEventListener("click", () => {
				this.plugin.app.workspace.openLinkText(file.path, "", false);
			});
		}
	}

	// ── Render: Heatmap ──────────────────────────────────────

	private renderHeatmap(containerEl: HTMLElement, config: HeatmapConfig): void {
		const weeks = config.weeks || 20;
		const label = config.label || "CONTRIBUTION ACTIVITY";
		const now = new Date();
		const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
		const opts = this.plugin.settings;
		const exclude = opts.excludeFolders || [];

		// Calculate start date (beginning of week, going back N weeks)
		const startDate = new Date(today);
		startDate.setDate(startDate.getDate() - (weeks - 1) * 7 - startDate.getDay());

		// Count files per day using only markdown files + excludeFolders
		const dayCounts = new Map<string, number>();
		const files = this.plugin.app.vault.getMarkdownFiles();
		for (const file of files) {
			// Skip excluded folders
			const firstFolder = file.path.split("/")[0];
			if (exclude.includes(firstFolder)) continue;

			// Use ctime (created) or mtime — prefer mtime for activity
			const d = new Date(file.stat.mtime);
			const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
			dayCounts.set(key, (dayCounts.get(key) || 0) + 1);
		}

		// Merge timeline events
		for (const event of this.timelineEvents) {
			if (event.action === "deleted") continue;
			const d = new Date(event.time);
			const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
			dayCounts.set(key, (dayCounts.get(key) || 0) + 1);
		}

		// Normalize maxCount to displayed range only
		let maxCount = 0;
		for (let d = 0; d < 7; d++) {
			for (let w = 0; w < weeks; w++) {
				const cellDate = new Date(startDate);
				cellDate.setDate(cellDate.getDate() + w * 7 + d);
				if (cellDate > today) continue;
				const key = `${cellDate.getFullYear()}-${String(cellDate.getMonth() + 1).padStart(2, "0")}-${String(cellDate.getDate()).padStart(2, "0")}`;
				const count = dayCounts.get(key) || 0;
				if (count > maxCount) maxCount = count;
			}
		}
		maxCount = Math.max(1, maxCount);

		const wrapper = containerEl.createDiv({ cls: "nexus-section" });
		if (label) {
			this.renderDivider(wrapper, label);
		}

		const heatmapEl = wrapper.createDiv({ cls: "nexus-heatmap" });
		heatmapEl.style.setProperty("--nexus-heatmap-weeks", String(weeks));

		// Month labels row — one spanned label per month
		const monthRow = heatmapEl.createDiv({ cls: "nexus-heatmap-months" });
		const monthNames = [
			"Jan",
			"Feb",
			"Mar",
			"Apr",
			"May",
			"Jun",
			"Jul",
			"Aug",
			"Sep",
			"Oct",
			"Nov",
			"Dec",
		];

		// Empty spacer for day-label gutter alignment
		const gutter = monthRow.createDiv({ cls: "nexus-heatmap-month-spacer" });
		gutter.style.visibility = "hidden";

		// Group consecutive weeks by month
		const monthCounts: { month: number; count: number }[] = [];
		let curMonth = -1;
		for (let w = 0; w < weeks; w++) {
			const weekStart = new Date(startDate);
			weekStart.setDate(weekStart.getDate() + w * 7);
			const m = weekStart.getMonth();
			if (m !== curMonth) {
				monthCounts.push({ month: m, count: 1 });
				curMonth = m;
			} else {
				monthCounts[monthCounts.length - 1].count++;
			}
		}

		let col = 2;
		for (const g of monthCounts) {
			const spacer = monthRow.createDiv({ cls: "nexus-heatmap-month-spacer" });
			spacer.textContent = monthNames[g.month];
			spacer.style.gridColumn = `${col} / span ${g.count}`;
			col += g.count;
		}

		// Day labels + grid
		const bodyEl = heatmapEl.createDiv({ cls: "nexus-heatmap-body" });
		const dayLabels = bodyEl.createDiv({ cls: "nexus-heatmap-days" });
		const dayAbbrevs = ["", "Mon", "", "Wed", "", "Fri", ""];
		for (const abbr of dayAbbrevs) {
			const lbl = dayLabels.createDiv({ cls: "nexus-heatmap-day-label" });
			if (abbr) lbl.textContent = abbr;
		}

		const gridEl = bodyEl.createDiv({ cls: "nexus-heatmap-grid" });
		gridEl.style.gridTemplateColumns = `repeat(${weeks}, 1fr)`;

		for (let d = 0; d < 7; d++) {
			for (let w = 0; w < weeks; w++) {
				const cellDate = new Date(startDate);
				cellDate.setDate(cellDate.getDate() + w * 7 + d);
				const key = `${cellDate.getFullYear()}-${String(cellDate.getMonth() + 1).padStart(2, "0")}-${String(cellDate.getDate()).padStart(2, "0")}`;
				const count = dayCounts.get(key) || 0;
				const cell = gridEl.createDiv({ cls: "nexus-heatmap-cell" });
				cell.title = `${key}: ${count} file${count !== 1 ? "s" : ""}`;

				if (cellDate > today) {
					cell.classList.add("nexus-heatmap-cell-empty");
				} else if (count === 0) {
					cell.classList.add("nexus-heatmap-cell-level-0");
				} else {
					const level = Math.min(5, Math.ceil((count / maxCount) * 5));
					cell.classList.add(`nexus-heatmap-cell-level-${level}`);
				}
			}
		}

		// Legend
		const legendEl = heatmapEl.createDiv({ cls: "nexus-heatmap-legend" });
		legendEl.createEl("span", { text: "Less", cls: "nexus-heatmap-legend-label" });
		for (let i = 0; i <= 5; i++) {
			const box = legendEl.createDiv({ cls: `nexus-heatmap-cell nexus-heatmap-cell-level-${i}` });
			box.style.width = "10px";
			box.style.height = "10px";
		}
		legendEl.createEl("span", { text: "More", cls: "nexus-heatmap-legend-label" });
	}

	// ── Render: Timeline ─────────────────────────────────────

	private renderTimeline(containerEl: HTMLElement, config: TimelineConfig): void {
		const count = config.count || 20;
		const label = config.label || "ACTIVITY";
		const exclude = config.exclude || this.plugin.settings.excludeFolders || [];

		// Build initial activity from vault files sorted by mtime
		const files = this.plugin.app.vault.getFiles();
		const recent = files
			.filter((f) => {
				const firstFolder = f.path.split("/")[0];
				return !exclude.includes(firstFolder);
			})
			.sort((a, b) => b.stat.mtime - a.stat.mtime)
			.slice(0, count);

		const wrapper = containerEl.createDiv({ cls: "nexus-section" });
		if (label) {
			this.renderDivider(wrapper, label);
		}

		const listEl = wrapper.createDiv({ cls: "nexus-timeline" });

		// Merge stored events with file-based entries, dedupe, take latest
		const allEvents = [...this.timelineEvents];
		for (const file of recent) {
			const exists = allEvents.some((e) => e.path === file.path && e.action === "modified");
			if (!exists) {
				allEvents.push({ time: file.stat.mtime, action: "modified", path: file.path });
			}
		}
		allEvents.sort((a, b) => b.time - a.time);
		const displayed = allEvents.slice(0, count);

		if (displayed.length === 0) return;

		const timeFormatter = new Intl.DateTimeFormat(undefined, {
			hour: "2-digit",
			minute: "2-digit",
			hour12: false,
		});

		for (const event of displayed) {
			const row = listEl.createDiv({ cls: "nexus-timeline-row" });
			row.createEl("span", {
				text: timeFormatter.format(new Date(event.time)),
				cls: "nexus-timeline-time",
			});
			row.createEl("span", {
				text: event.action.padEnd(9),
				cls: `nexus-timeline-action nexus-timeline-action--${event.action}`,
			});
			row.createEl("span", {
				text: event.oldPath ? `${event.oldPath} → ${event.path}` : event.path,
				cls: "nexus-timeline-path",
			});

			// Click to open file
			row.addEventListener("click", () => {
				const file = this.plugin.app.vault.getAbstractFileByPath(event.path);
				if (file instanceof TFile) {
					this.plugin.app.workspace.openLinkText(event.path, "", false);
				}
			});
		}

		// Register vault event listeners for real-time tracking
		this.registerTimelineEvents();
	}

	private registerTimelineEvents(): void {
		if (this.vaultEventRefs.length > 0) return;

		const onVaultCreate = (file: TAbstractFile) => {
			if (!(file instanceof TFile)) return;
			this.timelineEvents.unshift({ time: Date.now(), action: "created", path: file.path });
			this.pruneTimelineEvents(100);
		};

		const onVaultModify = (file: TAbstractFile) => {
			if (!(file instanceof TFile)) return;
			const existing = this.timelineEvents.findIndex(
				(e) => e.path === file.path && e.action === "modified",
			);
			if (existing >= 0) {
				this.timelineEvents[existing].time = Date.now();
			} else {
				this.timelineEvents.unshift({ time: Date.now(), action: "modified", path: file.path });
			}
			this.pruneTimelineEvents(100);
		};

		const onVaultDelete = (file: TAbstractFile) => {
			if (!(file instanceof TFile)) return;
			this.timelineEvents.unshift({ time: Date.now(), action: "deleted", path: file.path });
			this.pruneTimelineEvents(100);
		};

		const onVaultRename = (file: TAbstractFile, oldPath: string) => {
			if (!(file instanceof TFile)) return;
			this.timelineEvents.unshift({ time: Date.now(), action: "moved", path: file.path, oldPath });
			this.pruneTimelineEvents(100);
		};

		this.vaultEventRefs.push(
			this.plugin.app.vault.on("create", onVaultCreate),
			this.plugin.app.vault.on("modify", onVaultModify),
			this.plugin.app.vault.on("delete", onVaultDelete),
			this.plugin.app.vault.on("rename", onVaultRename),
		);
	}

	private pruneTimelineEvents(max: number): void {
		if (this.timelineEvents.length > max) {
			this.timelineEvents.length = max;
		}
	}

	// ── Render: Clock ────────────────────────────────────────

	private renderClock(containerEl: HTMLElement, config: ClockConfig): void {
		const showDate = config.showDate !== false;
		const showSeconds = config.showSeconds === true;
		const format = config.format || "12h";
		const timezone = config.timezone || undefined;
		const label = config.label || "";

		if (label) {
			this.renderDivider(containerEl, label);
		}

		const clockEl = containerEl.createDiv({ cls: "nexus-clock" });

		const timeEl = clockEl.createDiv({ cls: "nexus-clock-time" });
		const dateEl = showDate ? clockEl.createDiv({ cls: "nexus-clock-date" }) : null;

		const timeOpts: Intl.DateTimeFormatOptions = {
			hour: "2-digit",
			minute: "2-digit",
			hour12: format === "12h",
		};
		if (showSeconds) timeOpts.second = "2-digit";
		if (timezone) timeOpts.timeZone = timezone;

		const dateOpts: Intl.DateTimeFormatOptions = {
			weekday: "long",
			year: "numeric",
			month: "long",
			day: "numeric",
		};
		if (timezone) dateOpts.timeZone = timezone;

		const updateClock = () => {
			const now = new Date();
			timeEl.textContent = new Intl.DateTimeFormat(undefined, timeOpts).format(now);
			if (dateEl) {
				dateEl.textContent = new Intl.DateTimeFormat(undefined, dateOpts).format(now);
			}
		};

		updateClock();

		// Clear any existing clock interval
		if (this.clockInterval) {
			clearInterval(this.clockInterval);
		}
		this.clockInterval = setInterval(updateClock, 1000);
	}

	// ── Render: File Type Distribution ───────────────────────

	private renderFileTypeChart(containerEl: HTMLElement, config: FileTypeChartConfig): void {
		const max = config.max || 8;
		const label = config.label || "FILE TYPES";

		// Count by extension
		const extCounts = new Map<string, number>();
		const files = this.plugin.app.vault.getFiles();
		for (const file of files) {
			const ext = file.extension || "no ext";
			extCounts.set(ext, (extCounts.get(ext) || 0) + 1);
		}

		const sorted = Array.from(extCounts.entries()).sort((a, b) => b[1] - a[1]);

		if (sorted.length === 0) return;

		const topTypes = sorted.slice(0, max);
		const otherCount = sorted.slice(max).reduce((sum, [_, count]) => sum + count, 0);
		const total = files.length;

		const displayItems = [...topTypes];
		if (otherCount > 0) {
			displayItems.push(["Other", otherCount]);
		}

		const maxCount = displayItems[0][1];

		const wrapper = containerEl.createDiv({ cls: "nexus-section" });
		if (label) {
			this.renderDivider(wrapper, label);
		}

		const chartEl = wrapper.createDiv({ cls: "nexus-filetypes" });

		for (const [ext, count] of displayItems) {
			const row = chartEl.createDiv({ cls: "nexus-filetypes-row" });
			row.createEl("span", { text: `.${ext}`, cls: "nexus-filetypes-ext" });
			row.createEl("span", { text: String(count), cls: "nexus-filetypes-count" });
			const barTrack = row.createDiv({ cls: "nexus-filetypes-bar-track" });
			const barFill = barTrack.createDiv({ cls: "nexus-filetypes-bar-fill" });
			const widthPct = maxCount > 0 ? (count / maxCount) * 100 : 0;
			barFill.style.width = `${widthPct}%`;
			const pctText = total > 0 ? Math.round((count / total) * 100) : 0;
			row.createEl("span", { text: `${pctText}%`, cls: "nexus-filetypes-pct" });
		}
	}

	// ── Render: Task Summary ─────────────────────────────────

	private async renderTaskSummary(containerEl: HTMLElement, config: TaskSummaryConfig): Promise<void> {
		const label = config.label || "TASKS";
		const showProgress = config.showProgress !== false;
		const showList = config.showList !== false;
		const maxList = config.count || 10;
		const filterPath = config.path || "";
		const filterTags = config.tags || [];

		const files = this.plugin.app.vault.getMarkdownFiles();
		const filtered = files.filter((f) => {
			if (filterPath && !f.path.startsWith(filterPath)) return false;
			if (filterTags.length > 0) {
				const cache = this.plugin.app.metadataCache.getFileCache(f);
				const fileTags = (cache?.frontmatter?.tags as string[]) || [];
				const hasTag = filterTags.some((t) => fileTags.includes(t));
				if (!hasTag) return false;
			}
			return true;
		});

		let total = 0;
		let done = 0;
		const openTasks: { text: string; file: TFile; line: number }[] = [];

		for (const file of filtered) {
			const cache = this.plugin.app.metadataCache.getFileCache(file);
			const items = cache?.listItems;
			if (!items) continue;

			const raw = await this.plugin.app.vault.cachedRead(file);
			const lines = raw.split("\n");

			for (const item of items) {
				if (item.task === undefined) continue;
				total++;
				if (item.task === "x") {
					done++;
				} else {
					const lineIdx = item.position.start.line;
					const rawLine = lines[lineIdx] || "";
					const taskText = rawLine.replace(/^[\s\-*\d.]*\[[ xX]\]\s*/, "").trim();
					if (taskText) {
						openTasks.push({ text: taskText, file, line: lineIdx });
					}
				}
			}
		}

		// Sort tasks by file mtime (latest first), then by line number within file
		openTasks.sort((a, b) => {
			const timeDiff = b.file.stat.mtime - a.file.stat.mtime;
			if (timeDiff !== 0) return timeDiff;
			return a.line - b.line;
		});

		const remaining = total - done;
		const pct = total > 0 ? Math.round((done / total) * 100) : 0;

		const wrapper = containerEl.createDiv({ cls: "nexus-section" });
		if (label) {
			this.renderDivider(wrapper, label);
		}

		const taskEl = wrapper.createDiv({ cls: "nexus-tasks" });

		// Empty state
		if (total === 0) {
			const emptyEl = taskEl.createDiv({ cls: "nexus-tasks-empty" });
			emptyEl.createEl("span", { text: "No tasks found", cls: "nexus-tasks-empty-text" });
			if (filterPath) {
				emptyEl.createEl("span", { text: `in ${filterPath}`, cls: "nexus-tasks-empty-path" });
			}
			return;
		}

		// Stats row
		const statsRow = taskEl.createDiv({ cls: "nexus-tasks-stats" });
		const statItems = [
			{ value: String(total), label: "Total" },
			{ value: String(done), label: "Done" },
			{ value: String(remaining), label: "Open" },
			{ value: `${pct}%`, label: "" },
		];
		for (const stat of statItems) {
			const statEl = statsRow.createDiv({ cls: "nexus-tasks-stat" });
			statEl.createEl("span", { text: stat.value, cls: "nexus-tasks-stat-value" });
			if (stat.label) {
				statEl.createEl("span", { text: stat.label, cls: "nexus-tasks-stat-label" });
			}
		}

		// Progress bar with % label to the right
		if (showProgress) {
			const progressEl = taskEl.createDiv({ cls: "nexus-tasks-progress" });
			const track = progressEl.createDiv({ cls: "nexus-tasks-progress-track" });
			const fill = track.createDiv({ cls: "nexus-tasks-progress-fill" });
			fill.style.width = `${pct}%`;
			progressEl.createEl("span", { text: `${pct}%`, cls: "nexus-tasks-progress-pct" });
		}

		// Task list — grouped by file
		if (showList && openTasks.length > 0) {
			// Group by file path
			const grouped = new Map<string, { file: TFile; tasks: typeof openTasks }>();
			for (const task of openTasks) {
				const key = task.file.path;
			if (!grouped.has(key)) {
				grouped.set(key, { file: task.file, tasks: [] });
			}
			const group = grouped.get(key);
			if (group) group.tasks.push(task);
			}

			const listEl = taskEl.createDiv({ cls: "nexus-tasks-list" });
			let shownTasks = 0;

			for (const [, group] of grouped) {
				if (shownTasks >= maxList) break;

				const groupEl = listEl.createDiv({ cls: "nexus-tasks-group" });

				// File header
				const headerEl = groupEl.createDiv({ cls: "nexus-tasks-group-header" });
				const age = this.getRelativeTime(group.file.stat.mtime);
				headerEl.createEl("span", { text: group.file.basename, cls: "nexus-tasks-group-name" });
				headerEl.createEl("span", { text: `${group.tasks.length} task${group.tasks.length > 1 ? "s" : ""}`, cls: "nexus-tasks-group-count" });
				headerEl.createEl("span", { text: age, cls: "nexus-tasks-group-time" });
				headerEl.addEventListener("click", (e) => {
					e.preventDefault();
					this.plugin.app.workspace.openLinkText(group.file.path, "");
				});

				// Task items under this file
				const tasksToShow = group.tasks.slice(0, maxList - shownTasks);
				shownTasks += tasksToShow.length;

				for (const task of tasksToShow) {
					const itemEl = groupEl.createDiv({ cls: "nexus-tasks-item" });
					const textEl = itemEl.createDiv({ cls: "nexus-tasks-item-text" });
					textEl.textContent = task.text;

					// Click to open file at task line
					itemEl.addEventListener("click", (e) => {
						e.preventDefault();
						this.plugin.app.workspace.openLinkText(task.file.path, "", false, {
							line: task.line,
						});
					});
				}
			}

			// Remaining count
			const totalOpen = openTasks.length;
			if (shownTasks < totalOpen) {
				const moreEl = listEl.createDiv({ cls: "nexus-tasks-more" });
				moreEl.createEl("span", { text: `+${totalOpen - shownTasks} more` });
			}
		}
	}

	/** Get a relative time string for a given mtime */
	private getRelativeTime(mtime: number): string {
		const now = Date.now();
		const diff = now - mtime;
		const minutes = Math.floor(diff / 60000);
		const hours = Math.floor(diff / 3600000);
		const days = Math.floor(diff / 86400000);
		if (minutes < 1) return "just now";
		if (minutes < 60) return `${minutes}m ago`;
		if (hours < 24) return `${hours}h ago`;
		if (days < 7) return `${days}d ago`;
		return `${Math.floor(days / 7)}w ago`;
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
			} else if (block.kind === "column") {
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
		const preset =
			type && DIVIDER_PRESETS[type] ? DIVIDER_PRESETS[type] : this.plugin.settings.dividerDesign;
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
				item
					.setTitle("Open")
					.setIcon("file-text")
					.onClick(() => {
						const file = this.plugin.app.vault.getAbstractFileByPath(card.path);
						if (file instanceof TFile) {
							this.plugin.app.workspace.openLinkText(card.path, "", false);
						} else {
							new Notice(`File not found: ${card.path}`);
						}
					});
			});

			menu.addItem((item) => {
				item
					.setTitle("Copy path")
					.setIcon("copy")
					.onClick(() => {
						navigator.clipboard.writeText(card.path);
					});
			});

			if (!isMini) {
				menu.addSeparator();

				const mocs = this.plugin.settings.mocs;
				const mocIndex = mocs.findIndex((m) => m.path === card.path && m.title === card.label);

				if (mocIndex > 0) {
					menu.addItem((item) => {
						item
							.setTitle("Move up")
							.setIcon("arrow-up")
							.onClick(async () => {
								[mocs[mocIndex - 1], mocs[mocIndex]] = [mocs[mocIndex], mocs[mocIndex - 1]];
								await this.plugin.saveSettings();
								this.render();
							});
					});
				}

				if (mocIndex >= 0 && mocIndex < mocs.length - 1) {
					menu.addItem((item) => {
						item
							.setTitle("Move down")
							.setIcon("arrow-down")
							.onClick(async () => {
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
			? SMALL_ICONS[iconName] || SMALL_ICONS["MOC"] || DEFAULT_ICON
			: ICONS[iconName] || ICONS["MOC"] || DEFAULT_ICON;

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
			const val = safeParseInt(parts[i] || "0", undefined, 1);
			if (val !== undefined) {
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

	private setupColumnDrag(
		dividerEl: HTMLElement,
		rowEl: HTMLElement,
		_colWidths: string[],
		dividerIdx: number,
		rowIndex: number,
	): void {
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
			const availableWidth = rowWidth - numDividers * DIVIDER_WIDTH;

			let leftPct = ((startLeftWidth + dx) / availableWidth) * 100;
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
		return files.filter((file) => file.path.toLowerCase().startsWith(folderPath.toLowerCase() + "/"))
			.length;
	}
}
