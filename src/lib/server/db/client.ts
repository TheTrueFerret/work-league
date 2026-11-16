import { AsyncLocalStorage } from 'node:async_hooks';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import * as schema from './schema';

/**
 * One drizzle API over two drivers:
 *
 * - `postgres://…` — any real PostgreSQL (Supabase, Neon, Docker, …) through postgres.js.
 * - `pglite:./path` or `pglite:memory` — an embedded Postgres in the Node process.
 *   Zero setup for local development, tests and tiny self-hosted installs.
 *   It cannot run on Cloudflare Workers.
 */
export type Database = PgDatabase<PgQueryResultHKT, typeof schema>;

interface Connection {
	readonly db: Database;
	close(): Promise<void>;
}

const MISSING_URL =
	'DATABASE_URL is not set. On Cloudflare run `npx wrangler secret put DATABASE_URL`; ' +
	'locally, copy .env.example to .env.';

export class DatabaseNotConfiguredError extends Error {
	override readonly name = 'DatabaseNotConfiguredError';
	constructor() {
		super(MISSING_URL);
	}
}

export const isPglite = (url: string): boolean => url.startsWith('pglite:');

async function open(url: string, maxConnections: number): Promise<Connection> {
	if (isPglite(url)) return openPglite(url);

	const [{ default: postgres }, { drizzle }] = await Promise.all([
		import('postgres'),
		import('drizzle-orm/postgres-js')
	]);
	const client = postgres(url, {
		// Transaction poolers (Supabase, PgBouncer) cannot reuse prepared statements.
		prepare: false,
		// Skip the type-OID lookup on connect; every column here is a built-in.
		fetch_types: false,
		max: maxConnections,
		connect_timeout: 10
	});
	return {
		db: drizzle(client, { schema }) as unknown as Database,
		close: () => client.end({ timeout: 5 })
	};
}

/**
 * PGlite locks its data directory, so there must only ever be one per path —
 * even when Vite reloads this file during development. Kept on globalThis for that.
 */
const embedded = ((
	globalThis as { __workLeaguePglite?: Map<string, Promise<Connection>> }
).__workLeaguePglite ??= new Map());

function openPglite(url: string): Promise<Connection> {
	const existing = embedded.get(url);
	if (existing) return existing;

	const connecting = (async () => {
		const [{ PGlite }, { drizzle }] = await Promise.all([
			import('@electric-sql/pglite'),
			import('drizzle-orm/pglite')
		]);
		// `pglite:<path>[?migrations=off]`; tests turn migrations off to build old schemas by hand.
		const [path = '', query = ''] = url.slice('pglite:'.length).split('?');
		const client = path === 'memory' || path === '' ? new PGlite() : new PGlite(path);
		await client.waitReady;
		const db = drizzle(client, { schema });
		if (!new URLSearchParams(query).has('migrations', 'off')) await migrateEmbedded(db);
		return {
			db: db as unknown as Database,
			close: async () => {
				embedded.delete(url);
				await client.close();
			}
		};
	})();
	embedded.set(url, connecting);
	return connecting;
}

/**
 * An embedded database belongs to this one process, so it is safe to bring
 * its schema up to date on open: `npm run dev`, tests and the single-container
 * Docker image need no separate migrate step. Shared PostgreSQL servers are
 * migrated explicitly with `npm run db:migrate` instead.
 */
async function migrateEmbedded(
	db: Parameters<typeof import('drizzle-orm/pglite/migrator').migrate>[0]
) {
	const [{ existsSync }, { resolve }, { migrate }] = await Promise.all([
		import('node:fs'),
		import('node:path'),
		import('drizzle-orm/pglite/migrator')
	]);
	const migrationsFolder = resolve(process.cwd(), 'drizzle');
	if (existsSync(migrationsFolder)) await migrate(db, { migrationsFolder });
}

/* -------------------------------------------------------------------------- */
/* Connection lifetime                                                         */
/* -------------------------------------------------------------------------- */

interface RequestScope {
	readonly url: string;
	connection?: Promise<Connection>;
}

/**
 * Cloudflare Workers forbid reusing a socket across requests ("Cannot perform
 * I/O on behalf of a different request"), so there every request gets its own
 * connection, held here. Under Node one long-lived pool is better.
 */
const requestScope = new AsyncLocalStorage<RequestScope>();

let configuredUrl: string | undefined;
let shared: Promise<Connection> | undefined;

/**
 * Supplies the connection string from outside `process.env`, which is how
 * Cloudflare and SvelteKit's `$env` deliver it. Safe to call on every request.
 */
export function configureDatabase(url: string | undefined): void {
	if (url && url !== configuredUrl) {
		configuredUrl = url;
		const previous = shared;
		shared = undefined;
		void previous?.then((c) => c.close()).catch(() => {});
	}
}

export function databaseUrl(): string | undefined {
	return requestScope.getStore()?.url ?? configuredUrl ?? globalThis.process?.env?.DATABASE_URL;
}

/**
 * Runs `fn` with a connection of its own, closed once it is done. Used on
 * Cloudflare, where a socket may not outlive the request that opened it.
 */
export async function withRequestConnection<T>(
	url: string | undefined,
	fn: () => Promise<T>,
	waitUntil?: (promise: Promise<unknown>) => void
): Promise<T> {
	if (!url) throw new DatabaseNotConfiguredError();
	const scope: RequestScope = { url };
	try {
		return await requestScope.run(scope, fn);
	} finally {
		// The response body may still be streaming, so never block on this.
		const closing = scope.connection?.then((c) => c.close());
		if (closing) {
			if (waitUntil) waitUntil(closing);
			else closing.catch(() => {});
		}
	}
}

/**
 * The database for the current request. Connects on first use rather than on
 * import — `vite build` loads this file, and a build needs no credentials.
 */
export async function getDb(): Promise<Database> {
	const scope = requestScope.getStore();
	if (scope) {
		scope.connection ??= open(scope.url, 1);
		return (await scope.connection).db;
	}

	const url = databaseUrl();
	if (!url) throw new DatabaseNotConfiguredError();
	shared ??= open(url, 5);
	return (await shared).db;
}

/** Closes the shared connection so one-off scripts and tests can exit. */
export async function closeDatabase(): Promise<void> {
	const closing = shared;
	shared = undefined;
	configuredUrl = undefined;
	await (await closing)?.close();
}
