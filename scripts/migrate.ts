// Applies every pending migration in ./drizzle to the libSQL database at
// DATABASE_URL (a local `file:` SQLite database, or `libsql://`). Run: npm run db:migrate
//
// Cloudflare D1 is migrated by Wrangler instead: npm run db:migrate:d1
//
// Deliberately imports nothing from src/, so it runs with plain Node — the
// Docker image uses it on start-up.
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import { migrate } from 'drizzle-orm/libsql/migrator';

const url = process.env.DATABASE_URL;
if (!url) {
	console.error('DATABASE_URL is not set. Copy .env.example to .env, or export it.');
	process.exit(1);
}
if (/^(postgres(ql)?|pglite):/.test(url)) {
	console.error(
		'Work League now stores its data in SQLite. Set DATABASE_URL=file:./.data/league.db and ' +
			'bring existing data across with `npm run import:postgres` (see README).'
	);
	process.exit(1);
}

const migrationsFolder = resolve(dirname(fileURLToPath(import.meta.url)), '../drizzle');

if (url.startsWith('file:')) {
	const path = url.slice('file:'.length).split('?')[0]!;
	if (path && path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
}

const client = createClient({ url });
await client.execute('PRAGMA foreign_keys = ON');
await migrate(drizzle(client), { migrationsFolder });
client.close();

console.log('Database is up to date.');
