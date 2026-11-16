import { describe, expect, it } from 'vitest';
import {
	applyTurn,
	canCheckout,
	checkoutSuggestion,
	isFinishable,
	possibleTotal,
	replay,
	throwTotal,
	type Dart,
	type Multiplier,
	type Turn,
	type X01Setup
} from './x01';

const d = (segment: number, multiplier: Multiplier = 1): Dart => ({ segment, multiplier });
const darts = (...list: Dart[]): Turn => ({ darts: list });
const total = (n: number, extra: { darts?: 1 | 2 | 3; doubleFinish?: boolean } = {}): Turn => ({
	total: n,
	...extra
});
const NOTHING = total(0);

const setup = (over: Partial<X01Setup> = {}): X01Setup => ({
	startScore: 501,
	doubleIn: false,
	doubleOut: true,
	legsToWin: 1,
	layout: [1, 1],
	...over
});
const singles = (count: number) => Array.from({ length: count }, (_, i) => [i + 1]);

/** Side 0 gets down to `left` in 301 while side 1 scores nothing. Side 0 is to throw next. */
const downTo = (left: number): Turn[] => {
	const turns: Turn[] = [];
	let remaining = 301;
	while (remaining - left > 0) {
		const step = Math.min(180, remaining - left);
		const scored = possibleTotal(step) ? step : step - 3;
		turns.push(total(scored), NOTHING);
		remaining -= scored;
	}
	return turns;
};

const NINE_DARTER: Turn[] = [
	darts(d(20, 3), d(20, 3), d(20, 3)),
	NOTHING,
	darts(d(20, 3), d(20, 3), d(20, 3)),
	NOTHING,
	darts(d(20, 3), d(19, 3), d(12, 2))
];

describe('busts', () => {
	const at40 = setup({ startScore: 301 });
	const before = downTo(40);

	it('gets to 40 for the bust tests', () => {
		const state = replay(at40, singles(2), before);
		expect(state.sides[0]!.remaining).toBe(40);
		expect(state.current).toEqual({ side: 0, player: 0 });
	});

	it('busts when scoring past zero, ending the turn early', () => {
		const state = replay(at40, singles(2), [...before, darts(d(20, 3))]);
		expect(state.sides[0]!.remaining).toBe(40);
		expect(state.sides[0]!.last).toMatchObject({ scored: 0, bust: true });
		expect(state.current?.side).toBe(1);
		expect(() => replay(at40, singles(2), [...before, darts(d(20, 3), d(1))])).toThrow(
			/after a bust/
		);
	});

	it('busts when leaving 1 with double-out', () => {
		const state = replay(at40, singles(2), [...before, darts(d(20), d(19))]);
		expect(state.sides[0]!.remaining).toBe(40);
		expect(replay(at40, singles(2), [...before, total(39)]).sides[0]!.remaining).toBe(40);
		const straight = replay({ ...at40, doubleOut: false }, singles(2), [...before, total(39)]);
		expect(straight.sides[0]!.remaining).toBe(1);
	});

	it('busts when reaching zero without a double', () => {
		const state = replay(at40, singles(2), [...before, darts(d(20), d(20))]);
		expect(state.sides[0]!.remaining).toBe(40);
		expect(state.finished).toBe(false);
		const declared = replay(at40, singles(2), [
			...before,
			total(40, { darts: 2, doubleFinish: false })
		]);
		expect(declared.sides[0]!.remaining).toBe(40);
		const straight = replay({ ...at40, doubleOut: false }, singles(2), [
			...before,
			darts(d(20), d(20))
		]);
		expect(straight.finished).toBe(true);
	});

	it('busts a total that scores past zero', () => {
		const state = replay(at40, singles(2), [...before, total(41)]);
		expect(state.sides[0]!.last).toMatchObject({ bust: true, scored: 0 });
	});

	it('requires three darts unless the turn ends early', () => {
		expect(() => replay(at40, singles(2), [darts(d(20), d(20))])).toThrow(/three darts/);
	});
});

