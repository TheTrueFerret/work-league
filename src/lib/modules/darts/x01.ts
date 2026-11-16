import { UserError } from '$lib/core/errors';

/**
 * The X01 darts engine (301 / 501 / 701). Pure functions over a setup and a
 * list of turns, so the browser's scorer and the server's `resolve` replay the
 * exact same rules and can never disagree about who won.
 */

export const START_SCORES = [301, 501, 701] as const;
export type StartScore = (typeof START_SCORES)[number];

export const MAX_LEGS_TO_WIN = 7;

/** 0 is a miss, 25 the bull ring (25 single = outer bull, 25 double = bullseye). */
export const SEGMENTS = [
	0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 25
] as const;
export type Segment = (typeof SEGMENTS)[number];
export type Multiplier = 1 | 2 | 3;

export interface Dart {
	readonly segment: number;
	readonly multiplier: Multiplier;
}

/** A turn entered dart by dart. Fewer than three darts only when it finishes or busts. */
export interface DartsTurn {
	readonly darts: readonly Dart[];
}

/**
 * A turn entered as a total, the way most pub scorers work. `darts` and
 * `doubleFinish` only matter when the total finishes the leg.
 */
export interface TotalTurn {
	readonly total: number;
	readonly darts?: 1 | 2 | 3;
	readonly doubleFinish?: boolean;
}

export type Turn = DartsTurn | TotalTurn;

export interface X01Setup {
	readonly startScore: StartScore;
	readonly doubleIn: boolean;
	readonly doubleOut: boolean;
	readonly legsToWin: number;
	/**
	 * Players on each side, in side order. Stored with the match so a summary
	 * can be replayed without the player ids, and checked against them on save.
	 */
	readonly layout: readonly number[];
}

export interface Rules {
	readonly doubleIn: boolean;
	readonly doubleOut: boolean;
}

export const isTotalTurn = (turn: Turn): turn is TotalTurn => 'total' in turn;

/* -------------------------------------------------------------------------- */
/* What a dart can score                                                       */
/* -------------------------------------------------------------------------- */

const SINGLE_DART_VALUES: readonly number[] = (() => {
	const values = new Set<number>([0, 25, 50]);
	for (let n = 1; n <= 20; n++) for (const m of [1, 2, 3]) values.add(n * m);
	return [...values];
})();

const FINISHING_DOUBLES: readonly number[] = [
	...Array.from({ length: 20 }, (_, i) => (i + 1) * 2),
	50
];

/** Every total reachable with exactly `n` darts, misses included. */
const reachable: readonly ReadonlySet<number>[] = (() => {
	const sets: Set<number>[] = [new Set([0])];
	for (let n = 1; n <= 3; n++) {
		const next = new Set<number>();
		for (const before of sets[n - 1]!)
			for (const value of SINGLE_DART_VALUES) next.add(before + value);
		sets.push(next);
	}
	return sets;
})();

/** Every finish in exactly `n` darts: anything before, then the finishing dart. */
const finishes = (doubleOut: boolean): readonly ReadonlySet<number>[] => {
	const last = doubleOut ? FINISHING_DOUBLES : SINGLE_DART_VALUES.filter((v) => v > 0);
	return [0, 1, 2, 3].map((n) => {
		const out = new Set<number>();
		if (n === 0) return out;
		for (const before of reachable[n - 1]!) for (const value of last) out.add(before + value);
		return out;
	});
};
const FINISHES_DOUBLE_OUT = finishes(true);
const FINISHES_STRAIGHT_OUT = finishes(false);

/** Whether `total` can be scored with up to `darts` darts (180 is the most). */
export const possibleTotal = (total: number, darts = 3): boolean =>
	Number.isInteger(total) && (reachable[darts]?.has(total) ?? false);

/** Whether `remaining` can be checked out with exactly `darts` darts. */
export const canCheckout = (remaining: number, darts: number, doubleOut: boolean): boolean =>
	(doubleOut ? FINISHES_DOUBLE_OUT : FINISHES_STRAIGHT_OUT)[darts]?.has(remaining) ?? false;

