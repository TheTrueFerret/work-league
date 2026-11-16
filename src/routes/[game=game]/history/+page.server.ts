import * as v from 'valibot';
import { attempt, formId, readForm, requireAdmin } from '$lib/server/forms';
import { enabledGame } from '$lib/server/games';
import { findModule } from '$lib/modules/registry';
import { deleteMatch, history } from '$lib/server/repositories/matches';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params }) => {
	const game = enabledGame(locals, params.game);
	return { matches: await history(game) };
};

export const actions: Actions = {
	delete: async ({ locals, request }) => {
		requireAdmin(locals);
		return attempt(async () => {
			const { id } = await readForm(request, v.object({ id: formId }));
			await deleteMatch(id, findModule);
			return { deleted: id };
		});
	}
};