describe('double-in', () => {
	const rules = setup({ startScore: 301, doubleIn: true });

	it('ignores darts before the first double', () => {
		const state = replay(rules, singles(2), [darts(d(20), d(10, 2), d(20, 3))]);
		expect(state.sides[0]!.remaining).toBe(301 - 80);
		expect(state.sides[0]!.players[0]!.points).toBe(80);
		expect(state.sides[0]!.players[0]!.darts).toBe(3);
	});

	it('scores nothing until a double lands', () => {
		const state = replay(rules, singles(2), [darts(d(20, 3), d(20, 3), d(25))]);
		expect(state.sides[0]!.remaining).toBe(301);
		expect(state.sides[0]!.opened).toBe(false);
	});

	it('treats a bull as a double', () => {
		const state = replay(rules, singles(2), [darts(d(25, 2), d(20), d(20))]);
		expect(state.sides[0]!.remaining).toBe(211);
	});

	it('counts an entered total as already doubled in', () => {
		const state = replay(rules, singles(2), [total(60)]);
		expect(state.sides[0]!.remaining).toBe(241);
		expect(state.sides[0]!.opened).toBe(true);
	});
});

describe('a 501 leg', () => {
	it('records a nine-darter', () => {
		const state = replay(setup(), singles(2), NINE_DARTER);
		expect(state.finished).toBe(true);
		expect(state.placements).toEqual([1, 2]);
		expect(state.legs).toEqual([{ winner: 0, player: 0, darts: 9, checkout: 141 }]);
		const stats = state.sides[0]!.players[0]!;
		expect(stats.darts).toBe(9);
		expect(stats.points).toBe(501);
		expect((stats.points / stats.darts) * 3).toBe(167);
		expect((stats.first9Points / stats.first9Darts) * 3).toBe(167);
		expect(stats.oneEighties).toBe(2);
		expect(stats.highestCheckout).toBe(141);
		expect(stats.bestLeg).toBe(9);
		expect(stats.legsWon).toBe(1);
		expect(stats.checkoutChances).toBe(1);
		expect(stats.checkoutHits).toBe(1);
	});

	it('counts checkout darts from a total entry', () => {
		const turns = [...NINE_DARTER.slice(0, 4), total(141, { darts: 3 })];
		const state = replay(setup(), singles(2), turns);
		expect(state.finished).toBe(true);
		expect(state.sides[0]!.players[0]!.darts).toBe(9);
	});

	it('limits the first-9 average to the first three turns', () => {
		const turns = [total(60), NOTHING, total(60), NOTHING, total(60), NOTHING, total(100), NOTHING];
		const stats = replay(setup(), singles(2), turns).sides[0]!.players[0]!;
		expect((stats.first9Points / stats.first9Darts) * 3).toBe(60);
		expect((stats.points / stats.darts) * 3).toBe(70);
		expect(stats.tons).toBe(1);
	});

	it('buckets big scores', () => {
		const turns = [total(180), NOTHING, total(140), NOTHING, total(100), NOTHING];
		const stats = replay(setup(), singles(2), turns).sides[0]!.players[0]!;
		expect([stats.oneEighties, stats.tonForties, stats.tons]).toEqual([1, 1, 1]);
	});
});

