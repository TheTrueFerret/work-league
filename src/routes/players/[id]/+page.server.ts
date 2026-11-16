import { error } from '@sveltejs/kit';
import { getPlayer } from '$lib/server/repositories/players';
import { playerGameProfile, standingsFor } from '$lib/server/repositories/matches';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params, url }) => {
	const id = Number(params.id);
	const player = Number.isInteger(id) ? await getPlayer(id) : null;
	if (!player) error(404, 'No such player');

	const standings = (await standingsFor(id)).filter((s) => locals.games.some((g) => g.id === s.moduleId));
	// Show the requested game, else the one they have played most, else the first.
	const requested = locals.games.find((g) => g.id === url.searchParams.get('game'));
	const mostPlayed = [...standings].sort((a, b) => b.games - a.games)[0];
	const game =
		requested ?? locals.games.find((g) => g.id === mostPlayed?.moduleId) ?? locals.games[0];

	return {
		player,
		standings,
		gameId: game?.id ?? null,
		profile: game ? await playerGameProfile(game, id) : null
	};
};
