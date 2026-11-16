import { fail } from '@sveltejs/kit';
import { addPlayer, deletePlayer, leaderboard, renamePlayer, setPlayerActive } from '$lib/modules/pool/server/repository';

export async function load() {
	return { players: await leaderboard() };
}

/**
 * Wraps an action so thrown validation errors become a 400 with a message.
 * @param {(form: FormData) => Promise<unknown>} fn
 * @returns {import('./$types').Action}
 */
const guard = (fn) => async (event) => {
	const form = await event.request.formData();
	try {
		await fn(form);
		return { ok: true };
	} catch (err) {
		return fail(400, { error: /** @type {Error} */ (err).message });
	}
};

export const actions = {
	add: guard((form) => addPlayer(String(form.get('name') ?? ''))),

	rename: guard((form) => renamePlayer(Number(form.get('id')), String(form.get('name') ?? ''))),

	archive: guard((form) => setPlayerActive(Number(form.get('id')), form.get('active') === '1')),

	delete: guard((form) => deletePlayer(Number(form.get('id'))))
};
