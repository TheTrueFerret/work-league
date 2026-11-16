import { leaderboard, stats } from '$lib/modules/pool/server/repository';

export async function load() {
	const [players, totals] = await Promise.all([leaderboard(), stats()]);
	return { players, stats: totals };
}