/** Whether a turn starting on `remaining` could finish the leg. */
export const isFinishable = (remaining: number, doubleOut: boolean, darts = 3): boolean => {
	for (let n = 1; n <= darts; n++) if (canCheckout(remaining, n, doubleOut)) return true;
	return false;
};

export const dartLabel = (dart: Dart): string => {
	if (dart.segment === 0) return 'Miss';
	if (dart.segment === 25) return dart.multiplier === 2 ? 'BULL' : '25';
	return `${'SDT'[dart.multiplier - 1]}${dart.segment}`;
};

function checkDart(dart: Dart): void {
	const validSegment = (SEGMENTS as readonly number[]).includes(dart.segment);
	const validMultiplier = dart.multiplier === 1 || dart.multiplier === 2 || dart.multiplier === 3;
	if (!validSegment || !validMultiplier) throw new UserError('That dart is not on the board');
	if (dart.segment === 25 && dart.multiplier === 3) throw new UserError('There is no treble bull');
	if (dart.segment === 0 && dart.multiplier !== 1)
		throw new UserError('A miss cannot be a double or treble');
}

/* -------------------------------------------------------------------------- */
/* One turn                                                                    */
/* -------------------------------------------------------------------------- */

export interface TurnResult {
	/** Points that counted; 0 on a bust or before the double-in. */
	readonly scored: number;
	readonly remaining: number;
	/** Whether the side has doubled in (always true without double-in). */
	readonly opened: boolean;
	readonly bust: boolean;
	readonly checkedOut: boolean;
	/** True once the turn can take no more darts. */
	readonly done: boolean;
	readonly dartsUsed: number;
}

/**
 * Scores darts thrown so far in a turn. Also used by the scorer to preview a
 * half-entered turn, which is why it reports `done` rather than insisting on
 * three darts.
 */
export function throwDarts(
	remaining: number,
	opened: boolean,
	darts: readonly Dart[],
	rules: Rules
): TurnResult {
	if (darts.length > 3) throw new UserError('A turn has at most three darts');
	let left = remaining;
	let open = opened;
	let scored = 0;
	for (const [i, dart] of darts.entries()) {
		checkDart(dart);
		const last = i === darts.length - 1;
		const isDouble = dart.multiplier === 2 && dart.segment > 0;
		// Under double-in nothing counts until the first double lands.
		if (!open) {
			if (!isDouble) continue;
			open = true;
		}
		const value = dart.segment * dart.multiplier;
		const after = left - value;
		const bust =
			after < 0 ||
			(rules.doubleOut && after === 1) ||
			(after === 0 && rules.doubleOut && !isDouble);
		if (bust) {
			if (!last) throw new UserError('No more darts are thrown after a bust');
			return {
				scored: 0,
				remaining,
				opened,
				bust: true,
				checkedOut: false,
				done: true,
				dartsUsed: darts.length
			};
		}
		left = after;
		scored += value;
		if (left === 0) {
			if (!last) throw new UserError('No more darts are thrown after a checkout');
			return {
				scored,
				remaining: 0,
				opened: open,
				bust: false,
				checkedOut: true,
				done: true,
				dartsUsed: darts.length
			};
		}
	}
	return {
		scored,
		remaining: left,
		opened: open,
		bust: false,
		checkedOut: false,
		done: darts.length === 3,
		dartsUsed: darts.length
	};
}

/** Scores a turn entered as one total. Busts count as three darts. */
export function throwTotal(
	remaining: number,
	opened: boolean,
	turn: TotalTurn,
	rules: Rules
): TurnResult {
	const { total } = turn;
	if (!possibleTotal(total)) throw new UserError(`${total} can't be scored with three darts`);
	const bust: TurnResult = {
		scored: 0,
		remaining,
		opened,
		bust: true,
		checkedOut: false,
		done: true,
		dartsUsed: 3
	};
	if (total === 0) return { ...bust, bust: false };
	// The total entered is what counted, so any score means the double went in.
	if (!opened && total < 2) throw new UserError('A double-in score starts with a double');
	const after = remaining - total;
	if (after < 0 || (rules.doubleOut && after === 1)) return bust;
	if (after === 0) {
		if (rules.doubleOut && turn.doubleFinish === false) return bust;
		const used = turn.darts ?? 3;
		if (!canCheckout(total, used, rules.doubleOut)) {
			throw new UserError(
				`${total} can't be checked out with ${used} dart${used === 1 ? '' : 's'}`
			);
		}
		return {
			scored: total,
			remaining: 0,
			opened: true,
			bust: false,
			checkedOut: true,
			done: true,
			dartsUsed: used
		};
	}
	return {
		scored: total,
		remaining: after,
		opened: true,
		bust: false,
		checkedOut: false,
		done: true,
		dartsUsed: 3
	};
}

