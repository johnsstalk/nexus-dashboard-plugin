/**
 * Union of all dashboard block types that can appear in the layout.
 */
export type DashboardBlock = DividerBlockConfig | SectionConfig | RecentlyConfig | VaultListConfig | VaultActivityConfig | RowConfig | ColumnConfig | LinksConfig | StatsBlockConfig | SearchBlockConfig | HeadingBlockConfig | HeatmapConfig | TimelineConfig | ClockConfig | FileTypeChartConfig;

/**
 * Valid identifiers for named content slots used in row and column layouts.
 */
export type ContentSlotType = "stats" | "search" | "heading" | "moc-cards" | "quick-links" | "vault-activity" | "divider" | "heatmap" | "timeline" | "clock" | "filetypes" | "none";

/** Root configuration object for the entire dashboard layout. */
export interface DashboardConfig {
	header: HeaderConfig;
	stats: StatsConfig;
	/** Ordered list of blocks rendered top-to-bottom on the dashboard. */
	blocks: DashboardBlock[];
	/**
	 * When `true`, the recently-opened section uses default settings.
	 * When a `RecentlyConfig`, customizes the recently-opened section.
	 */
	recently: boolean | RecentlyConfig;
	graph: GraphConfig;
	search?: SearchConfig;
}

/** Configuration for the dashboard title header rendered at the top of the view. */
export interface HeaderConfig {
	text: string;
	/** CSS font-family string applied to the header text. */
	font: string;
	color: string;
	/** Font size in pixels for desktop view. */
	size: number;
	/** Optional override font size in pixels for mobile view. */
	mobileSize?: number;
	enabled: boolean;
	align?: "left" | "center" | "right";
}

/** Configuration for the statistics counter section displayed at the top of the dashboard. */
export interface StatsConfig {
	enabled: boolean;
	/** List of folder-based stat counters to display. */
	items: StatItem[];
}

/** A single stat counter that counts notes in the given vault folder. */
export interface StatItem {
	label: string;
	/** Vault-relative folder path to count notes in (e.g. "Daily Notes"). */
	folder: string;
}

/**
 * A visual divider/separator block with an optional title label.
 * @remarks Renders as a horizontal rule with a centered title.
 */
export interface DividerBlockConfig {
	kind: "divider";
	/** Title text displayed in the center of the divider line. */
	title: string;
	/** Optional CSS class or style variant for the divider. */
	type?: string;
}

/** A grid section containing multiple cards arranged in columns. */
export interface SectionConfig {
	kind: "section";
	/** Number of card columns to render in this section. */
	columns: number;
	cards: CardConfig[];
	/** Optional divider rendered above or below this section. */
	divider?: DividerBlockConfig;
}

/** A single clickable card linking to a vault path. */
export interface CardConfig {
	/** `"big"` renders a large card; `"mini"` renders a compact card. */
	type: "big" | "mini";
	/** Primary label text shown on the card. */
	label: string;
	/** Optional secondary description text displayed below the label. */
	desc?: string;
	/** Vault-relative file or folder path opened when the card is clicked. */
	path: string;
	/** Icon identifier or emoji displayed on the card. */
	icon: string;
}

/** Configuration for the local graph view embedded on the dashboard. */
export interface GraphConfig {
	enabled: boolean;
	/** Vault-relative folder paths to exclude from the graph. */
	exclude: string[];
}

/** A single external or internal link with optional icon and description. */
export interface LinkItem {
	/** URL to navigate to when the link is clicked. */
	url: string;
	/** Display text for the link. Falls back to the URL if omitted. */
	label?: string;
	/** Icon identifier or emoji shown beside the link label. */
	icon?: string;
	/** Optional short description shown below the link. */
	desc?: string;
}

/** A quick-links block displaying a grid of clickable link items. */
export interface LinksConfig {
	kind: "links";
	/** Section title displayed above the links grid. */
	title?: string;
	/** Number of columns in the links grid. */
	columns?: number;
	items: LinkItem[];
}

/**
 * A horizontal row layout that arranges child blocks side-by-side.
 * @remarks Children are laid out left-to-right; use `proportion` with
 * CSS grid fractions (e.g. `"1fr 2fr"`) to control relative widths.
 */
