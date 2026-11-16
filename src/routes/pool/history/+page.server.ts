import { fail } from '@sveltejs/kit';
import { deleteMatch, history } from '$lib/modules/pool/server/repository';

export async function load() {
	return { matches: await history(150) };
}

export const actions = {
	delete: async ({ request }) => {
		const id = Number((await request.formData()).get('id'));
		if (!Number.isInteger(id)) return fail(400, { error: 'Unknown match' });

		await deleteMatch(id);
		return { deleted: true };
	}
};
