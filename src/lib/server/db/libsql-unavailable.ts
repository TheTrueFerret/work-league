/**
 * Stands in for libSQL in Cloudflare builds (see vite.config.ts): Workers use
 * the D1 binding instead, and leaving the native driver out keeps the Worker small.
 */
const unavailable = (): never => {
	throw new Error(
		'DATABASE_URL only works under Node. On Cloudflare, Work League uses the D1 binding DB.'
	);
};

export const createClient = unavailable;

export const drizzle = unavailable;

export const migrate = unavailable;
