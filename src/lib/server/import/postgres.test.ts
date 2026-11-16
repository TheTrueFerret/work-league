import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, describe, expect, it } from 'vitest';
import pool from '$lib/modules/pool';
import type { GameModule } from '$lib/modules/types';
import { closeDatabase } from '../db/client';
import { history, leaderboard, rebuildRatings, recordMatch } from '../repositories/matches';
import { clearSettingsCache, loadSettings } from '../repositories/settings';
import { freshDatabase } from '../testing/database';
import { planImport, sqlValue } from './postgres';

const game = pool as GameModule;

afterAll(closeDatabase);

/** Runs one of the old PostgreSQL migrations, kept here as fixtures. */
async function migrate(pg: PGlite, fixture: string) {
	const text = readFileSync(resolve(import.meta.dirname, 'fixtures', fixture), 'utf8');
	for (const statement of text.split('--> statement-breakpoint')) {
		if (statement.trim()) await pg.exec(statement);
	}
}

/** A pool ladder with three people and two matches, as Open Pottr stored it. */
async function pottrLeague(): Promise<PGlite> {
	const pg = new PGlite();
	await migrate(pg, 'pottr.pg.sql');
	await pg.exec(`
		insert into players (id, name) values (1, 'Ada'), (2, 'Linus'), (3, 'Grace');
		insert into matches (id, played_at, note) values
			(1, '2026-01-01T10:00:00Z', null), (2, '2026-01-02T10:00:00Z', 'it''s a rematch');
		insert into participants (match_id, player_id, team, won, rating_before, delta) values
			(1, 1, 'A', true, 1000, 20), (1, 2, 'B', false, 1000, -20),
			(2, 2, 'A', true, 980, 22), (2, 3, 'A', true, 1000, 21), (2, 1, 'B', false, 1020, -22);
		insert into standings (player_id, rating, games, wins, losses, peak, streak, form) values
			(1, 998, 2, 1, 1, 1020, -1, 'WL'), (2, 1002, 2, 1, 1, 1002, 1, 'LW'), (3, 1021, 1, 1, 0, 1021, 1, 'W');
		select setval('players_id_seq', 3); select setval('matches_id_seq', 2);`);
	return pg;
}

async function importInto(pg: PGlite) {
	const plan = await planImport(async (text) => (await pg.query(text)).rows as never);
	await pg.close();
	const db = await freshDatabase();
	clearSettingsCache();
	for (const statement of plan.statements) await db.run(statement);
	return plan;
}

const expectOriginalLadder = async () => {
	const board = await leaderboard(game);
	expect(board.map((p) => [p.name, p.rating, p.games])).toEqual([
		['Grace', 1021, 1],
		['Linus', 1002, 2],
		['Ada', 998, 2]
	]);
	const [latest] = await history(game);
	expect(latest!.note).toBe("it's a rematch");
	expect(latest!.sides.map((s) => s.placement)).toEqual([1, 2]);
	expect(latest!.sides[0]!.players.map((p) => p.name)).toEqual(['Grace', 'Linus']);

	// The original ratings came from the same formula, so a replay agrees.
	await rebuildRatings(game);
	expect((await leaderboard(game)).map((p) => [p.name, p.rating])).toEqual(
		board.map((p) => [p.name, p.rating])
	);

	// And new results can be recorded on top, after the imported ids.
	const id = await recordMatch(game, { sides: [[1], [3]], details: { winner: 0 } });
	expect(id).toBe(3);
	expect((await leaderboard(game)).find((p) => p.name === 'Ada')!.games).toBe(3);
};

describe('importing from PostgreSQL', () => {
	it('moves an original pool ladder across with every match and rating', async () => {
		const plan = await importInto(await pottrLeague());
		expect(plan.source).toBe('pottr');
		expect(plan.counts).toEqual({ players: 3, matches: 2, ratings: 3, settings: 0 });
		await expectOriginalLadder();
	});

	it('moves a Work League 0.1 database across, settings included', async () => {
		const pg = await pottrLeague();
		await migrate(pg, 'work-league-0.1.pg.sql');
		await pg.exec(`
			insert into settings (key, value) values
				('branding', '{"name": "Pool Sharks", "seed": "#3dcd58", "logoVersion": 4}'),
				('access', '{"publicRead": true}')`);
		const plan = await importInto(pg);
		expect(plan.source).toBe('work-league-0.1');
		await expectOriginalLadder();

		const settings = await loadSettings();
		expect(settings.branding).toMatchObject({ name: 'Pool Sharks', logoVersion: null });
		expect(settings.access.publicRead).toBe(true);
	});

	it('refuses to import into a league that already has people', async () => {
		const plan = await importInto(await pottrLeague());
		const db = await freshDatabase();
		for (const statement of plan.statements) await db.run(statement);
		await expect(db.run(plan.statements[0]!)).rejects.toMatchObject({
			cause: expect.objectContaining({ message: expect.stringContaining('NOT NULL') })
		});
	});

	it('writes safe SQL literals', () => {
		expect(sqlValue("O'Brien")).toBe("'O''Brien'");
		expect(sqlValue(true)).toBe('1');
		expect(sqlValue(null)).toBe('NULL');
		expect(sqlValue(new Date(5))).toBe('5');
		expect(sqlValue({ winner: 1 })).toBe('\'{"winner":1}\'');
	});
});