describe('impossible scores', () => {
	it.each([181, 179, 178, 176, 175, 173, 172, 169, 166, 163])('rejects a total of %i', (n) => {
		expect(possibleTotal(n)).toBe(false);
		expect(() => replay(setup(), singles(2), [total(n)])).toThrow(/can't be scored/);
	});

	it('accepts every other total up to 180', () => {
		const bad = new Set([179, 178, 176, 175, 173, 172, 169, 166, 163]);
		for (let n = 0; n <= 180; n++) expect(possibleTotal(n)).toBe(!bad.has(n));
	});

	it.each([171, 169, 168, 166, 165, 163, 162, 159])(
		'knows %i is no checkout with double-out',
		(n) => {
			expect(isFinishable(n, true)).toBe(false);
		}
	);

	it('rejects an impossible checkout entered as a total', () => {
		const rules = setup({ startScore: 301 });
		const turns = [total(133), NOTHING];
		expect(replay(rules, singles(2), turns).sides[0]!.remaining).toBe(168);
		expect(() => replay(rules, singles(2), [...turns, total(168)])).toThrow(/can't be checked out/);
	});

	it('checks the darts used for a checkout', () => {
		expect(canCheckout(170, 3, true)).toBe(true);
		expect(canCheckout(170, 2, true)).toBe(false);
		expect(canCheckout(100, 2, true)).toBe(true);
		expect(canCheckout(100, 1, true)).toBe(false);
		expect(canCheckout(50, 1, true)).toBe(true);
		expect(() =>
			throwTotal(100, true, { total: 100, darts: 1 }, { doubleIn: false, doubleOut: true })
		).toThrow(/1 dart/);
	});

	it('rejects darts that are not on the board', () => {
		expect(() => replay(setup(), singles(2), [darts(d(25, 3), d(1), d(1))])).toThrow(/treble bull/);
		expect(() => replay(setup(), singles(2), [darts(d(21), d(1), d(1))])).toThrow(
			/not on the board/
		);
		expect(() => replay(setup(), singles(2), [darts(d(1), d(1), d(1), d(1))])).toThrow(
			/at most three/
		);
	});
});

describe('throwing order', () => {
	it('rotates the starting side each leg', () => {
		const state = replay(setup({ legsToWin: 2 }), singles(2), NINE_DARTER);
		expect(state.finished).toBe(false);
		expect(state.leg).toBe(2);
		expect(state.sides.map((s) => s.remaining)).toEqual([501, 501]);
		expect(state.current).toEqual({ side: 1, player: 0 });
		applyTurn(state, total(60));
		expect(state.current).toEqual({ side: 0, player: 0 });
	});

	it('rotates through every side in a free-for-all', () => {
		const rules = setup({ layout: [1, 1, 1], legsToWin: 2 });
		const seen = [];
		const state = replay(rules, singles(3), []);
		for (let i = 0; i < 4; i++) {
			seen.push(state.current!.side);
			applyTurn(state, NOTHING);
		}
		expect(seen).toEqual([0, 1, 2, 0]);
	});

	it('alternates partners within a doubles side', () => {
		const rules = setup({ layout: [2, 2], legsToWin: 2 });
		const state = replay(
			rules,
			[
				[1, 2],
				[3, 4]
			],
			[]
		);
		const order = [];
		for (let i = 0; i < 5; i++) {
			order.push(state.current);
			applyTurn(state, NOTHING);
		}
		expect(order).toEqual([
			{ side: 0, player: 0 },
			{ side: 1, player: 0 },
			{ side: 0, player: 1 },
			{ side: 1, player: 1 },
			{ side: 0, player: 0 }
		]);
	});

	it('changes who starts for a doubles side in the next leg', () => {
		const rules = setup({ layout: [2, 2], legsToWin: 2 });
		const sides = [
			[1, 2],
			[3, 4]
		];
		// Side 0 finishes leg one: player 0, 1, then 0 again checks out.
		const state = replay(rules, sides, [total(180), NOTHING, total(180), NOTHING, total(141)]);
		expect(state.sides[0]!.players[0]!.highestCheckout).toBe(141);
		expect(state.sides[0]!.players[1]!.legsWon).toBe(1);
		expect(state.current).toEqual({ side: 1, player: 1 });
		applyTurn(state, NOTHING);
		expect(state.current).toEqual({ side: 0, player: 1 });
	});

	it('rejects a layout that does not match the players', () => {
		expect(() => replay(setup({ layout: [1, 1] }), [[1, 2], [3]], [])).toThrow(/don't match/);
	});
});

describe('finishing the match', () => {
	it('places a free-for-all by legs, then by what was left', () => {
		const rules = setup({ startScore: 301, layout: [1, 1, 1] });
		const tied = replay(rules, singles(3), [
			total(180),
			total(100),
			total(100),
			total(121, { darts: 3 })
		]);
		expect(tied.placements).toEqual([1, 2, 2]);
		const ordered = replay(rules, singles(3), [total(180), total(100), total(140), total(121)]);
		expect(ordered.placements).toEqual([1, 3, 2]);
	});

	it('ranks legs won ahead of the final leg', () => {
		const rules = setup({ startScore: 301, layout: [1, 1, 1], legsToWin: 2 });
		// Leg 1: side 0 wins. Leg 2 (side 1 starts): side 2 gets close, side 1 wins.
		const leg1 = [total(180), NOTHING, NOTHING, total(121)];
		const leg2 = [total(180), total(180), NOTHING, total(121)];
		const state = replay(rules, singles(3), [...leg1, ...leg2]);
		// Side 1 checked out in leg 2, so it is level with side 0 on legs: first to 2 is not reached yet.
		expect(state.finished).toBe(false);
		// Leg 3 starts with side 2, who ends closer than side 1 but has won fewer legs.
		const leg3 = [total(180), total(180), NOTHING, NOTHING, total(121)];
		const done = replay(rules, singles(3), [...leg1, ...leg2, ...leg3]);
		expect(done.finished).toBe(true);
		expect(done.legs.map((l) => l.winner)).toEqual([0, 1, 0]);
		expect(done.placements).toEqual([1, 2, 3]);
	});

	it('ends at legsToWin and rejects turns afterwards', () => {
		const rules = setup({ legsToWin: 2 });
		const state = replay(rules, singles(2), [...NINE_DARTER, NOTHING, ...NINE_DARTER]);
		expect(state.finished).toBe(true);
		expect(state.sides.map((s) => s.legs)).toEqual([2, 0]);
		expect(state.current).toBeNull();
		expect(() => applyTurn(state, NOTHING)).toThrow(/already over/);
		expect(() =>
			replay(rules, singles(2), [...NINE_DARTER, NOTHING, ...NINE_DARTER, NOTHING])
		).toThrow(/Turn 12: The match is already over/);
	});
});

describe('checkout suggestions', () => {
	const out = (n: number, dartsLeft = 3) => checkoutSuggestion(n, { doubleOut: true, dartsLeft });

	it('finds the classic routes', () => {
		expect(out(170)).toEqual(['T20', 'T20', 'BULL']);
		expect(out(167)).toEqual(['T20', 'T19', 'BULL']);
		expect(out(141)).toEqual(['T20', 'T19', 'D12']);
		expect(out(100)).toEqual(['T20', 'D20']);
		expect(out(81)).toEqual(['T19', 'D12']);
		expect(out(61)).toEqual(['T15', 'D8']);
		expect(out(50)).toEqual(['BULL']);
		expect(out(40)).toEqual(['D20']);
		expect(out(32)).toEqual(['D16']);
		expect(out(3)).toEqual(['S1', 'D1']);
		expect(out(2)).toEqual(['D1']);
	});

	it('returns null when there is no finish', () => {
		expect(out(169)).toBeNull();
		expect(out(171)).toBeNull();
		expect(out(1)).toBeNull();
		expect(out(0)).toBeNull();
		expect(out(100, 1)).toBeNull();
		expect(out(170, 2)).toBeNull();
	});

	it('works without double-out', () => {
		expect(checkoutSuggestion(60, { doubleOut: false, dartsLeft: 3 })).toEqual(['T20']);
		expect(checkoutSuggestion(1, { doubleOut: false, dartsLeft: 1 })).toEqual(['S1']);
		expect(checkoutSuggestion(180, { doubleOut: false, dartsLeft: 3 })).toEqual([
			'T20',
			'T20',
			'T20'
		]);
	});
});
