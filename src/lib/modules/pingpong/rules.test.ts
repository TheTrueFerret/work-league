import { describe, expect, it } from 'vitest';
import * as v from 'valibot';
import { UserError } from '$lib/core/errors';
import pingpong from './index';
import {
	replay,
	validateGames,
	type PingPongDetails,
	type PingPongSetup,
	type Side
} from './rules';
import { detailsSchema } from './schema';

const elevens: PingPongSetup = { pointsToWin: 11, bestOf: 1, firstServer: 0 };
const bestOf3: PingPongSetup = { pointsToWin: 11, bestOf: 3, firstServer: 0 };

/**
 * Rallies for one game ending a–b. Points alternate (winner first) up to the
 * loser's score, so the game can't end early, then the winner takes the rest.
 */
function game(a: number, b: number): Side[] {
	const winner: Side = a > b ? 0 : 1;
	const loser: Side = winner === 0 ? 1 : 0;
	const out: Side[] = [];
	for (let i = 0; i < Math.min(a, b); i++) out.push(winner, loser);
	for (let i = 0; i < Math.abs(a - b); i++) out.push(winner);
	return out;
}

describe('replay', () => {
	it('plays a normal game to 11', () => {
		const state = replay(elevens, game(11, 7));
		expect(state.finished).toBe(true);
		expect(state.winner).toBe(0);
		expect(state.games).toEqual([[11, 7]]);
		expect(state.gamesWon).toEqual([1, 0]);
	});

	it('flags game point, then match point, then the end', () => {
		const at10 = replay(bestOf3, game(11, 7).slice(0, -1));
		expect(at10.score).toEqual([10, 7]);
		expect(at10.gamePoint).toBe(0);
		expect(at10.matchPoint).toBeNull();

		const second = replay(bestOf3, [...game(11, 7), ...game(11, 3).slice(0, -1)]);
		expect(second.gamePoint).toBe(0);
		expect(second.matchPoint).toBe(0);
	});

	it('goes through deuce to 13–11', () => {
		const points = game(13, 11);
		const level = replay(elevens, points.slice(0, 20));
		expect(level.score).toEqual([10, 10]);
		expect(level.deuce).toBe(true);
		expect(level.gamePoint).toBeNull();

		const ahead = replay(elevens, points.slice(0, 21));
		expect(ahead.score).toEqual([11, 10]);
		expect(ahead.deuce).toBe(false);
		expect(ahead.gamePoint).toBe(0);
		expect(ahead.finished).toBe(false);

		const end = replay(elevens, points);
		expect(end.games).toEqual([[13, 11]]);
		expect(end.winner).toBe(0);
	});

	it('switches serve every two points, then every point at deuce', () => {
		const servers = (points: Side[]) => replay(elevens, points).server.side;
		const points = game(12, 10);
		expect(servers([])).toBe(0);
		expect(servers(points.slice(0, 1))).toBe(0);
		expect(servers(points.slice(0, 2))).toBe(1);
		expect(servers(points.slice(0, 3))).toBe(1);
		expect(servers(points.slice(0, 4))).toBe(0);
		expect(servers(points.slice(0, 18))).toBe(1);
		// 10–10: ten turns have passed, so the first server is back on.
		expect(servers(points.slice(0, 20))).toBe(0);
		expect(servers(points.slice(0, 21))).toBe(1);
		expect(servers(points.slice(0, 22))).toBe(0);
	});

	it('switches every five points in games to 21', () => {
		const setup: PingPongSetup = { pointsToWin: 21, bestOf: 1, firstServer: 1 };
		const points = game(21, 19);
		expect(replay(setup, points.slice(0, 4)).server.side).toBe(1);
		expect(replay(setup, points.slice(0, 5)).server.side).toBe(0);
		expect(replay(setup, points.slice(0, 10)).server.side).toBe(1);
		// 20–20 after forty points: every point from here.
		const deuce = [...game(22, 20).slice(0, 40)];
		expect(replay(setup, deuce).score).toEqual([20, 20]);
		expect(replay(setup, deuce).server.side).toBe(1);
		expect(replay(setup, [...deuce, 0]).server.side).toBe(0);
	});

	it('alternates the first server each game and hints at changing ends', () => {
		const afterOne = replay(bestOf3, game(11, 5));
		expect(afterOne.server.side).toBe(1);
		expect(afterOne.changeEnds).toBe(true);
		expect(afterOne.score).toEqual([0, 0]);

		const nextPoint = replay(bestOf3, [...game(11, 5), 0]);
		expect(nextPoint.changeEnds).toBe(false);
	});

	it('changes ends at 5 in the deciding game', () => {
		const opening = [...game(11, 5), ...game(4, 11)];
		const decider = replay(bestOf3, opening);
		expect(decider.deciding).toBe(true);
		const at5 = replay(bestOf3, [...opening, 0, 0, 0, 0, 0]);
		expect(at5.score).toEqual([5, 0]);
		expect(at5.changeEnds).toBe(true);
		// After game 1, after game 2, and now halfway through the decider.
		expect(decider.ends).toBe(2);
		expect(at5.ends).toBe(3);
		expect(replay(bestOf3, [...opening, 0, 0, 0, 0, 0, 1]).changeEnds).toBe(false);
		// Only the first time the leader reaches 5, not when the other side catches up.
		const caughtUp = replay(bestOf3, [...opening, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1]);
		expect(caughtUp.score).toEqual([5, 5]);
		expect(caughtUp.changeEnds).toBe(false);
		// Not in earlier games.
		expect(replay(bestOf3, [0, 0, 0, 0, 0]).changeEnds).toBe(false);
	});

	it('ends a best of 3 at 2–0', () => {
		const state = replay(bestOf3, [...game(11, 9), ...game(11, 6)]);
		expect(state.finished).toBe(true);
		expect(state.winner).toBe(0);
		expect(state.gamesWon).toEqual([2, 0]);
		expect(state.changeEnds).toBe(false);
	});

	it('ends a best of 3 at 2–1', () => {
		const state = replay(bestOf3, [...game(11, 9), ...game(7, 11), ...game(9, 11)]);
		expect(state.finished).toBe(true);
		expect(state.winner).toBe(1);
		expect(state.games).toEqual([
			[11, 9],
			[7, 11],
			[9, 11]
		]);
	});

	it('rejects points after the match is won', () => {
		expect(() => replay(elevens, [...game(11, 2), 1])).toThrow(UserError);
	});

	it('rotates all four players in doubles', () => {
		const doubles = (points: Side[]) => replay(bestOf3, points, true).server;
		expect(doubles([])).toEqual({ side: 0, slot: 0 });
		expect(doubles([0, 0])).toEqual({ side: 1, slot: 0 });
		expect(doubles([0, 0, 0, 0])).toEqual({ side: 0, slot: 1 });
		expect(doubles([0, 0, 0, 0, 0, 0])).toEqual({ side: 1, slot: 1 });
		expect(doubles([0, 0, 0, 0, 0, 0, 0, 0])).toEqual({ side: 0, slot: 0 });
		// Next game: the other pair serves, led by whoever received first.
		expect(doubles(game(11, 5))).toEqual({ side: 1, slot: 0 });
		expect(doubles([...game(11, 5), 1, 1])).toEqual({ side: 0, slot: 0 });
		// Singles has no slot.
		expect(replay(bestOf3, []).server).toEqual({ side: 0, slot: null });
	});

	it('swaps the receiving order at the deciding game change of ends', () => {
		const opening = [...game(11, 5), ...game(4, 11)];
		// Deciding game: side 0 serves first. 5–0 is the start of turn 2 (A2 to serve).
		const at5 = replay(bestOf3, [...opening, 0, 0, 0, 0, 0], true);
		expect(at5.server).toEqual({ side: 0, slot: 1 });
		// A2 was serving to B2; B swaps its order so A2 serves to B1, who serves next.
		expect(replay(bestOf3, [...opening, 0, 0, 0, 0, 0, 0], true).server).toEqual({
			side: 1,
			slot: 0
		});
		// Without the swap (an earlier game) B2 would be next.
		expect(replay(bestOf3, [0, 0, 0, 0, 0, 0], true).server).toEqual({ side: 1, slot: 1 });
	});
});

