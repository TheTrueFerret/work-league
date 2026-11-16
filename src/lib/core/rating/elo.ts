/**
 * The ELO engine every game module shares. Pure maths, so it runs on the
 * server when a match is recorded and in the browser for live previews.
 *
 * A match is any number of sides, each with one or more players, finishing in
 * some order. Every side is compared with every other side, and each player is
 * rated against the opposing side's average rating. With two sides this is the
 * classic team ELO the pool ladder has always used; with more (a darts
 * free-for-all) the pairwise results are averaged so a match is never worth
 * more than one K.
 */

export interface RatingConfig {
	/** Where everyone starts. */
	readonly start: number;
	/** How far a single match can move a player who has played `games` before it. */
	readonly kFactor: (games: number) => number;
}

export interface Competitor {
	readonly id: number;
	readonly rating: number;
	readonly games: number;
}

/** New players move fast so they find their level; veterans settle down. */
export const defaultKFactor = (games: number): number => {
	if (games < 10) return 40;
	if (games < 30) return 28;
	return 20;
};

export const DEFAULT_START_RATING = 1000;

export const defaultRating: RatingConfig = {
	start: DEFAULT_START_RATING,
	kFactor: defaultKFactor
};

/** Probability that `rating` beats `opponent`. */
export function expectedScore(rating: number, opponent: number): number {
	return 1 / (1 + Math.pow(10, (opponent - rating) / 400));
}

const mean = (values: readonly number[]): number =>
	values.reduce((sum, value) => sum + value, 0) / values.length;

const sideAverage = (side: readonly Competitor[]): number => mean(side.map((p) => p.rating));

/** 1 for finishing ahead, 0.5 for a shared placing, 0 for finishing behind. */
const pairScore = (mine: number, theirs: number): number =>
	mine < theirs ? 1 : mine === theirs ? 0.5 : 0;

/**
 * Rating change for every player in a finished match.
 *
 * @param sides the players on each side
 * @param placements where each side finished, 1 being first; same length as `sides`
 * @returns player id → rating change
 */
export function computeDeltas(
	sides: readonly (readonly Competitor[])[],
	placements: readonly number[],
	config: RatingConfig = defaultRating
): Map<number, number> {
	if (sides.length < 2) throw new RangeError('A match needs at least two sides');
	if (placements.length !== sides.length) {
		throw new RangeError('Every side needs a placement');
	}
	if (sides.some((side) => side.length === 0)) throw new RangeError('A side cannot be empty');

	const averages = sides.map(sideAverage);
	const opponents = sides.length - 1;
	const deltas = new Map<number, number>();

	sides.forEach((side, i) => {
		for (const player of side) {
			let surprise = 0;
			averages.forEach((theirAverage, j) => {
				if (i === j) return;
				surprise +=
					pairScore(placements[i]!, placements[j]!) - expectedScore(player.rating, theirAverage);
			});
			deltas.set(player.id, Math.round((config.kFactor(player.games) * surprise) / opponents));
		}
	});
	return deltas;
}

/**
 * How likely each side is to win, for the pre-match preview. Sums to 1.
 * Empty sides are treated as unknown and get an even share.
 */
export function winChances(sides: readonly (readonly Competitor[])[]): number[] {
	if (sides.length < 2 || sides.some((side) => side.length === 0)) {
		return sides.map(() => 1 / Math.max(sides.length, 1));
	}
	const averages = sides.map(sideAverage);
	const pairs = (sides.length * (sides.length - 1)) / 2;
	return averages.map(
		(mine, i) =>
			averages.reduce((sum, theirs, j) => (i === j ? sum : sum + expectedScore(mine, theirs)), 0) /
			pairs
	);
}
