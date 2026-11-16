/** A player's running record in one game, folded match by match. */
export interface Standing {
	readonly playerId: number;
	readonly rating: number;
	readonly games: number;
	readonly wins: number;
	readonly losses: number;
	readonly peak: number;
	/** Positive for a winning run, negative for a losing one. */
	readonly streak: number;
	/** Up to five recent results, most recent last, e.g. `WWLWL`. */
	readonly form: string;
	readonly lastPlayed: Date | null;
}

export const FORM_LENGTH = 5;

export const blankStanding = (playerId: number, start: number): Standing => ({
	playerId,
	rating: start,
	games: 0,
	wins: 0,
	losses: 0,
	peak: start,
	streak: 0,
	form: '',
	lastPlayed: null
});

/** Folds one result into a standing. Winning means finishing first. */
export function advanceStanding(
	standing: Standing,
	won: boolean,
	delta: number,
	playedAt: Date
): Standing {
	const rating = standing.rating + delta;
	return {
		playerId: standing.playerId,
		rating,
		games: standing.games + 1,
		wins: standing.wins + (won ? 1 : 0),
		losses: standing.losses + (won ? 0 : 1),
		peak: Math.max(standing.peak, rating),
		streak: won ? Math.max(standing.streak, 0) + 1 : Math.min(standing.streak, 0) - 1,
		form: (standing.form + (won ? 'W' : 'L')).slice(-FORM_LENGTH),
		lastPlayed: playedAt
	};
}
