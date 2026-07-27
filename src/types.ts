export type DashboardBlock = DividerBlockConfig | SectionConfig | RecentlyConfig | VaultListConfig | VaultActivityConfig | RowConfig | ColumnConfig | LinksConfig | StatsBlockConfig | SearchBlockConfig | HeadingBlockConfig | HeatmapConfig | TimelineConfig | ClockConfig | FileTypeChartConfig;

export type ContentSlotType = "stats" | "search" | "heading" | "moc-cards" | "quick-links" | "vault-activity" | "divider" | "heatmap" | "timeline" | "clock" | "filetypes" | "none";

export interface DashboardConfig {
	header: HeaderConfig;
	stats: StatsConfig;
	blocks: DashboardBlock[];
	recently: boolean | RecentlyConfig;
	graph: GraphConfig;
	search?: SearchConfig;
}

export interface HeaderConfig {
	text: string;
	font: string;
	color: string;
	size: number;
	mobileSize?: number;
	enabled: boolean;
	align?: "left" | "center" | "right";
}

export interface StatsConfig {
	enabled: boolean;
	items: StatItem[];
}

export interface StatItem {
	label: string;
	folder: string;
}

export interface DividerBlockConfig {
	kind: "divider";
	title: string;
	type?: string;
}

export interface SectionConfig {
	kind: "section";
	columns: number;
	cards: CardConfig[];
	divider?: DividerBlockConfig;
}

export interface CardConfig {
	type: "big" | "mini";
	label: string;
	desc?: string;
	path: string;
	icon: string;
}

export interface GraphConfig {
	enabled: boolean;
	exclude: string[];
}

export interface LinkItem {
	url: string;
	label?: string;
	icon?: string;
	desc?: string;
}

export interface LinksConfig {
	kind: "links";
	title?: string;
	columns?: number;
	items: LinkItem[];
}

export interface RowConfig {
	kind: "row";
	columns?: number;
	proportion?: string;
	gap?: string;
	align?: "top" | "center" | "stretch";
	children: (SectionConfig | ColumnConfig | StatsBlockConfig | SearchBlockConfig | HeadingBlockConfig | VaultListConfig | VaultActivityConfig | LinksConfig | HeatmapConfig | TimelineConfig | ClockConfig | FileTypeChartConfig)[];
}

export interface ColumnConfig {
	kind: "column";
	spacing?: string;
	align?: "left" | "center" | "right" | "stretch";
	children: (SectionConfig | RowConfig | StatsBlockConfig | SearchBlockConfig | HeadingBlockConfig | VaultListConfig | VaultActivityConfig | LinksConfig | HeatmapConfig | TimelineConfig | ClockConfig | FileTypeChartConfig)[];
}

export interface SearchConfig {
	show: boolean;
	default?: "vault" | "cards";
	placeholder?: string;
}

export interface StatsBlockConfig {
	kind: "stats";
	config: StatsConfig;
}

export interface SearchBlockConfig {
	kind: "search";
	config: SearchConfig;
}

export interface HeadingConfig {
	text: string;
	color?: string;
	align?: "left" | "center" | "right";
	size?: "small" | "medium" | "large";
}

export interface HeadingBlockConfig {
	kind: "heading";
	config: HeadingConfig;
}

export interface RecentlyConfig {
	kind: "recently";
	show: boolean;
	count?: number;
	path?: string;
	tags?: string[];
}

export interface VaultListConfig {
	kind: "vaultlist";
	show: boolean;
	count?: number;
	path?: string;
	tags?: string[];
	showDivider?: boolean;
}

export interface VaultActivityConfig {
	kind: "vault-activity";
	show: boolean;
	count?: number;
	path?: string;
	tags?: string[];
	label?: string;
}

export interface HeatmapConfig {
	kind: "heatmap";
	show: boolean;
	weeks?: number;
	label?: string;
}

export interface TimelineConfig {
	kind: "timeline";
	show: boolean;
	count?: number;
	label?: string;
	exclude?: string[];
}

export interface ClockConfig {
	kind: "clock";
	show: boolean;
	timezone?: string;
	showDate?: boolean;
	showSeconds?: boolean;
	format?: "12h" | "24h";
	label?: string;
}

export interface FileTypeChartConfig {
	kind: "filetypes";
	show: boolean;
	max?: number;
	label?: string;
}

// ── Settings interfaces ───────────────────────────────────────

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

export interface VaultListEntry {
	name: string;
	path: string;
	tags: string;
	count: number;
	showDivider: boolean;
}

export interface RowLayoutEntry {
	name: string;
	columns: number;
	proportion: string;
	align: "top" | "center" | "stretch";
	slots: (ContentSlotType | ContentSlotType[])[];
	slotHeadings?: Record<string, HeadingConfig>;
	vaultListSlots?: Record<string, string>;
	dividerSlots?: Record<string, string>;
}

export interface ColumnLayoutEntry {
	name: string;
	spacing: string;
	align: "left" | "center" | "right" | "stretch";
	slots: ContentSlotType[];
	vaultListSlots?: Record<string, string>;
	dividerSlots?: Record<string, string>;
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
	showGraph: boolean;
	excludeFolders: string[];
	mocGridColumns: number;
	miniGridColumns: number;
	dividerDesign: DividerDesign;
	asciiDefaultFont: string;
	asciiDefaultColor: string;
	asciiDefaultSize: number;
	asciiMobileSize: number;
	asciiDefaultAlign: "left" | "center" | "right";
	showSearch: boolean;
	searchDefault: "vault" | "cards";
	quickLinks: QuickLinkEntry[];
	rowSizes: Record<string, string>;
	rowLayouts: RowLayoutEntry[];
	columnLayouts: ColumnLayoutEntry[];
	vaultLists: VaultListEntry[];
	showQuickLinksDivider: boolean;
	quickLinksDividerLabel: string;
	showHeader: boolean;
	showMocCards: boolean;
	showMocDivider: boolean;
	mocDividerLabel: string;
	showQuickLinks: boolean;
	showHeatmap: boolean;
	heatmapWeeks: number;
	heatmapLabel: string;
	showActivityTimeline: boolean;
	activityTimelineCount: number;
	activityTimelineLabel: string;
	showClock: boolean;
	clockTimezone: string;
	clockShowDate: boolean;
	clockShowSeconds: boolean;
	clockFormat: "12h" | "24h";
	clockLabel: string;
	showFileTypeChart: boolean;
	fileTypeChartMax: number;
	fileTypeChartLabel: string;
	showVaultActivity: boolean;
	vaultActivityCount: number;
	vaultActivityPath: string;
	vaultActivityTags: string;
	vaultActivityLabel: string;
}
