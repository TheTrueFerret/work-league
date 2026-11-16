import { loadChampionship } from '$lib/server/championship';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => ({
	table: await loadChampionship(locals)
});
