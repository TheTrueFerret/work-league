// Shared ELO engine — imported by both the server and the browser (for live previews).
//
// Team matches are handled by rating every player against the *average* of the
// opposing team. That is what makes an upset pay: a 900-rated player who beats a
// 1400-rated team gains far more than their own 1400-rated teammate does.

export const START_RATING = 1000;

export interface RatedPlayer {
	id: number;
	rating: number;
	games: number;
}

/**
 * New players move fast so they find their level; veterans settle down.
 * @param {number} games
 */
export function kFactor(games: number): number {
	if (games < 10) return 40;
	if (games < 30) return 28;
	return 20;
}

/**
 * Probability that `rating` beats `oppRating`.
 * @param {number} rating
 * @param {number} oppRating
 */
export function expectedScore(rating: number, oppRating: number): number {
	return 1 / (1 + Math.pow(10, (oppRating - rating) / 400));
}

/** @param {number[]} xs */
const mean = (xs: number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length;

/**
 * @typedef {{ id: number, rating: number, games: number }} Rated
 * @param {Rated[]} teamA
 * @param {Rated[]} teamB
 * @param {'A' | 'B'} winner
 * @returns {Map<number, number>} player id -> rating change
 */
export function computeDeltas(
	teamA: RatedPlayer[],
	teamB: RatedPlayer[],
	winner: 'A' | 'B'
): Map<number, number> {
	const avgA = mean(teamA.map((p) => p.rating));
	const avgB = mean(teamB.map((p) => p.rating));

	/** @type {Map<number, number>} */
	const deltas = new Map();

	const outcomes: Array<[RatedPlayer[], number, number]> = [
		[teamA, avgB, winner === 'A' ? 1 : 0],
		[teamB, avgA, winner === 'B' ? 1 : 0]
	];
	for (const [team, oppAvg, score] of outcomes) {
		for (const p of team) {
			const expected = expectedScore(p.rating, oppAvg);
			deltas.set(p.id, Math.round(kFactor(p.games) * (score - expected)));
		}
	}
	return deltas;
}

/**
 * Win probability for team A, used for the pre-match preview.
 * @param {Rated[]} teamA
 * @param {Rated[]} teamB
 */
export function teamWinChance(teamA: RatedPlayer[], teamB: RatedPlayer[]): number {
	if (!teamA.length || !teamB.length) return 0.5;
	return expectedScore(mean(teamA.map((p) => p.rating)), mean(teamB.map((p) => p.rating)));
}

/**
 * A friendly title for a rating, purely cosmetic.
 * @param {number} rating
 */
export function tier(rating: number): string {
	if (rating >= 1400) return 'Shark';
	if (rating >= 1250) return 'Hustler';
	if (rating >= 1100) return 'Regular';
	if (rating >= 950) return 'Casual';
	return 'Rookie';
}
