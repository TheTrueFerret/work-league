import { AsyncLocalStorage } from 'node:async_hooks';
import type { AnyD1Database, DrizzleD1Database } from 'drizzle-orm/d1';
import * as schema from './schema';

/**
 * One drizzle API over two SQLite drivers:
 *
 * - Cloudflare D1, through the `DB` binding, on Workers.
 * - libSQL everywhere else: `file:./path.db` for a local SQLite file (dev,
 *   tests, Docker, any Node host), or a `libsql://` URL for a hosted libSQL
 *   database such as Turso.
 *
 * Both are async and both support `db.batch()`, which is the only way to make
 * several writes atomic on D1: it has no interactive transactions. So code here
 * never calls `db.transaction()`; see repositories/matches.ts.
 */
export type Database = DrizzleD1Database<typeof schema>;

interface Connection {
	readonly db: Database;
	close(): void;
}

export class DatabaseNotConfiguredError extends Error {
	override readonly name = 'DatabaseNotConfiguredError';
	constructor(message?: string) {
		super(
			message ??
				'No database configured. On Cloudflare, give the Worker a D1 binding named DB ' +
					'(see wrangler.jsonc); elsewhere set DATABASE_URL, e.g. file:./.data/league.db.'
		);
	}
}

/** Work League 0.1 ran on PostgreSQL. Point anyone still configured for it at the importer. */
function rejectPostgres(url: string): void {
	if (/^(postgres(ql)?|pglite):/.test(url)) {
		throw new DatabaseNotConfiguredError(
			'Work League now stores its data in SQLite (Cloudflare D1, or a local file). ' +
				'Set DATABASE_URL=file:./.data/league.db, and move existing data across with ' +
				'`npm run import:postgres` (see README).'
		);
	}
}

const isLocalFile = (url: string) => url.startsWith('file:');

async function openLibsql(url: string): Promise<Connection> {
	rejectPostgres(url);
	const [{ createClient }, { drizzle }] = await Promise.all([
		import('@libsql/client'),
		import('drizzle-orm/libsql')
	]);
	if (isLocalFile(url)) await ensureFolder(url);
	const client = createClient({ url });
	// D1 always enforces foreign keys; plain SQLite only when asked.
	await client.execute('PRAGMA foreign_keys = ON');
	if (isLocalFile(url)) {
		// Another process may be writing (a seed script next to `npm run dev`).
		await client.execute('PRAGMA busy_timeout = 5000');
	}
	const db = drizzle(client, { schema });
	if (isLocalFile(url)) await migrateLocal(db);
	return { db: db as unknown as Database, close: () => client.close() };
}

async function ensureFolder(url: string): Promise<void> {
	const path = url.slice('file:'.length).split('?')[0]!;
	if (!path || path === ':memory:') return;
	const [{ mkdirSync }, { dirname }] = await Promise.all([import('node:fs'), import('node:path')]);
	mkdirSync(dirname(path), { recursive: true });
}

/**
 * A local SQLite file belongs to this one machine, so it is safe to bring its
 * schema up to date on open: `npm run dev`, tests and the Docker image need no
 * separate migrate step. D1 is migrated by `wrangler d1 migrations apply`.
 */
async function migrateLocal(
	db: Parameters<typeof import('drizzle-orm/libsql/migrator').migrate>[0]
): Promise<void> {
	const [{ existsSync }, { resolve }, { migrate }] = await Promise.all([
		import('node:fs'),
		import('node:path'),
		import('drizzle-orm/libsql/migrator')
	]);
	const migrationsFolder = resolve(process.cwd(), 'drizzle');
	if (existsSync(migrationsFolder)) await migrate(db, { migrationsFolder });
}

/** Wraps a Worker's D1 binding. Cheap, so it is done per request. */
export async function openD1(binding: unknown): Promise<Database> {
	const { drizzle } = await import('drizzle-orm/d1');
	return drizzle(binding as AnyD1Database, { schema });
}

/* -------------------------------------------------------------------------- */
/* Connection lifetime                                                         */
/* -------------------------------------------------------------------------- */

/** On Workers each request carries its own D1 binding; it is held here. */
const requestDb = new AsyncLocalStorage<Promise<Database>>();

let configuredUrl: string | undefined;
let shared: Promise<Connection> | undefined;

/**
 * Supplies the database URL from outside `process.env`, which is how
 * SvelteKit's `$env` delivers it. Safe to call on every request.
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
	return configuredUrl ?? globalThis.process?.env?.DATABASE_URL;
}

/** Runs `fn` against a Worker's D1 binding. */
export function withD1<T>(binding: unknown, fn: () => Promise<T>): Promise<T> {
	if (!binding) throw new DatabaseNotConfiguredError();
	return requestDb.run(openD1(binding), fn);
}

/**
 * The database for the current request. Connects on first use rather than on
 * import — `vite build` loads this file, and a build needs no database.
 */
export async function getDb(): Promise<Database> {
	const scoped = requestDb.getStore();
	if (scoped) return scoped;

	const url = databaseUrl();
	if (!url) throw new DatabaseNotConfiguredError();
	const opening = (shared ??= openLibsql(url));
	try {
		return (await opening).db;
	} catch (error) {
		// Let the next request try again rather than caching the failure.
		if (shared === opening) shared = undefined;
		throw error;
	}
}

/** Closes the shared connection so one-off scripts and tests can exit. */
export async function closeDatabase(): Promise<void> {
	const closing = shared;
	shared = undefined;
	configuredUrl = undefined;
	(await closing?.catch(() => undefined))?.close();
}
