import { error, redirect } from '@sveltejs/kit';
import { BRAND_ASSETS, getBrandAsset, isBrandAssetKey } from '$lib/server/repositories/brand-assets';
import type { RequestHandler } from './$types';

/** The uploaded logo and icons, or the built-in Work League ones when none is set. */
export const GET: RequestHandler = async ({ params, url }) => {
	if (!isBrandAssetKey(params.asset)) error(404, 'No such image');
	const asset = await getBrandAsset(params.asset);
	if (!asset) redirect(302, BRAND_ASSETS[params.asset].fallback);

	// Pages link these with ?v=<upload time>, so a versioned URL never changes.
	const versioned = url.searchParams.has('v');
	return new Response(asset.data as BodyInit, {
		headers: {
			'content-type': asset.contentType,
			'cache-control': versioned ? 'public, max-age=31536000, immutable' : 'public, max-age=300',
			'x-content-type-options': 'nosniff'
		}
	});
};
