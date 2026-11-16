import { describe, expect, it } from 'vitest';
import {
	computeDeltas,
	defaultKFactor,
	defaultRating,
	expectedScore,
	tierFor,
	winChances,
	type Competitor
} from './elo';

const p = (id: number, rating: number, games = 50): Competitor => ({ id, rating, games });
const duel = (a: Competitor[], b: Competitor[], winner: 0 | 1) =>
	computeDeltas([a, b], winner === 0 ? [1, 2] : [2, 1]);

/** The formula the original pool ladder used, kept here to prove nothing moved. */
function legacyTeamDeltas(teamA: Competitor[], teamB: Competitor[], winner: 'A' | 'B') {
	const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
	const avgA = mean(teamA.map((x) => x.rating));
	const avgB = mean(teamB.map((x) => x.rating));
	const out = new Map<number, number>();
	for (const [team, opp, score] of [
		[teamA, avgB, winner === 'A' ? 1 : 0],
		[teamB, avgA, winner === 'B' ? 1 : 0]
	] as const) {
		for (const x of team)
			out.set(x.id, Math.round(defaultKFactor(x.games) * (score - expectedScore(x.rating, opp))));
	}
	return out;
}

describe('two-sided matches', () => {
	it('pays an underdog more than a favourite', () => {
		const upset = duel([p(1, 900)], [p(2, 1400)], 0).get(1)!;
		const expected = duel([p(1, 1400)], [p(2, 900)], 0).get(1)!;
		expect(upset).toBeGreaterThan(expected);
		expect(upset).toBeGreaterThan(18);
		expect(expected).toBeLessThanOrEqual(2);
	});

	it('makes an even match worth half of K, zero-sum', () => {
		const even = duel([p(1, 1200)], [p(2, 1200)], 0);
		expect(even.get(1)).toBe(10);
		expect(even.get(2)).toBe(-10);
	});

	it('gives the weaker teammate more for a win', () => {
		const mixed = duel([p(1, 800), p(2, 1600)], [p(3, 1200), p(4, 1200)], 0);
		expect(mixed.get(1)!).toBeGreaterThan(mixed.get(2)!);
		expect(mixed.get(3)!).toBeLessThan(0);
		expect(mixed.get(4)!).toBeLessThan(0);
	});

	it('rates a 4v4 player against the opposing average', () => {
		const big = duel(
			[p(1, 1000), p(2, 1000), p(3, 1000), p(4, 1000)],
			[p(5, 1200), p(6, 1200), p(7, 1200), p(8, 1200)],
			0
		);
		expect(big.get(1)).toBe(duel([p(1, 1000)], [p(5, 1200)], 0).get(1));
	});

	it('matches the original pool formula exactly', () => {
		const cases: [Competitor[], Competitor[]][] = [
			[[p(1, 1000, 0)], [p(2, 1000, 0)]],
			[[p(1, 1137, 12), p(2, 912, 3)], [p(3, 1290, 40)]],
			[
				[p(1, 1500, 99), p(2, 700, 1), p(3, 1010, 29)],
				[p(4, 1111, 10), p(5, 999, 9)]
			]
		];
		for (const [a, b] of cases) {
			expect(duel(a, b, 0)).toEqual(legacyTeamDeltas(a, b, 'A'));
			expect(duel(a, b, 1)).toEqual(legacyTeamDeltas(a, b, 'B'));
		}
	});
});

describe('free-for-all matches', () => {
	it('rewards the winner and punishes last place among equals', () => {
		const deltas = computeDeltas([[p(1, 1000)], [p(2, 1000)], [p(3, 1000)]], [1, 2, 3]);
		expect(deltas.get(1)).toBe(10);
		expect(deltas.get(2)).toBe(0);
		expect(deltas.get(3)).toBe(-10);
	});

	it('never moves a player more than one K', () => {
		const field = Array.from({ length: 8 }, (_, i) => [p(i + 1, 2000, 0)]);
		field[7] = [p(8, 600, 0)];
		const deltas = computeDeltas(field, [8, 2, 3, 4, 5, 6, 7, 1]);
		for (const delta of deltas.values()) expect(Math.abs(delta)).toBeLessThanOrEqual(40);
	});

	it('treats a shared placement as a draw between those sides', () => {
		const deltas = computeDeltas([[p(1, 1000)], [p(2, 1000)]], [1, 1]);
		expect(deltas.get(1)).toBe(0);
		expect(deltas.get(2)).toBe(0);
	});

	it('rejects malformed matches', () => {
		expect(() => computeDeltas([[p(1, 1000)]], [1])).toThrow(RangeError);
		expect(() => computeDeltas([[p(1, 1000)], []], [1, 2])).toThrow(RangeError);
		expect(() => computeDeltas([[p(1, 1000)], [p(2, 1000)]], [1])).toThrow(RangeError);
	});
});

describe('win chances', () => {
	it('sums to one and favours the stronger side', () => {
		const chances = winChances([[p(1, 1400)], [p(2, 1000)], [p(3, 1000)]]);
		expect(chances.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 10);
		expect(chances[0]!).toBeGreaterThan(chances[1]!);
	});

	it('is even when a side is still empty', () => {
		expect(winChances([[p(1, 1400)], []])).toEqual([0.5, 0.5]);
	});
});

describe('expected score and K', () => {
	it('is a coin flip for equal ratings and ~10:1 at +400', () => {
		expect(expectedScore(1000, 1000)).toBe(0.5);
		expect(expectedScore(1400, 1000)).toBeCloseTo(10 / 11, 9);
	});

	it('settles players down as they play more', () => {
		expect(defaultKFactor(0)).toBe(40);
		expect(defaultKFactor(15)).toBe(28);
		expect(defaultKFactor(100)).toBe(20);
	});

	it('names tiers from the top', () => {
		expect(tierFor(defaultRating.start)).toBe('Casual');
		expect(tierFor(1500)).toBe('Legend');
		expect(tierFor(800)).toBe('Rookie');
	});
});
