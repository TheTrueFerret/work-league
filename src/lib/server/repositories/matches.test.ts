import { sql } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { UserError } from '$lib/core/errors';
import pool from '$lib/modules/pool';
import type { GameModule } from '$lib/modules/types';
import { closeDatabase } from '../db/client';
import { freshDatabase, runMigration } from '../testing/database';
import {
	deleteMatch,
	history,
	leaderboard,
	playerGameProfile,
	rebuildRatings,
	recordMatch,
	standingsFor
} from './matches';
import { addPlayer, deletePlayer, setPlayerActive } from './players';

const game = pool as GameModule;
const find = (id: string) => (id === 'pool' ? game : undefined);
const win = (a: number[], b: number[], winner: 0 | 1 = 0) =>
	recordMatch(game, { sides: [a, b], details: { winner } });

afterAll(closeDatabase);

describe('recording matches', () => {
	let ada: number, linus: number, grace: number, ken: number;

	beforeEach(async () => {
		await freshDatabase();
		[ada, linus, grace, ken] = [
			await addPlayer('Ada'),
			await addPlayer('Linus'),
			await addPlayer('Grace'),
			await addPlayer('Ken')
		];
	});

	it('rates a match and updates the leaderboard', async () => {
		await win([ada], [linus]);
		const board = await leaderboard(game);
		expect(board[0]).toMatchObject({
			name: 'Ada',
			rating: 1020,
			games: 1,
			wins: 1,
			form: 'W',
			streak: 1
		});
		expect(board[1]).toMatchObject({
			name: 'Linus',
			rating: 980,
			losses: 1,
			form: 'L',
			streak: -1
		});
		// Players who have not played are listed after the rated ones.
		expect(board.slice(2).every((p) => p.games === 0 && p.rating === 1000)).toBe(true);
	});

	it('rejects impossible submissions with a readable message', async () => {
		await expect(
			recordMatch(game, { sides: [[ada], [ada]], details: { winner: 0 } })
		).rejects.toThrow(UserError);
		await expect(recordMatch(game, { sides: [[ada], []], details: { winner: 0 } })).rejects.toThrow(
			UserError
		);
		await expect(
			recordMatch(game, { sides: [[ada], [linus]], details: { winner: 2 } })
		).rejects.toThrow(UserError);
		await expect(recordMatch(game, { sides: [[ada], [linus]], details: {} })).rejects.toThrow(
			'Pick the winning side'
		);
		await expect(
			recordMatch(game, { sides: [[ada], [999]], details: { winner: 0 } })
		).rejects.toThrow('Unknown player');
		await setPlayerActive(ken, false);
		await expect(win([ada], [ken])).rejects.toThrow('Archived');
	});

	it('replays later ratings when an old match is deleted', async () => {
		const first = await win([ada], [linus]);
		await win([ada, grace], [linus, ken], 1);
		await win([grace], [ken]);
		const before = await leaderboard(game);

		await deleteMatch(first, find);
		const after = await leaderboard(game);
		expect(after.find((p) => p.id === ada)!.games).toBe(1);
		expect(after).not.toEqual(before);

		// Replaying from scratch gives the same answer as the incremental path.
		await rebuildRatings(game);
		expect(await leaderboard(game)).toEqual(after);
	});

	it('keeps incremental and replayed ratings identical over many matches', async () => {
		const ids = [ada, linus, grace, ken];
		for (let i = 0; i < 25; i++) {
			const a = ids[i % 4]!;
			const b = ids[(i + 1 + (i % 3)) % 4]!;
			if (a !== b) await win([a], [b], (i % 3 === 0 ? 1 : 0) as 0 | 1);
		}
		const incremental = await leaderboard(game);
		await rebuildRatings(game);
		expect(await leaderboard(game)).toEqual(incremental);
	});

	it('builds history and profiles', async () => {
		await win([ada], [linus]);
		await win([ada], [linus], 1);
		const [latest] = await history(game);
		expect(latest!.sides[0]!.players[0]!.name).toBe('Linus');
		expect(latest!.sides[0]!.placement).toBe(1);

		const profile = await playerGameProfile(game, ada);
		expect(profile.curve).toHaveLength(3);
		expect(profile.rivals).toEqual([{ id: linus, name: 'Linus', wins: 1, losses: 1 }]);
		expect((await standingsFor(ada))[0]).toMatchObject({ moduleId: 'pool', games: 2 });
	});

	it('only deletes players without matches', async () => {
		await win([ada], [linus]);
		await expect(deletePlayer(ada)).rejects.toThrow(UserError);
		await deletePlayer(ken);
		expect((await leaderboard(game)).some((p) => p.id === ken)).toBe(false);
	});
});

describe('upgrading an original pool ladder database', () => {
	it('keeps every match and rating', async () => {
		const db = await freshDatabase('0001_game_modules.sql');
		await db.execute(
			sql`insert into players (id, name) values (1, 'Ada'), (2, 'Linus'), (3, 'Grace')`
		);
		await db.execute(
			sql`insert into matches (id, played_at) values (1, '2026-01-01'), (2, '2026-01-02')`
		);
		await db.execute(sql`
			insert into participants (match_id, player_id, team, won, rating_before, delta) values
			(1, 1, 'A', true, 1000, 20), (1, 2, 'B', false, 1000, -20),
			(2, 2, 'A', true, 980, 22), (2, 3, 'A', true, 1000, 21), (2, 1, 'B', false, 1020, -22)`);
		await db.execute(sql`
			insert into standings (player_id, rating, games, wins, losses, peak, streak, form) values
			(1, 998, 2, 1, 1, 1020, -1, 'WL'), (2, 1002, 2, 1, 1, 1002, 1, 'LW'), (3, 1021, 1, 1, 0, 1021, 1, 'W')`);

		// The fixture used explicit ids; move the sequences past them as real inserts would.
		await db.execute(sql`select setval('players_id_seq', 3), setval('matches_id_seq', 2)`);

		await runMigration('0001_game_modules.sql');

		const board = await leaderboard(game);
		expect(board.map((p) => [p.name, p.rating, p.games])).toEqual([
			['Grace', 1021, 1],
			['Linus', 1002, 2],
			['Ada', 998, 2]
		]);
		const [latest] = await history(game);
		expect(latest!.sides.map((s) => s.placement)).toEqual([1, 2]);
		expect(latest!.sides[0]!.players.map((p) => p.name)).toEqual(['Grace', 'Linus']);

		// The original ratings came from the same formula, so a replay agrees.
		await rebuildRatings(game);
		expect((await leaderboard(game)).map((p) => [p.name, p.rating])).toEqual(
			board.map((p) => [p.name, p.rating])
		);

		// And new results can be recorded on top.
		await recordMatch(game, { sides: [[1], [3]], details: { winner: 0 } });
		expect((await leaderboard(game)).find((p) => p.name === 'Ada')!.games).toBe(3);
	});
});
