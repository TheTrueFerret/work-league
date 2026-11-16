import * as v from 'valibot';
import { attempt, formId, formText, readForm, requireAdmin } from '$lib/server/forms';
import {
	addPlayer,
	deletePlayer,
	listPlayers,
	MAX_NAME_LENGTH,
	renamePlayer,
	setPlayerActive
} from '$lib/server/repositories/players';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async () => ({ players: await listPlayers() });

const name = formText(MAX_NAME_LENGTH + 20);

export const actions: Actions = {
	/** Only admins manage who is in the league, so nobody can grief the board. */
	add: async ({ locals, request }) => {
		requireAdmin(locals);
		return attempt(async () => {
			const form = await readForm(request, v.object({ name }));
			await addPlayer(form.name);
			return { added: true };
		});
	},

	rename: async ({ locals, request }) => {
		requireAdmin(locals);
		return attempt(async () => {
			const form = await readForm(request, v.object({ id: formId, name }));
			await renamePlayer(form.id, form.name);
			return { renamed: true };
		});
	},

	archive: async ({ locals, request }) => {
		requireAdmin(locals);
		return attempt(async () => {
			const form = await readForm(
				request,
				v.object({ id: formId, active: v.picklist(['0', '1']) })
			);
			await setPlayerActive(form.id, form.active === '1');
			return { archived: true };
		});
	},

	delete: async ({ locals, request }) => {
		requireAdmin(locals);
		return attempt(async () => {
			const form = await readForm(request, v.object({ id: formId }));
			await deletePlayer(form.id);
			return { deleted: true };
		});
	}
};
