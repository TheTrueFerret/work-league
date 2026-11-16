import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { UserError } from '$lib/core/errors';
import pool from '$lib/modules/pool';
import type { GameModule } from '$lib/modules/types';
import { closeDatabase } from '../db/client';
import { freshDatabase } from '../testing/database';
import {
	deleteMatch,
	history,
	importRatings,
	leaderboard,
	playerGameProfile,
	rebuildRatings,
	recordMatch,
	standingsFor
} from './matches';
import { addPlayer, deletePlayer, listPlayers, setPlayerActive } from './players';

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

	it('keeps ratings consistent when results arrive at the same moment', async () => {
		// No locks on D1: each write checks the game's version and retries if it lost the race.
		const ids = await Promise.all([
			win([ada], [linus]),
			win([grace], [ada]),
			win([linus], [grace], 1),
			win([ken], [ada]),
			win([ada, ken], [linus, grace])
		]);
		expect(new Set(ids).size).toBe(5);
		const board = await leaderboard(game);
		expect(board.reduce((sum, p) => sum + p.games, 0)).toBe(12);
		const concurrent = await leaderboard(game);
		await rebuildRatings(game);
		expect(await leaderboard(game)).toEqual(concurrent);
	});

	it('deletes a match while others are being recorded', async () => {
		const first = await win([ada], [linus]);
		await Promise.all([deleteMatch(first, find), win([grace], [ken]), win([ada], [grace])]);
		const board = await leaderboard(game);
		expect(board.reduce((sum, p) => sum + p.games, 0)).toBe(4);
		await rebuildRatings(game);
		expect(await leaderboard(game)).toEqual(board);
	});

	it('only deletes players without matches', async () => {
		await win([ada], [linus]);
		await expect(deletePlayer(ada)).rejects.toThrow(UserError);
		await deletePlayer(ken);
		expect((await leaderboard(game)).some((p) => p.id === ken)).toBe(false);
	});
});

describe('importing ratings', () => {
	beforeEach(async () => {
		await freshDatabase();
	});

	it('adds new people and ranks them at their imported rating straight away', async () => {
		const ada = await addPlayer('Ada');
		const result = await importRatings(game, [
			{ name: 'ada', rating: 1250 },
			{ name: 'Linus', rating: 1100 },
			{ name: 'Grace', rating: 900 }
		]);
		expect(result).toEqual({ imported: 3, added: 2 });
		expect((await listPlayers()).map((p) => p.name)).toEqual(['Ada', 'Grace', 'Linus']);

		const board = await leaderboard(game);
		expect(board.map((p) => [p.name, p.rating, p.games, p.ranked])).toEqual([
			['Ada', 1250, 0, true],
			['Linus', 1100, 0, true],
			['Grace', 900, 0, true]
		]);
		expect((await standingsFor(ada))[0]).toMatchObject({ rating: 1250, peak: 1250 });
	});

	it('rates new results from the imported ratings, and keeps them through replays', async () => {
		await importRatings(game, [
			{ name: 'Ada', rating: 1400 },
			{ name: 'Linus', rating: 1000 }
		]);
		const [ada, linus] = (await leaderboard(game)).map((p) => p.id);
		// The favourite wins, so gains far less than the 20 an even match pays.
		const first = await win([ada!], [linus!]);
		await win([linus!], [ada!]);
		const afterTwo = await leaderboard(game);
		expect(afterTwo.find((p) => p.id === ada)!.rating).toBeLessThan(1400);

		await rebuildRatings(game);
		expect(await leaderboard(game)).toEqual(afterTwo);

		// Deleting the first match replays from the imported ratings, not from 1000.
		await deleteMatch(first, find);
		const [latest] = await history(game);
		expect(latest!.sides.flatMap((s) => s.players.map((p) => [p.name, p.ratingBefore]))).toEqual([
			['Linus', 1000],
			['Ada', 1400]
		]);
		const profile = await playerGameProfile(game, ada!);
		expect(profile.curve[0]).toBe(1400);
	});

	it('replays recorded results when ratings are imported later', async () => {
		const ada = await addPlayer('Ada');
		const linus = await addPlayer('Linus');
		await win([ada], [linus]);
		expect((await leaderboard(game))[0]).toMatchObject({ name: 'Ada', rating: 1020 });

		await importRatings(game, [{ name: 'Ada', rating: 1500 }]);
		const board = await leaderboard(game);
		// Ada was the big favourite in that match all along, so she gains only a little.
		expect(board.find((p) => p.id === ada)!.rating).toBeGreaterThan(1500);
		expect(board.find((p) => p.id === ada)!.rating).toBeLessThan(1510);
		expect(board.find((p) => p.id === linus)!.rating).toBeGreaterThan(990);

		// Importing again replaces the earlier rating.
		await importRatings(game, [{ name: 'Ada', rating: 1000 }]);
		expect((await leaderboard(game)).find((p) => p.id === ada)!.rating).toBe(1020);
	});

	it('only touches the game it imports into', async () => {
		await importRatings(game, [{ name: 'Ada', rating: 1300 }]);
		const other = { ...game, id: 'darts' } as GameModule;
		expect((await leaderboard(other))[0]).toMatchObject({ rating: 1000, ranked: false });
	});

	it('refuses lists it cannot trust', async () => {
		await expect(importRatings(game, [])).rejects.toThrow(UserError);
		await expect(
			importRatings(game, [
				{ name: 'Ada', rating: 1000 },
				{ name: 'ADA', rating: 1100 }
			])
		).rejects.toThrow('twice');
		await expect(importRatings(game, [{ name: '  ', rating: 1000 }])).rejects.toThrow(UserError);
	});
});
