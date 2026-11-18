import { error } from '@sveltejs/kit';
import { requireAdmin } from '$lib/server/forms';
import { SHARE_CARD, saveShareCard } from '$lib/server/repositories/brand-assets';
import { loadSettings, saveSetting } from '$lib/server/repositories/settings';
import type { RequestHandler } from './$types';

const JPEG_SIGNATURE = [0xff, 0xd8, 0xff];

/**
 * Stores the link-preview card the admin screen drew. It sends the card
 * whenever the branding it shows has changed, so there is no button for it.
 */
export const POST: RequestHandler = async ({ request, locals }) => {
	requireAdmin(locals);
	const form = await request.formData();
	const card = form.get('card');
	const key = form.get('key');
	if (!(card instanceof Blob) || typeof key !== 'string') error(400, 'The share card is missing');
	if (card.size > SHARE_CARD.maxBytes) error(413, 'The share card is too large');
	const bytes = new Uint8Array(await card.arrayBuffer());
	if (!JPEG_SIGNATURE.every((b, i) => bytes[i] === b)) error(400, 'The share card must be a JPEG');

	await saveShareCard(bytes);
	const { branding } = await loadSettings({ fresh: true });
	await saveSetting('branding', { ...branding, shareCard: { key, version: Date.now() } });
	return new Response(null, { status: 204 });
};
