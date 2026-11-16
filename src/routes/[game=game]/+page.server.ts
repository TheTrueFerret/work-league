import { enabledGame } from '$lib/server/games';
import { leaderboard, matchCount } from '$lib/server/repositories/matches';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params }) => {
	const game = enabledGame(locals, params.game);
	const [players, matches] = await Promise.all([leaderboard(game), matchCount(game.id)]);
	return { players, matches };
};