export interface RowConfig {
	kind: "row";
	/** Number of columns in the grid. If omitted, inferred from children count. */
	columns?: number;
	/**
	 * CSS grid-template-columns value controlling child widths
	 * (e.g. `"1fr 1fr"` or `"2fr 1fr"`).
	 */
	proportion?: string;
	/** CSS gap value between children (e.g. `"1rem"`). */
	gap?: string;
	/** Vertical alignment of children within the row. */
	align?: "top" | "center" | "stretch";
	/**
	 * Ordered child blocks rendered left-to-right inside this row.
	 * @remarks Cannot contain nested `RowConfig` — use `ColumnConfig` for nesting.
	 */
	children: (SectionConfig | ColumnConfig | StatsBlockConfig | SearchBlockConfig | HeadingBlockConfig | VaultListConfig | VaultActivityConfig | LinksConfig | HeatmapConfig | TimelineConfig | ClockConfig | FileTypeChartConfig)[];
}

/**
 * A vertical column layout that arranges child blocks top-to-bottom.
 * @remarks Columns can be nested inside rows to form two-dimensional layouts.
 */
export interface ColumnConfig {
	kind: "column";
	/** CSS gap value between children (e.g. `"0.5rem"`). */
	spacing?: string;
	/** Horizontal alignment of children within the column. */
	align?: "left" | "center" | "right" | "stretch";
	/**
	 * Ordered child blocks rendered top-to-bottom inside this column.
	 */
	children: (SectionConfig | RowConfig | StatsBlockConfig | SearchBlockConfig | HeadingBlockConfig | VaultListConfig | VaultActivityConfig | LinksConfig | HeatmapConfig | TimelineConfig | ClockConfig | FileTypeChartConfig)[];
}

/** Configuration for the search bar widget. */
export interface SearchConfig {
	/** Whether the search bar is visible on the dashboard. */
	show: boolean;
	/** Default search mode when the dashboard loads. */
	default?: "vault" | "cards";
	/** Placeholder text shown in the search input. */
	placeholder?: string;
}

/** A standalone stats counter block that can be placed anywhere in the layout. */
export interface StatsBlockConfig {
	kind: "stats";
	config: StatsConfig;
}

/** A standalone search bar block that can be placed anywhere in the layout. */
export interface SearchBlockConfig {
	kind: "search";
	config: SearchConfig;
}

/** Styling configuration for heading text. */
export interface HeadingConfig {
	text: string;
	/** CSS color value for the heading text. */
	color?: string;
	align?: "left" | "center" | "right";
	/** Predefined size preset rather than a raw pixel value. */
	size?: "small" | "medium" | "large";
}

/** A heading text block that can be placed anywhere in the layout. */
export interface HeadingBlockConfig {
	kind: "heading";
	config: HeadingConfig;
}

/**
 * Configuration for the recently-opened files section.
 * @remarks Displays a list of vault files opened most recently,
 * optionally filtered by path prefix and/or tags.
 */
export interface RecentlyConfig {
	kind: "recently";
	/** Whether this section is rendered on the dashboard. */
	show: boolean;
	/** Maximum number of recently-opened items to display. */
	count?: number;
	/** Vault-relative path prefix to filter results (e.g. "Notes"). */
	path?: string;
	/** Only include files that contain at least one of these tags. */
	tags?: string[];
}

/**
 * Configuration for the vault file-list section.
 * @remarks Similar to `RecentlyConfig` but shows a curated or
 * filtered list of vault files with optional divider styling.
 */
export interface VaultListConfig {
	kind: "vaultlist";
	show: boolean;
	count?: number;
	path?: string;
	tags?: string[];
	/** When `true`, renders a divider below this list. */
	showDivider?: boolean;
}

/**
 * Configuration for the vault-activity section.
 * @remarks Displays recent file activity (creates, edits, renames)
 * across the vault, filtered by path and/or tags.
 */
export interface VaultActivityConfig {
	kind: "vault-activity";
	show: boolean;
	count?: number;
	/** Vault-relative path prefix to scope activity tracking. */
	path?: string;
	/** Comma-separated tag filter applied to activity entries. */
	tags?: string[];
	/** Custom heading label displayed above the activity list. */
	label?: string;
}

/** Configuration for the contribution-style heatmap calendar. */
export interface HeatmapConfig {
	kind: "heatmap";
	show: boolean;
	/** Number of weeks to display in the heatmap grid. */
	weeks?: number;
	/** Custom heading label displayed above the heatmap. */
	label?: string;
}

/** Configuration for the activity timeline section. */
export interface TimelineConfig {
	kind: "timeline";
	show: boolean;
	/** Maximum number of timeline entries to display. */
	count?: number;
	/** Custom heading label displayed above the timeline. */
	label?: string;
	/** File extensions to exclude from timeline entries (e.g. `[".png", ".jpg"]`). */
	exclude?: string[];
}

