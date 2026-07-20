export type DashboardBlock = DividerBlockConfig | SectionConfig | RecentlyConfig | RowConfig | LinksConfig | TabsConfig;

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
	columns: 1 | 2 | 3 | 4;
	cards: CardConfig[];
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
	align?: "top" | "center" | "stretch";
	children: DashboardBlock[];
}

export interface TabItem {
	id: string;
	label: string;
	blocks: DashboardBlock[];
}

export interface TabsConfig {
	kind: "tabs";
	items: TabItem[];
	active?: number;
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
