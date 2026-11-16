import { redirect } from '@sveltejs/kit';
import * as v from 'valibot';
import { cookieOptions, guardedCheck, safeNext } from '$lib/server/auth/sign-in';
import { verifySecret } from '$lib/server/auth/crypto';
import { MEMBER_COOKIE, MEMBER_MAX_AGE, signToken } from '$lib/server/auth/session';
import { attempt, readForm } from '$lib/server/forms';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals, url }) => {
	const next = safeNext(url.searchParams.get('next'));
	if (locals.member) redirect(303, next);
	return { next, publicRead: locals.settings.access.publicRead };
};

export const actions: Actions = {
	default: async (event) => {
		const { locals, url } = event;
		const result = await attempt(async () => {
			const { passphrase } = await readForm(event.request, v.object({ passphrase: v.string() }));
			const stored = locals.settings.access.passphraseHash;
			await guardedCheck(
				event,
				'member',
				async () => !!stored && (await verifySecret(passphrase.trim(), stored))
			);
			const token = await signToken(locals.secret, {
				kind: 'member',
				version: locals.settings.access.passphraseVersion,
				issuedAt: Date.now()
			});
			event.cookies.set(MEMBER_COOKIE, token, cookieOptions(event, MEMBER_MAX_AGE));
			return true;
		});
		if (result !== true) return result;
		redirect(303, safeNext(url.searchParams.get('next')));
	}
};
