import { defaultKFactor, DEFAULT_START_RATING } from '$lib/core/rating/elo';
import { percent } from '$lib/core/format';
import { defineModule, type StatLine } from '../types';
import { detailsSchema } from './schema';
import {
	formatGames,
	gamesOf,
	matchWinner,
	wentToDeuce,
	type GameScore,
	type PingPongDetails,
	type Side
} from './rules';

export type { PingPongDetails } from './rules';

/**
 * Table tennis, singles or doubles. Matches are scored rally by rally on a
 * phone at the table, or typed in afterwards as game scores.
 */
export default defineModule<PingPongDetails>({
	id: 'pingpong',
	name: 'Ping pong',
	description:
		'Singles or doubles, scored point by point at the table. Deuce, serves and ends tracked for you.',
	accent: '#ff7a1a',
	// A paddle seen face-on with its handle, and a ball beside it.
	icon: 'M13.5 13.5a6 6 0 1 0-8.5-8.5 6 6 0 0 0 8.5 8.5ZM13.5 13.5l1.4 1.4M14.2 16.6l2.1-2.1 4.3 4.3a1.5 1.5 0 0 1-2.1 2.1ZM19 7.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z',
	format: { sides: { min: 2, max: 2 }, playersPerSide: { min: 1, max: 2 } },
	rating: {
		start: DEFAULT_START_RATING,
		kFactor: defaultKFactor
	},
	details: detailsSchema,
	resolve(details) {
		return matchWinner(details) === 0 ? [1, 2] : [2, 1];
	},
	summarize(details) {
		return formatGames(safeGames(details)) || null;
	},
	playerStats(entries) {
		let games = 0;
		let gamesWon = 0;
		let points = 0;
		let pointsWon = 0;
		let deuces = 0;
		let deucesWon = 0;
		let comebacks = 0;

		for (const { details, side, placement } of entries) {
			const list = safeGames(details);
			const me: Side = side === 0 ? 0 : 1;
			const them: Side = me === 0 ? 1 : 0;
			for (const g of list) {
				games++;
				points += g[me] + g[them];
				pointsWon += g[me];
				if (g[me] > g[them]) gamesWon++;
				if (wentToDeuce(g, details.setup.pointsToWin)) {
					deuces++;
					if (g[me] > g[them]) deucesWon++;
				}
			}
			// Quick-entry matches have game scores too, so both kinds count here.
			const first = list[0];
			if (placement === 1 && first && first[them] > first[me]) comebacks++;
		}

		if (!games) return [];
		const stats: StatLine[] = [
			{ label: 'Games won', value: `${percent(gamesWon, games)} of ${games}` },
			{ label: 'Points won', value: `${percent(pointsWon, points)} of ${points}` },
			{ label: 'Deuce games won', value: deuces ? `${deucesWon} of ${deuces}` : '–' },
			{ label: 'Comeback wins', value: String(comebacks) }
		];
		return stats;
	},
	Record: () => import('./Record.svelte')
});

/** Games of a stored match; a match that no longer replays counts for nothing. */
function safeGames(details: PingPongDetails): readonly GameScore[] {
	try {
		return gamesOf(details);
	} catch {
		return [];
	}
}