/* -------------------------------------------------------------------------- */
/* A whole match                                                               */
/* -------------------------------------------------------------------------- */

export interface PlayerStats {
	darts: number;
	points: number;
	/** Darts and points in the player's first three turns of each leg. */
	first9Darts: number;
	first9Points: number;
	oneEighties: number;
	/** 140 to 179. */
	tonForties: number;
	/** 100 to 139. */
	tons: number;
	highestCheckout: number;
	/** Turns started on a score that could be finished. */
	checkoutChances: number;
	checkoutHits: number;
	/** Legs this player's side won. */
	legsWon: number;
	/** Fewest darts the player's side needed to win a leg. */
	bestLeg: number | null;
}

export interface LastTurn {
	readonly player: number;
	readonly scored: number;
	readonly bust: boolean;
}

export interface SideState {
	remaining: number;
	legs: number;
	opened: boolean;
	/** Darts this side has thrown in the current leg. */
	legDarts: number;
	/** The side's most recent turn in the current leg. */
	last: LastTurn | null;
	/** Turns each player has thrown this leg, for the first-9 average. */
	legTurns: number[];
	players: PlayerStats[];
}

export interface LegResult {
	readonly winner: number;
	readonly player: number;
	readonly darts: number;
	readonly checkout: number;
}

export interface Thrower {
	readonly side: number;
	readonly player: number;
}

export interface MatchState {
	readonly setup: X01Setup;
	readonly sides: SideState[];
	/** The leg being played, from 1; the last leg once finished. */
	leg: number;
	readonly legs: LegResult[];
	/** Turns thrown so far in the current leg. */
	turnsInLeg: number;
	current: Thrower | null;
	finished: boolean;
	/** Where each side finished, 1 being first; null until the match is over. */
	placements: number[] | null;
}

const blankStats = (): PlayerStats => ({
	darts: 0,
	points: 0,
	first9Darts: 0,
	first9Points: 0,
	oneEighties: 0,
	tonForties: 0,
	tons: 0,
	highestCheckout: 0,
	checkoutChances: 0,
	checkoutHits: 0,
	legsWon: 0,
	bestLeg: null
});

function checkSetup(setup: X01Setup, sides: readonly (readonly unknown[])[]): void {
	if (!(START_SCORES as readonly number[]).includes(setup.startScore))
		throw new UserError('Start from 301, 501 or 701');
	if (
		!Number.isInteger(setup.legsToWin) ||
		setup.legsToWin < 1 ||
		setup.legsToWin > MAX_LEGS_TO_WIN
	) {
		throw new UserError(`Play first to 1 to ${MAX_LEGS_TO_WIN} legs`);
	}
	if (sides.length < 2) throw new UserError('Darts needs at least two sides');
	const matches =
		setup.layout.length === sides.length &&
		setup.layout.every((count, i) => count === sides[i]!.length);
	if (!matches) throw new UserError("The players don't match the game that was scored");
	if (sides.some((side) => side.length === 0)) throw new UserError('A side cannot be empty');
}

/** Sides rotate each turn; the starting side and its first thrower rotate each leg. */
function throwerFor(state: MatchState): Thrower {
	const count = state.sides.length;
	const legIndex = state.leg - 1;
	const side = (legIndex + state.turnsInLeg) % count;
	const round = Math.floor(state.turnsInLeg / count);
	return { side, player: (legIndex + round) % state.sides[side]!.players.length };
}

