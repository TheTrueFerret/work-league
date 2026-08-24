import { env } from '$env/dynamic/private';
import { useDatabaseUrl, withConnection } from '$lib/server/db.js';

/**
 * Cloudflare Workers have no `process.env` — secrets arrive with the request —
 * and a socket opened in one request may not be touched by the next. So on
 * Cloudflare every request gets its own connection; under Node the pool is
 * shared and only the URL needs handing over.
 * @type {import('@sveltejs/kit').Handle}
 */
export function handle({ event, resolve }) {
	const platform = event.platform;
	const url = env.DATABASE_URL ?? platform?.env?.DATABASE_URL;

	if (!platform?.env) {
		useDatabaseUrl(url);
		return resolve(event);
	}

	return withConnection(url, () => resolve(event), (p) => platform.context?.waitUntil?.(p));
}

/**
 * The one failure worth explaining: a Worker deployed before its database
 * secret was set. Everything else stays a generic message.
 * @type {import('@sveltejs/kit').HandleServerError}
 */
export function handleError({ error }) {
	const message = /** @type {Error} */ (error)?.message ?? '';
	if (message.startsWith('DATABASE_URL is not set')) {
		console.error(message);
		return { message: 'This Pottr has no database yet. Set the DATABASE_URL secret.' };
	}
	console.error(error);
	return { message: 'Something went wrong' };
}
