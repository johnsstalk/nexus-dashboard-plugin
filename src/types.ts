export interface DashboardConfig {
	header: HeaderConfig;
	stats: StatsConfig;
	blocks: (DividerBlockConfig | SectionConfig)[];
	recently: boolean;
	graph: GraphConfig;
}

export interface HeaderConfig {
	text: string;
	font: string;
	color: string;
	size: "normal" | "small";
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
	color?: string;
}

export interface GraphConfig {
	enabled: boolean;
	exclude: string[];
}


