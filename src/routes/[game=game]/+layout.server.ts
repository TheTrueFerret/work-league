import { enabledGame } from '$lib/server/games';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = ({ locals, params }) => {
	enabledGame(locals, params.game);
	return {};
};