/** Configuration for the live clock widget. */
export interface ClockConfig {
	kind: "clock";
	show: boolean;
	/** IANA timezone identifier (e.g. "America/New_York"). Defaults to system timezone. */
	timezone?: string;
	/** Whether to display the current date alongside the time. */
	showDate?: boolean;
	/** Whether to display seconds in the time readout. */
	showSeconds?: boolean;
	/** Time display format. `"12h"` uses AM/PM; `"24h"` uses 24-hour notation. */
	format?: "12h" | "24h";
	/** Custom heading label displayed above the clock. */
	label?: string;
}

/** Configuration for the file-type distribution chart. */
export interface FileTypeChartConfig {
	kind: "filetypes";
	show: boolean;
	/** Maximum number of file types to display in the chart. */
	max?: number;
	/** Custom heading label displayed above the chart. */
	label?: string;
}

// ── Settings interfaces ───────────────────────────────────────

/** A single map-of-content (MOC) card entry linking to a note. */
export interface MocEntry {
	/** Vault-relative path to the MOC note. */
	path: string;
	/** Display title for the card. */
	title: string;
	/** Short description shown below the title. */
	desc: string;
	/** Icon identifier or emoji displayed on the card. */
	icon: string;
}

/** A single quick-link entry displayed in the quick-links grid. */
export interface QuickLinkEntry {
	/** Display text for the link. */
	label: string;
	/** URL to open when the link is clicked. */
	url: string;
	/** Icon identifier or emoji shown beside the link. */
	icon: string;
}

/** A vault-list entry representing a filterable collection of vault notes. */
export interface VaultListEntry {
	/** Display name for this vault list section. */
	name: string;
	/** Vault-relative path prefix used to filter notes. */
	path: string;
	/** Comma-separated list of tags used to filter notes. */
	tags: string;
	/** Maximum number of notes to show in this list. */
	count: number;
	/** Whether to render a divider below this list section. */
	showDivider: boolean;
}

/**
 * A named row layout template used in the dashboard builder.
 * @remarks `slots` define which content types appear in each column;
 * `slotHeadings`, `vaultListSlots`, and `dividerSlots` provide
 * per-slot overrides keyed by slot identifier.
 */
export interface RowLayoutEntry {
	/** User-facing name for this layout in the settings UI. */
	name: string;
	columns: number;
	/** CSS grid-template-columns value controlling column widths. */
	proportion: string;
	align: "top" | "center" | "stretch";
	/**
	 * Content slot assignments for each column.
	 * A nested array places multiple slots inside a single column.
	 */
	slots: (ContentSlotType | ContentSlotType[])[];
	/** Per-slot heading overrides keyed by slot identifier. */
	slotHeadings?: Record<string, HeadingConfig>;
	/** Maps slot identifiers to vault-list names for vault-list slots. */
	vaultListSlots?: Record<string, string>;
	/** Maps slot identifiers to divider label overrides for divider slots. */
	dividerSlots?: Record<string, string>;
}

/**
 * A named column layout template used in the dashboard builder.
 * @remarks Children are stacked vertically within the column.
 * Per-slot overrides follow the same keying convention as `RowLayoutEntry`.
 */
export interface ColumnLayoutEntry {
	/** User-facing name for this layout in the settings UI. */
	name: string;
	/** CSS gap value between children (e.g. `"0.5rem"`). */
	spacing: string;
	align: "left" | "center" | "right" | "stretch";
	/** Ordered content slot assignments rendered top-to-bottom. */
	slots: ContentSlotType[];
	/** Maps slot identifiers to vault-list names for vault-list slots. */
	vaultListSlots?: Record<string, string>;
	/** Maps slot identifiers to divider label overrides for divider slots. */
	dividerSlots?: Record<string, string>;
}

/** A single stat-counter entry shown in the dashboard header area. */
export interface StatEntry {
	/** Vault-relative folder path to count notes in. */
	folder: string;
	/** Display label next to the count (e.g. "Notes", "Projects"). */
	label: string;
}

/** Visual styling configuration for divider lines rendered across the dashboard. */
export interface DividerDesign {
	/** CSS background gradient value for the divider line. */
	gradient: string;
	/** CSS height/thickness of the divider line (e.g. `"2px"`). */
	lineWidth: string;
	/** CSS font-size for the divider label text. */
	labelSize: string;
	/** CSS font-weight for the divider label text. */
	labelWeight: string;
	/** CSS color for the divider label text. */
	labelColor: string;
	/** CSS margin/spacing around the divider label. */
	labelSpacing: string;
}

/**
 * Master settings object persisted by the Obsidian plugin.
 * @remarks This is the primary data structure stored in the plugin's
 * `data.json` file. Every field maps 1-to-1 with a settings UI control.
 */
