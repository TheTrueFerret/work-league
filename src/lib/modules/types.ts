export type ModuleIcon = 'target' | 'ball' | 'table';

export interface LeagueModule {
	id: string;
	name: string;
	description: string;
	href: string;
	/** Extra route prefixes owned by this module, such as shared entity screens. */
	routePrefixes?: readonly string[];
	icon: ModuleIcon;
	accent: string;
	navigation: readonly ModuleNavigationItem[];
}

export interface ModuleNavigationItem {
	href: string;
	label: string;
	icon: string;
}