/** A blank match. Use `replay` unless you are stepping through turns yourself. */
export function newMatch(setup: X01Setup, sides: readonly (readonly unknown[])[]): MatchState {
	checkSetup(setup, sides);
	const state: MatchState = {
		setup,
		sides: sides.map((side) => ({
			remaining: setup.startScore,
			legs: 0,
			opened: !setup.doubleIn,
			legDarts: 0,
			last: null,
			legTurns: side.map(() => 0),
			players: side.map(blankStats)
		})),
		leg: 1,
		legs: [],
		turnsInLeg: 0,
		current: null,
		finished: false,
		placements: null
	};
	state.current = throwerFor(state);
	return state;
}

/** Applies one turn in place. Throws a UserError if the turn is impossible. */
export function applyTurn(state: MatchState, turn: Turn): TurnResult {
	const at = state.current;
	if (state.finished || !at) throw new UserError('The match is already over');
	const side = state.sides[at.side]!;
	const player = side.players[at.player]!;
	const { setup } = state;

	const chance = side.opened && isFinishable(side.remaining, setup.doubleOut);
	let result: TurnResult;
	if (isTotalTurn(turn)) {
		result = throwTotal(side.remaining, side.opened, turn, setup);
	} else {
		if (!Array.isArray(turn.darts) || turn.darts.length === 0)
			throw new UserError('A turn needs at least one dart');
		result = throwDarts(side.remaining, side.opened, turn.darts, setup);
		if (!result.done) throw new UserError('A turn is three darts unless it finishes or busts');
	}

	const turnInLeg = side.legTurns[at.player] ?? 0;
	side.legTurns[at.player] = turnInLeg + 1;

	player.darts += result.dartsUsed;
	player.points += result.scored;
	if (turnInLeg < 3) {
		player.first9Darts += result.dartsUsed;
		player.first9Points += result.scored;
	}
	if (result.scored === 180) player.oneEighties++;
	else if (result.scored >= 140) player.tonForties++;
	else if (result.scored >= 100) player.tons++;
	if (chance) player.checkoutChances++;

	side.remaining = result.remaining;
	side.opened = result.opened;
	side.legDarts += result.dartsUsed;
	side.last = { player: at.player, scored: result.scored, bust: result.bust };
	state.turnsInLeg++;

	if (result.checkedOut) {
		player.checkoutHits++;
		player.highestCheckout = Math.max(player.highestCheckout, result.scored);
		side.legs++;
		state.legs.push({
			winner: at.side,
			player: at.player,
			darts: side.legDarts,
			checkout: result.scored
		});
		for (const p of side.players) {
			p.legsWon++;
			p.bestLeg = p.bestLeg === null ? side.legDarts : Math.min(p.bestLeg, side.legDarts);
		}
		if (side.legs >= setup.legsToWin) {
			state.finished = true;
			state.current = null;
			state.placements = placementsFor(state.sides);
			return result;
		}
		for (const s of state.sides) {
			s.remaining = setup.startScore;
			s.opened = !setup.doubleIn;
			s.legDarts = 0;
			s.last = null;
			s.legTurns = s.legTurns.map(() => 0);
		}
		state.leg++;
		state.turnsInLeg = 0;
	}
	state.current = throwerFor(state);
	return result;
}

/**
 * Most legs first, then whoever was closest in the final leg. Sides that are
 * level on both share a placement (1, 2, 2, 4), which the rating engine scores
 * as a draw between them.
 */
function placementsFor(sides: readonly SideState[]): number[] {
	const ahead = (a: SideState, b: SideState) =>
		a.legs > b.legs || (a.legs === b.legs && a.remaining < b.remaining);
	return sides.map((side) => 1 + sides.filter((other) => ahead(other, side)).length);
}

/**
 * Replays a match from its setup and turns.
 *
 * @param sides the players on each side in throwing order; only the counts matter here
 * @throws UserError at the first impossible turn, naming it
 */
export function replay(
	setup: X01Setup,
	sides: readonly (readonly unknown[])[],
	turns: readonly Turn[]
): MatchState {
	const state = newMatch(setup, sides);
	turns.forEach((turn, i) => {
		try {
			applyTurn(state, turn);
		} catch (error) {
			if (error instanceof UserError) throw new UserError(`Turn ${i + 1}: ${error.message}`);
			throw error;
		}
	});
	return state;
}

