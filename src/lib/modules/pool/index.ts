import type { LeagueModule } from '../types';

export const poolModule = {
	id: 'pool',
	name: 'Pool ladder',
	description: 'Record team matches, track form and settle the office pool ranking.',
	href: '/pool',
	routePrefixes: ['/players'],
	icon: 'ball',
	accent: '#3dcd58',
	navigation: [
		{ href: '/pool', label: 'Ranks', icon: 'M4 20V10m6 10V4m6 16v-7' },
		{ href: '/pool/new', label: 'Play', icon: 'M12 5v14M5 12h14' },
		{ href: '/pool/history', label: 'History', icon: 'M12 8v4l3 2M3 12a9 9 0 1 0 2-5.6M3 4v3h3' },
		{ href: '/players', label: 'People', icon: 'M16 20v-1a4 4 0 0 0-8 0v1M12 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7' }
	]
} as const satisfies LeagueModule;

export { computeDeltas, expectedScore, kFactor, START_RATING, teamWinChance, tier } from './rating';
