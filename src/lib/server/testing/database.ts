import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { closeDatabase, configureDatabase, getDb } from '../db/client';

/**
 * A fresh SQLite database for a test, in its own temporary file, migrated with
 * the same SQL files production uses.
 */
export async function freshDatabase() {
	await closeDatabase();
	const folder = mkdtempSync(join(tmpdir(), 'work-league-test-'));
	configureDatabase(`file:${join(folder, 'league.db')}`);
	return getDb();
}
