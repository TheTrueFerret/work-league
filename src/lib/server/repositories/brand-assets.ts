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

/** The link-preview picture. Kept apart from the icons: it is redrawn on its own. */
export const SHARE_CARD = {
	key: 'share-card.jpg',
	contentType: 'image/jpeg',
	fallback: '/icons/share-card.jpg',
	maxBytes: 600_000
} as const;

/** Every file /brand/ serves, with the built-in one to fall back to. */
export const BRAND_FILES: Record<string, { fallback: string }> = {
	...BRAND_ASSETS,
	[SHARE_CARD.key]: SHARE_CARD
};

export async function getBrandAsset(key: string) {
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

export async function saveShareCard(bytes: Uint8Array): Promise<void> {
	const db = await getDb();
	const data = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	await db
		.insert(brandAssets)
		.values({ key: SHARE_CARD.key, contentType: SHARE_CARD.contentType, data })
		.onConflictDoUpdate({ target: brandAssets.key, set: { data, updatedAt: new Date() } });
}
