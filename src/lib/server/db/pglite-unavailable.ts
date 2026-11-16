/**
 * Stands in for PGlite in Cloudflare builds (see vite.config.ts): the embedded
 * database needs a filesystem and WebAssembly loading that Workers lack, and
 * leaving it out keeps the Worker small.
 */
const unavailable = (): never => {
	throw new Error(
		'pglite: database URLs only work under Node. On Cloudflare, set DATABASE_URL to a postgres:// URL.'
	);
};

export class PGlite {
	constructor() {
		unavailable();
	}
}

export const drizzle = unavailable;
