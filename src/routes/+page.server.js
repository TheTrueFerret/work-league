import { leaderboard, stats } from '$lib/server/db.js';

export async function load() {
	const [players, totals] = await Promise.all([leaderboard(), stats()]);
	return { players, stats: totals };
}
