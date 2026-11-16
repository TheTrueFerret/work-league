import { redirect } from '@sveltejs/kit';
import * as v from 'valibot';
import { cookieOptions, guardedCheck, safeNext } from '$lib/server/auth/sign-in';
import { ADMIN_COOKIE, ADMIN_MAX_AGE, matchesAdminPassword, signToken } from '$lib/server/auth/session';
import { attempt, readForm } from '$lib/server/forms';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals, url }) => {
	if (locals.admin) redirect(303, safeNext(url.searchParams.get('next'), '/admin'));
	return { configured: Boolean(locals.env.adminPassword) };
};

export const actions: Actions = {
	default: async (event) => {
		const { locals, url } = event;
		const configured = locals.env.adminPassword;
		const result = await attempt(async () => {
			const { password } = await readForm(event.request, v.object({ password: v.string() }));
			await guardedCheck(event, 'admin', async () =>
				configured ? matchesAdminPassword(locals.secret, password, configured) : false
			);
			const token = await signToken(locals.secret, { kind: 'admin', version: 0, issuedAt: Date.now() });
			event.cookies.set(ADMIN_COOKIE, token, cookieOptions(event, ADMIN_MAX_AGE));
			return true;
		});
		if (result !== true) return result;
		redirect(303, safeNext(url.searchParams.get('next'), '/admin'));
	}
};
