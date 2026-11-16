import { error } from '@sveltejs/kit';
import { playerProfile } from '$lib/modules/pool/server/repository';

export async function load({ params }) {
	const profile = await playerProfile(Number(params.id));
	if (!profile) error(404, 'No such player');
	return profile;
}
