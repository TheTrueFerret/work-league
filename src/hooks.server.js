import { env } from '$env/dynamic/private';
import { useDatabaseEnv, withConnection } from '$lib/server/db.js';

/**
 * Cloudflare Workers have no `process.env` — the variable and the secret arrive
 * with the request — and a socket opened in one request may not be touched by
 * the next. So on Cloudflare every request gets its own connection; under Node
 * the pool is shared and only the configuration needs handing over.
 * @type {import('@sveltejs/kit').Handle}
 */
export function handle({ event, resolve }) {
	const platform = event.platform;
	const config = {
		DATABASE_URL: env.DATABASE_URL ?? platform?.env?.DATABASE_URL,
		DATABASE_PASSWORD: env.DATABASE_PASSWORD ?? platform?.env?.DATABASE_PASSWORD
	};

	if (!platform?.env) {
		useDatabaseEnv(config);
		return resolve(event);
	}

	return withConnection(config, () => resolve(event), (p) => platform.context?.waitUntil?.(p));
}

/**
 * The one failure worth explaining: a Worker deployed before its database
 * credentials were set. Everything else stays a generic message.
 * @type {import('@sveltejs/kit').HandleServerError}
 */
export function handleError({ error }) {
	const message = /** @type {Error} */ (error)?.message ?? '';
	if (message.startsWith('DATABASE_URL') || message.startsWith('DATABASE_PASSWORD')) {
		console.error(message);
		return { message: 'This Pottr has no database yet. ' + message };
	}
	console.error(error);
	return { message: 'Something went wrong' };
}
