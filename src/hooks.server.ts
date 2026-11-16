import { env } from '$env/dynamic/private';
import { useDatabaseUrl, withConnection } from '$lib/modules/pool/server/repository';
import type { Handle, HandleServerError } from '@sveltejs/kit';

/**
 * Cloudflare Workers have no `process.env` — secrets arrive with the request —
 * and a socket opened in one request may not be touched by the next. So on
 * Cloudflare every request gets its own connection; under Node the pool is
 * shared and only the URL needs handing over.
 * @type {import('@sveltejs/kit').Handle}
 */
export const handle: Handle = ({ event, resolve }) => {
	const platform = event.platform;
	const url = env.DATABASE_URL ?? platform?.env?.DATABASE_URL;
	const needsDatabase =
		event.url.pathname === '/pool' ||
		event.url.pathname.startsWith('/pool/') ||
		event.url.pathname === '/players' ||
		event.url.pathname.startsWith('/players/');

	// The module launcher is core UI and should still load before a database is configured.
	if (!needsDatabase) return resolve(event);

	if (!platform?.env) {
		useDatabaseUrl(url);
		return resolve(event);
	}

	return withConnection(url, () => resolve(event), (p) => platform.context?.waitUntil?.(p));
};

/**
 * The one failure worth explaining: a Worker deployed before its database
 * secret was set. Everything else stays a generic message.
 * @type {import('@sveltejs/kit').HandleServerError}
 */
export const handleError: HandleServerError = ({ error }) => {
	const message = error instanceof Error ? error.message : '';
	if (message.startsWith('DATABASE_URL is not set')) {
		console.error(message);
		return { message: 'This Work League has no database yet. Set the DATABASE_URL secret.' };
	}
	console.error(error);
	return { message: 'Something went wrong' };
};
