import { redirect } from '@sveltejs/kit';
import * as v from 'valibot';
import { UserError } from '$lib/core/errors';
import { installedModules } from '$lib/modules/registry';
import { hashSecret } from '$lib/server/auth/crypto';
import { ADMIN_COOKIE } from '$lib/server/auth/session';
import { attempt, formFlag, readForm, requireAdmin } from '$lib/server/forms';
import {
	BRAND_ASSETS,
	clearBrandAssets,
	isBrandAssetKey,
	MAX_ASSET_BYTES,
	saveBrandAssets,
	type BrandAssetKey
} from '$lib/server/repositories/brand-assets';
import { loadSettings, saveSetting } from '$lib/server/repositories/settings';
import { isHexColour } from '$lib/theme/palette';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals }) => {
	const { settings } = locals;
	return {
		settings: {
			branding: settings.branding,
			disabled: settings.modules.disabled,
			passphraseSet: settings.access.passphraseHash !== null,
			publicRead: settings.access.publicRead
		},
		installed: installedModules.map((m) => m.id),
		assetSizes: Object.fromEntries(Object.entries(BRAND_ASSETS).map(([k, a]) => [k, a.size]))
	};
};

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function decodePng(dataUrl: string): Uint8Array {
	const prefix = 'data:image/png;base64,';
	if (!dataUrl.startsWith(prefix)) throw new UserError('The logo must be converted to PNG first');
	const binary = atob(dataUrl.slice(prefix.length));
	const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
	if (bytes.length > MAX_ASSET_BYTES) throw new UserError('That logo is too large');
	if (!PNG_SIGNATURE.every((b, i) => bytes[i] === b))
		throw new UserError('That is not a PNG image');
	return bytes;
}

/** Every admin action re-checks, even though the hook already guards /admin. */
const adminAction =
	<T>(fn: (event: Parameters<Actions[string]>[0]) => Promise<T>) =>
	async (event: Parameters<Actions[string]>[0]) => {
		requireAdmin(event.locals);
		return attempt(() => fn(event));
	};

export const actions: Actions = {
	branding: adminAction(async ({ request, locals }) => {
		const form = await readForm(
			request,
			v.object({
				name: v.pipe(
					v.string(),
					v.trim(),
					v.minLength(1, 'Give the league a name'),
					v.maxLength(40, 'Keep the name under 40 characters')
				),
				tagline: v.pipe(
					v.string(),
					v.trim(),
					v.maxLength(80, 'Keep the tagline under 80 characters')
				),
				seed: v.pipe(v.string(), v.trim(), v.check(isHexColour, 'Pick a colour like #3dcd58'))
			})
		);
		await saveSetting('branding', {
			...locals.settings.branding,
			...form,
			seed: form.seed.toLowerCase()
		});
		return { saved: 'branding' };
	}),

	logo: adminAction(async ({ request }) => {
		const form = await request.formData();
		const assets = new Map<BrandAssetKey, Uint8Array>();
		for (const key of Object.keys(BRAND_ASSETS)) {
			const value = form.get(key);
			if (typeof value !== 'string' || !isBrandAssetKey(key))
				throw new UserError('The logo upload was incomplete');
			assets.set(key, decodePng(value));
		}
		await saveBrandAssets(assets);
		const current = await loadSettings();
		await saveSetting('branding', { ...current.branding, logoVersion: Date.now() });
		return { saved: 'logo' };
	}),

	removeLogo: adminAction(async ({ locals }) => {
		await clearBrandAssets();
		await saveSetting('branding', { ...locals.settings.branding, logoVersion: null });
		return { saved: 'logo' };
	}),

	games: adminAction(async ({ request }) => {
		const form = await request.formData();
		const enabled = new Set(form.getAll('enabled').map(String));
		const disabled = installedModules.map((m) => m.id).filter((id) => !enabled.has(id));
		await saveSetting('modules', { disabled });
		return { saved: 'games' };
	}),

	passphrase: adminAction(async ({ request, locals }) => {
		const { passphrase } = await readForm(
			request,
			v.object({
				passphrase: v.pipe(v.string(), v.trim(), v.minLength(6, 'Use at least 6 characters'))
			})
		);
		const { access } = locals.settings;
		await saveSetting('access', {
			...access,
			passphraseHash: await hashSecret(passphrase),
			// Everyone signed in with the old passphrase has to enter the new one.
			passphraseVersion: access.passphraseVersion + 1
		});
		return { saved: 'passphrase' };
	}),

	removePassphrase: adminAction(async ({ locals }) => {
		const { access } = locals.settings;
		await saveSetting('access', {
			...access,
			passphraseHash: null,
			passphraseVersion: access.passphraseVersion + 1
		});
		return { saved: 'passphrase' };
	}),

	publicRead: adminAction(async ({ request, locals }) => {
		const { publicRead } = await readForm(request, v.object({ publicRead: formFlag }));
		await saveSetting('access', { ...locals.settings.access, publicRead });
		return { saved: 'access' };
	}),

	logout: async ({ cookies }) => {
		cookies.delete(ADMIN_COOKIE, { path: '/' });
		redirect(303, '/');
	}
};