describe('validateGames', () => {
	const setup = { pointsToWin: 11, bestOf: 3 } as const;

	it('accepts a normal match', () => {
		expect(
			validateGames(setup, [
				[11, 9],
				[8, 11],
				[11, 7]
			])
		).toBe(0);
		expect(validateGames({ pointsToWin: 11, bestOf: 1 }, [[11, 9]])).toBe(0);
		expect(
			validateGames(setup, [
				[13, 15],
				[9, 11]
			])
		).toBe(1);
	});

	it('rejects a one-point margin', () => {
		expect(() => validateGames({ pointsToWin: 11, bestOf: 1 }, [[11, 10]])).toThrow(UserError);
	});

	it('rejects a game that ran on past a two-point lead', () => {
		expect(() => validateGames({ pointsToWin: 11, bestOf: 1 }, [[12, 9]])).toThrow(UserError);
	});

	it('rejects a game nobody won', () => {
		expect(() => validateGames({ pointsToWin: 11, bestOf: 1 }, [[9, 7]])).toThrow(UserError);
	});

	it('rejects games after the match is decided', () => {
		expect(() =>
			validateGames(setup, [
				[11, 5],
				[11, 5],
				[5, 11]
			])
		).toThrow(/decided/);
	});

	it('rejects an unfinished match', () => {
		expect(() =>
			validateGames(setup, [
				[11, 5],
				[5, 11]
			])
		).toThrow(/isn't finished/);
		expect(() => validateGames(setup, [])).toThrow(UserError);
	});
});

describe('module', () => {
	const sides = [[1], [2]];
	const live = (setup: PingPongSetup, points: Side[]): PingPongDetails => ({
		mode: 'live',
		setup,
		points
	});

	it('resolves a live match', () => {
		expect(pingpong.resolve(live(bestOf3, [...game(11, 9), ...game(11, 6)]), sides)).toEqual([
			1, 2
		]);
		expect(pingpong.resolve(live(bestOf3, [...game(9, 11), ...game(6, 11)]), sides)).toEqual([
			2, 1
		]);
	});

	it('refuses an unfinished match', () => {
		expect(() => pingpong.resolve(live(bestOf3, game(11, 9)), sides)).toThrow(UserError);
		expect(() => pingpong.resolve(live(bestOf3, []), sides)).toThrow(UserError);
	});

	it('resolves quick entry', () => {
		const details: PingPongDetails = {
			mode: 'scores',
			setup: { pointsToWin: 21, bestOf: 1 },
			games: [[19, 21]]
		};
		expect(pingpong.resolve(details, sides)).toEqual([2, 1]);
	});

	it('summarizes the games', () => {
		const details = live(bestOf3, [...game(11, 7), ...game(9, 11), ...game(11, 5)]);
		expect(pingpong.summarize?.(details)).toBe('11–7 · 9–11 · 11–5');
		expect(
			pingpong.summarize?.({
				mode: 'scores',
				setup: { pointsToWin: 11, bestOf: 1 },
				games: [[11, 3]]
			})
		).toBe('11–3');
	});

	it('validates submitted details', () => {
		expect(v.is(detailsSchema, live(bestOf3, [0, 1]))).toBe(true);
		expect(
			v.is(detailsSchema, { mode: 'live', setup: { ...bestOf3, bestOf: 2 }, points: [] })
		).toBe(false);
		expect(v.is(detailsSchema, { mode: 'live', setup: bestOf3, points: [2] })).toBe(false);
		expect(
			v.is(detailsSchema, {
				mode: 'scores',
				setup: { pointsToWin: 11, bestOf: 1 },
				games: [[11.5, 3]]
			})
		).toBe(false);
	});

	it('builds player stats from both kinds of match', () => {
		const comeback = live(bestOf3, [...game(9, 11), ...game(12, 10), ...game(11, 4)]);
		const quick: PingPongDetails = {
			mode: 'scores',
			setup: { pointsToWin: 11, bestOf: 1 },
			games: [[5, 11]]
		};
		const stats = pingpong.playerStats?.([
			{ details: comeback, side: 0, sides, placement: 1, playerId: 1 },
			{ details: quick, side: 0, sides, placement: 2, playerId: 1 }
		]);
		expect(stats).toEqual([
			{ label: 'Games won', value: '50% of 4' },
			{ label: 'Points won', value: `${Math.round((37 / 73) * 100)}% of 73` },
			{ label: 'Deuce games won', value: '1 of 1' },
			{ label: 'Comeback wins', value: '1' }
		]);
	});
});
