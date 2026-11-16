// Applies every pending migration in ./drizzle. Run: npm run db:migrate
//
// Works with a real PostgreSQL URL or an embedded `pglite:./path` database.
// Deliberately imports nothing from src/, so it runs with plain Node — the
// Docker image uses it on start-up.
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const url = process.env.DATABASE_URL;
if (!url) {
	console.error('DATABASE_URL is not set. Copy .env.example to .env, or export it.');
	process.exit(1);
}

const migrationsFolder = resolve(dirname(fileURLToPath(import.meta.url)), '../drizzle');

if (url.startsWith('pglite:')) {
	const path = url.slice('pglite:'.length);
	const { PGlite } = await import('@electric-sql/pglite');
	const { drizzle } = await import('drizzle-orm/pglite');
	const { migrate } = await import('drizzle-orm/pglite/migrator');
	if (path && path !== 'memory') mkdirSync(path, { recursive: true });
	const client = path && path !== 'memory' ? new PGlite(path) : new PGlite();
	await migrate(drizzle(client), { migrationsFolder });
	await client.close();
} else {
	const { default: postgres } = await import('postgres');
	const { drizzle } = await import('drizzle-orm/postgres-js');
	const { migrate } = await import('drizzle-orm/postgres-js/migrator');
	const client = postgres(url, { max: 1, prepare: false, onnotice: () => {} });
	await migrate(drizzle(client), { migrationsFolder });
	await client.end();
}

console.log('Database is up to date.');
