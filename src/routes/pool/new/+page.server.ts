import { fail, redirect } from '@sveltejs/kit';
import { activePlayers, recordMatch } from '$lib/modules/pool/server/repository';

export async function load() {
	return { players: await activePlayers() };
}

/** @param {FormDataEntryValue | null} raw */
const ids = (raw) =>
	String(raw ?? '')
		.split(',')
		.filter(Boolean)
		.map(Number)
		.filter(Number.isInteger);

export const actions = {
	default: async ({ request }) => {
		const form = await request.formData();
		const teamA = ids(form.get('teamA'));
		const teamB = ids(form.get('teamB'));
		const winner = form.get('winner') === 'B' ? 'B' : 'A';
		const note = String(form.get('note') ?? '');

		try {
			await recordMatch(teamA, teamB, winner, note);
		} catch (err) {
			return fail(400, { error: /** @type {Error} */ (err).message });
		}
		redirect(303, '/pool?recorded=1');
	}
};
