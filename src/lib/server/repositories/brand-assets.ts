import { eq, inArray } from 'drizzle-orm';
import { getDb } from '../db/client';
import { brandAssets } from '../db/schema';

/** The app icons the admin screen renders from an uploaded logo. */
export const BRAND_ASSETS = {
	'logo.png': { size: 256, fallback: '/icons/icon-192.png' },
	'icon-192.png': { size: 192, fallback: '/icons/icon-192.png' },
	'icon-512.png': { size: 512, fallback: '/icons/icon-512.png' },
	'icon-maskable-512.png': { size: 512, fallback: '/icons/icon-maskable-512.png' },
	'apple-touch-icon.png': { size: 180, fallback: '/icons/apple-touch-icon.png' }
} as const;

export type BrandAssetKey = keyof typeof BRAND_ASSETS;

export const isBrandAssetKey = (key: string): key is BrandAssetKey => key in BRAND_ASSETS;

/** Largest PNG accepted per icon. The browser resizes before uploading, so this is generous. */
export const MAX_ASSET_BYTES = 400_000;

export async function getBrandAsset(key: BrandAssetKey) {
	const db = await getDb();
	const [row] = await db.select().from(brandAssets).where(eq(brandAssets.key, key));
	return row ?? null;
}

export async function saveBrandAssets(
	assets: ReadonlyMap<BrandAssetKey, Uint8Array>
): Promise<void> {
	const db = await getDb();
	const writes = [...assets].map(([key, bytes]) => {
		const data = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
		return db
			.insert(brandAssets)
			.values({ key, contentType: 'image/png', data })
			.onConflictDoUpdate({ target: brandAssets.key, set: { data, updatedAt: new Date() } });
	});
	const [first, ...rest] = writes;
	// All icons change together or not at all.
	if (first) await db.batch([first, ...rest]);
}

export async function clearBrandAssets(): Promise<void> {
	const db = await getDb();
	await db.delete(brandAssets).where(inArray(brandAssets.key, Object.keys(BRAND_ASSETS)));
}
