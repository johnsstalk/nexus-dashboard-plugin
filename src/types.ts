export type DashboardBlock = DividerBlockConfig | SectionConfig | RecentlyConfig | RowConfig | StackConfig | LinksConfig;

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
	children: (SectionConfig | StackConfig)[];
}

export interface StackConfig {
	kind: "stack";
	spacing?: string;
	align?: "left" | "center" | "right" | "stretch";
	children: (SectionConfig | RowConfig)[];
}

export interface SearchConfig {
	show: boolean;
	default?: "vault" | "cards";
	placeholder?: string;
}

export interface RecentlyConfig {
	kind: "recently";
	show: boolean;
	count?: number;
	path?: string;
	tags?: string[];
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

export interface RowLayoutEntry {
	name: string;
	columns: number;
	proportion: string;
	align: "top" | "center" | "stretch";
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
	asciiMobileSize: number;
	asciiDefaultAlign: "left" | "center" | "right";
	showSearch: boolean;
	searchDefault: "vault" | "cards";
	recentPath: string;
	recentTags: string;
	quickLinks: QuickLinkEntry[];
	rowSizes: Record<string, string>;
	rowLayouts: RowLayoutEntry[];
}