export interface NexusSettings {
	/** Text displayed in the ASCII-art header at the top of the dashboard. */
	headerText: string;
	/** When `true`, the dashboard opens automatically on Obsidian startup. */
	openOnStartup: boolean;
	/** Map-of-content card entries displayed on the dashboard. */
	mocs: MocEntry[];
	/** Stat-counter entries displayed in the header area. */
	stats: StatEntry[];
	/** Whether the stats counter section is visible. */
	showStats: boolean;
	/** Whether the local graph view is visible. */
	showGraph: boolean;
	/** Vault-relative folder paths excluded from the graph and stats. */
	excludeFolders: string[];
	/** Number of grid columns for large MOC cards. */
	mocGridColumns: number;
	/** Number of grid columns for mini MOC cards. */
	miniGridColumns: number;
	/** Visual styling applied to all divider lines. */
	dividerDesign: DividerDesign;
	/** CSS font-family string for the ASCII header text. */
	asciiDefaultFont: string;
	/** CSS color value for the ASCII header text. */
	asciiDefaultColor: string;
	/** Font size in pixels for the ASCII header on desktop. */
	asciiDefaultSize: number;
	/** Font size in pixels for the ASCII header on mobile. */
	asciiMobileSize: number;
	/** Horizontal alignment of the ASCII header text. */
	asciiDefaultAlign: "left" | "center" | "right";
	/** Whether the search bar is visible on the dashboard. */
	showSearch: boolean;
	/** Default search mode when the dashboard loads. */
	searchDefault: "vault" | "cards";
	/** Quick-link entries displayed in the quick-links grid. */
	quickLinks: QuickLinkEntry[];
	/**
	 * CSS grid-template-columns overrides for named row layouts,
	 * keyed by layout name.
	 */
	rowSizes: Record<string, string>;
	/** Row layout templates available in the dashboard builder. */
	rowLayouts: RowLayoutEntry[];
	/** Column layout templates available in the dashboard builder. */
	columnLayouts: ColumnLayoutEntry[];
	/** Vault file-list entries displayed on the dashboard. */
	vaultLists: VaultListEntry[];
	/** Whether a divider is shown below the quick-links section. */
	showQuickLinksDivider: boolean;
	/** Label text for the divider below the quick-links section. */
	quickLinksDividerLabel: string;
	/** Whether the dashboard header is visible. */
	showHeader: boolean;
	/** Whether the MOC cards section is visible. */
	showMocCards: boolean;
	/** Whether a divider is shown above the MOC cards section. */
	showMocDivider: boolean;
	/** Label text for the divider above the MOC cards section. */
	mocDividerLabel: string;
	/** Whether the quick-links grid is visible. */
	showQuickLinks: boolean;
	/** Whether the heatmap calendar is visible. */
	showHeatmap: boolean;
	/** Number of weeks to display in the heatmap. */
	heatmapWeeks: number;
	/** Custom heading label for the heatmap section. */
	heatmapLabel: string;
	/** Whether the activity timeline is visible. */
	showActivityTimeline: boolean;
	/** Maximum number of entries in the activity timeline. */
	activityTimelineCount: number;
	/** Custom heading label for the activity timeline. */
	activityTimelineLabel: string;
	/** Whether the live clock widget is visible. */
	showClock: boolean;
	/** IANA timezone identifier for the clock (e.g. "UTC", "Europe/London"). */
	clockTimezone: string;
	/** Whether the clock displays the current date. */
	clockShowDate: boolean;
	/** Whether the clock displays seconds. */
	clockShowSeconds: boolean;
	/** Time format for the clock. `"12h"` uses AM/PM; `"24h"` uses 24-hour notation. */
	clockFormat: "12h" | "24h";
	/** Custom heading label for the clock widget. */
	clockLabel: string;
	/** Whether the file-type distribution chart is visible. */
	showFileTypeChart: boolean;
	/** Maximum number of file types shown in the chart. */
	fileTypeChartMax: number;
	/** Custom heading label for the file-type chart. */
	fileTypeChartLabel: string;
	/** Whether the vault-activity section is visible. */
	showVaultActivity: boolean;
	/** Maximum number of entries in the vault-activity list. */
	vaultActivityCount: number;
	/** Vault-relative path prefix to scope vault-activity tracking. */
	vaultActivityPath: string;
	/** Comma-separated tags used to filter vault-activity entries. */
	vaultActivityTags: string;
	/** Custom heading label for the vault-activity section. */
	vaultActivityLabel: string;
}