/** Sides shaped like `setup.layout`, for replaying a match without its player ids. */
export const layoutSides = (setup: X01Setup): number[][] =>
	setup.layout.map((count) => Array.from({ length: count }, () => 0));

/* -------------------------------------------------------------------------- */
/* Checkout suggestions                                                        */
/* -------------------------------------------------------------------------- */

interface Option {
	readonly label: string;
	readonly value: number;
	readonly double: boolean;
	/** How much we'd rather not aim at this to set up a finish. */
	readonly setupCost: number;
}

/** The doubles players are drilled on, best first; anything else costs more. */
const DOUBLE_PREFERENCE: Readonly<Record<string, number>> = {
	D20: 0,
	D16: 0.4,
	D8: 0.8,
	D10: 1,
	D12: 1.1,
	D18: 1.2,
	D4: 1.8,
	D6: 1.9,
	D14: 1.6,
	D2: 2.6,
	BULL: 2.4,
	D1: 4
};

const OPTIONS: readonly Option[] = (() => {
	const out: Option[] = [];
	for (let n = 20; n >= 1; n--) {
		out.push({
			label: `T${n}`,
			value: n * 3,
			double: false,
			setupCost: n === 20 ? 0 : n === 19 ? 0.3 : 1 + (20 - n) * 0.15
		});
	}
	for (let n = 20; n >= 1; n--)
		out.push({ label: `S${n}`, value: n, double: false, setupCost: 1 + (20 - n) * 0.1 });
	out.push({ label: '25', value: 25, double: false, setupCost: 2.5 });
	for (let n = 20; n >= 1; n--)
		out.push({ label: `D${n}`, value: n * 2, double: true, setupCost: 3 + (20 - n) * 0.05 });
	out.push({ label: 'BULL', value: 50, double: true, setupCost: 3 });
	return out;
})();

const finishCost = (option: Option, doubleOut: boolean): number =>
	doubleOut ? (DOUBLE_PREFERENCE[option.label] ?? 2.5) : option.setupCost;

const suggestionCache = new Map<string, readonly string[] | null>();

/**
 * The route a player should aim for, such as `['T20', 'T20', 'BULL']`, or null
 * when the score can't be finished with the darts left. Fewest darts wins,
 * then the most familiar double, then the most familiar set-up shots.
 */
export function checkoutSuggestion(
	remaining: number,
	{ doubleOut, dartsLeft = 3 }: { doubleOut: boolean; dartsLeft?: number }
): readonly string[] | null {
	const key = `${remaining}:${doubleOut}:${dartsLeft}`;
	const cached = suggestionCache.get(key);
	if (cached !== undefined) return cached;

	let best: readonly string[] | null = null;
	if (remaining > 0 && Number.isInteger(remaining)) {
		const finals = doubleOut ? OPTIONS.filter((o) => o.double) : OPTIONS;
		for (let count = 1; count <= Math.min(dartsLeft, 3) && !best; count++) {
			let bestCost = Infinity;
			for (const last of finals) {
				const need = remaining - last.value;
				for (const setup of setups(count - 1, need)) {
					const cost = finishCost(last, doubleOut) + setup.reduce((sum, o) => sum + o.setupCost, 0);
					if (cost < bestCost) {
						bestCost = cost;
						// Biggest set-up shot first, as the charts list them.
						best = [
							...[...setup].sort((a, b) => b.value - a.value).map((o) => o.label),
							last.label
						];
					}
				}
			}
		}
	}
	suggestionCache.set(key, best);
	return best;
}

/** Every unordered set of `count` scoring darts adding up to `total`. */
function setups(count: number, total: number): Option[][] {
	if (count === 0) return total === 0 ? [[]] : [];
	if (total <= 0) return [];
	const out: Option[][] = [];
	OPTIONS.forEach((first, i) => {
		if (count === 1) {
			if (first.value === total) out.push([first]);
			return;
		}
		for (let j = i; j < OPTIONS.length; j++) {
			const second = OPTIONS[j]!;
			if (first.value + second.value === total) out.push([first, second]);
		}
	});
	return out;
}
