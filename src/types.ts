export interface DashboardConfig {
	header: HeaderConfig;
	toolbar: boolean;
	greeting: boolean;
	stats: StatsConfig;
	sections: SectionConfig[];
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

export interface SectionConfig {
	title: string;
	divider: boolean;
	columns: 2 | 3 | 4;
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

export type LayoutPreset = "2col" | "3col" | "compact" | "wide";

export const LAYOUT_PRESETS: Record<LayoutPreset, { mocGridColumns: number; miniGridColumns: number; label: string }> = {
	"2col": { mocGridColumns: 2, miniGridColumns: 3, label: "2-column" },
	"3col": { mocGridColumns: 3, miniGridColumns: 3, label: "3-column" },
	compact: { mocGridColumns: 2, miniGridColumns: 4, label: "Compact" },
	wide: { mocGridColumns: 3, miniGridColumns: 4, label: "Wide" },
};
