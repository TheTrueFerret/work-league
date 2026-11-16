import { loadChampionship } from '$lib/server/championship';
import { leaderboard, matchCounts } from '$lib/server/repositories/matches';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const [counts, table, boards] = await Promise.all([
		matchCounts(),
		loadChampionship(locals),
		Promise.all(locals.games.map((g) => leaderboard(g)))
	]);
	return {
		games: locals.games.map((g, i) => {
			const leader = boards[i]?.find((p) => p.games > 0);
			return {
				id: g.id,
				matches: counts.get(g.id) ?? 0,
				leader: leader ? { id: leader.id, name: leader.name, rating: leader.rating } : null
			};
		}),
		podium: table.filter((e) => e.games > 0).slice(0, 3),
		people: table.length
	};
};
