import type { RequestEvent } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';

/** Server configuration from the environment. Everything else lives in the database. */
export interface ServerEnv {
	readonly databaseUrl: string | undefined;
	/** Unlocks /admin. Admin features are off until it is set. */
	readonly adminPassword: string | undefined;
	/** Optional; a random one is generated and stored on first run. */
	readonly sessionSecret: string | undefined;
}

/**
 * Node and `vite dev` read `process.env` (via SvelteKit's `$env`); Cloudflare
 * hands secrets to each request on `platform.env`. Either source works.
 */
export function readEnv(event: Pick<RequestEvent, 'platform'>): ServerEnv {
	const platform = event.platform?.env;
	const pick = (name: 'DATABASE_URL' | 'ADMIN_PASSWORD' | 'SESSION_SECRET') =>
		(env[name] || platform?.[name] || undefined) as string | undefined;
	return {
		databaseUrl: pick('DATABASE_URL'),
		adminPassword: pick('ADMIN_PASSWORD'),
		sessionSecret: pick('SESSION_SECRET')
	};
}
