import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { sql } from 'drizzle-orm';
import { closeDatabase, configureDatabase, getDb } from '../db/client';

const DRIZZLE = resolve(import.meta.dirname, '../../../../drizzle');

/** The SQL statements of one migration file, as drizzle-kit splits them. */
export function migrationStatements(file: string): string[] {
	return readFileSync(resolve(DRIZZLE, file), 'utf8')
		.split('--> statement-breakpoint')
		.map((s) => s.trim())
		.filter(Boolean);
}

const MIGRATIONS = ['0000_init.sql', '0001_game_modules.sql'];

/**
 * A fresh in-memory Postgres (PGlite) for one test file, migrated by running
 * the same SQL files production uses. Pass `until` to stop before a migration.
 */
export async function freshDatabase(until?: string) {
	await closeDatabase();
	configureDatabase('pglite:memory?migrations=off');
	const db = await getDb();
	for (const file of MIGRATIONS) {
		if (file === until) break;
		for (const statement of migrationStatements(file)) await db.execute(sql.raw(statement));
	}
	return db;
}

export async function runMigration(file: string) {
	const db = await getDb();
	for (const statement of migrationStatements(file)) await db.execute(sql.raw(statement));
}
