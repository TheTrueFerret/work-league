/**
 * The ladder every game and the championship share: Bronze up to Diamond.
 *
 * Thresholds are offsets from a game's starting rating, so everyone starts in
 * Silver and has to win to climb. Office ladders rarely spread more than a few
 * hundred points, so the steps are tight enough that Diamond is reachable but
 * rare.
 */

export const RANK_IDS = ['bronze', 'silver', 'gold', 'platinum', 'diamond'] as const;
export type RankId = (typeof RANK_IDS)[number];

export interface Rank {
	readonly id: RankId;
	readonly name: string;
	/** Points above (or below) the starting rating where this rank begins. */
	readonly from: number;
	/** The metal's base colour; the theme derives readable tones from it. */
	readonly colour: string;
}

/** Lowest first. */
export const RANKS: readonly Rank[] = [
	{ id: 'bronze', name: 'Bronze', from: -Infinity, colour: '#b0682e' },
	{ id: 'silver', name: 'Silver', from: -25, colour: '#8a96a3' },
	{ id: 'gold', name: 'Gold', from: 50, colour: '#d4a20f' },
	{ id: 'platinum', name: 'Platinum', from: 125, colour: '#1fa59a' },
	{ id: 'diamond', name: 'Diamond', from: 200, colour: '#3d8bfd' }
];

/** The rating where a rank begins in a game that starts at `start`. */
export const rankThreshold = (rank: Rank, start: number): number => start + rank.from;

export function rankFor(rating: number, start: number): Rank {
	let current = RANKS[0]!;
	for (const rank of RANKS) if (rating >= rankThreshold(rank, start)) current = rank;
	return current;
}

export interface RankProgress {
	readonly rank: Rank;
	readonly next: Rank | null;
	/** Rating points still needed for the next rank. */
	readonly toGo: number;
	/** 0–1 through the current rank, for a progress bar; 1 at Diamond. */
	readonly progress: number;
}

export function rankProgress(rating: number, start: number): RankProgress {
	const rank = rankFor(rating, start);
	const index = RANKS.indexOf(rank);
	const next = RANKS[index + 1] ?? null;
	if (!next) return { rank, next: null, toGo: 0, progress: 1 };

	const top = rankThreshold(next, start);
	// Bronze has no floor; measure it from one step below Silver.
	const floor = Number.isFinite(rank.from)
		? rankThreshold(rank, start)
		: rankThreshold(next, start) - 75;
	return {
		rank,
		next,
		toGo: Math.max(top - rating, 1),
		progress: Math.min(Math.max((rating - floor) / (top - floor), 0), 1)
	};
}
