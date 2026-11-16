import { error } from '@sveltejs/kit';
import type { GameModule } from '$lib/modules/types';

/** The module for a `[game]` route, or a 404 if it is not installed or switched off. */
export function enabledGame(locals: App.Locals, id: string): GameModule {
	const game = locals.games.find((g) => g.id === id);
	if (!game) error(404, 'That game is not part of this league');
	return game;
}
