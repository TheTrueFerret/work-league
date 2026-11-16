import * as v from 'valibot';
import { defaultKFactor, DEFAULT_START_RATING } from '$lib/core/rating/elo';
import { UserError } from '$lib/core/errors';
import { defineModule, type StatLine } from '../types';
import {
	layoutSides,
	MAX_LEGS_TO_WIN,
	replay,
	SEGMENTS,
	START_SCORES,
	type Turn,
	type X01Setup
} from './x01';

/** Everything needed to replay a match: the rules and every turn, in order. */
export interface DartsDetails {
	readonly setup: X01Setup;
	readonly turns: readonly Turn[];
}

/** Generous: 701, first to 7, eight players is still well under this. */
const MAX_TURNS = 5000;

const int = (min: number, max: number) =>
	v.pipe(v.number(), v.integer(), v.minValue(min), v.maxValue(max));

const DartSchema = v.object({ segment: v.picklist(SEGMENTS), multiplier: v.picklist([1, 2, 3]) });

const TurnSchema = v.union([
	v.object({
		total: int(0, 180),
		darts: v.optional(v.picklist([1, 2, 3])),
		doubleFinish: v.optional(v.boolean())
	}),
	v.object({ darts: v.pipe(v.array(DartSchema), v.minLength(1), v.maxLength(3)) })
]);

const SetupSchema = v.object({
	startScore: v.picklist(START_SCORES),
	doubleIn: v.boolean(),
	doubleOut: v.boolean(),
	legsToWin: int(1, MAX_LEGS_TO_WIN),
	layout: v.pipe(v.array(int(1, 2)), v.minLength(2), v.maxLength(8))
});

const average = (points: number, darts: number): string =>
	darts ? ((points / darts) * 3).toFixed(1) : '–';

/**
 * X01 darts: 301, 501 or 701, singles, doubles or a free-for-all of up to
 * eight. The browser keeps every turn and the server replays them, so the
 * result and every stat come from the same throws.
 */
export default defineModule<DartsDetails>({
	id: 'darts',
	name: 'Darts',
	description:
		'501 and friends, singles to eight-player free-for-alls, with a scorer that knows your checkouts.',
	accent: '#e53935',
	icon: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 16.5a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9ZM12 12h.01M12 12l7-7M17 3l2 2 2-2M19 5V3',
	format: { sides: { min: 2, max: 8 }, playersPerSide: { min: 1, max: 2 } },
	rating: {
		start: DEFAULT_START_RATING,
		kFactor: defaultKFactor,
		tiers: [
			{ min: 1400, name: 'Nine-darter' },
			{ min: 1250, name: 'Ton-eighty' },
			{ min: 1100, name: 'Oche regular' },
			{ min: 950, name: 'Double trouble' },
			{ min: -Infinity, name: 'Bed of nails' }
		]
	},
	details: v.object({
		setup: SetupSchema,
		turns: v.pipe(v.array(TurnSchema), v.maxLength(MAX_TURNS))
	}),

	resolve(details, sides) {
		const state = replay(details.setup, sides, details.turns);
		if (!state.finished || !state.placements)
			throw new UserError('Finish the match before saving it');
		return state.placements;
	},

	summarize({ setup, turns }) {
		try {
			const state = replay(setup, layoutSides(setup), turns);
			// Winner's legs first, matching how history and profiles order the sides.
			const legs = state.sides.map((s) => s.legs).sort((a, b) => b - a);
			if (legs.length === 2) return `${setup.startScore} · ${legs[0]}–${legs[1]} legs`;
			const played = state.legs.length;
			return `${setup.startScore} · ${played} leg${played === 1 ? '' : 's'}`;
		} catch {
			return `${setup.startScore}`;
		}
	},

	playerStats(entries) {
		let darts = 0;
		let points = 0;
		let first9Darts = 0;
		let first9Points = 0;
		let oneEighties = 0;
		let highestCheckout = 0;
		let chances = 0;
		let hits = 0;
		let bestLeg: number | null = null;

		for (const entry of entries) {
			const index = entry.sides[entry.side]?.indexOf(entry.playerId) ?? -1;
			if (index < 0) continue;
			let stats;
			try {
				stats = replay(entry.details.setup, entry.sides, entry.details.turns).sides[entry.side]
					?.players[index];
			} catch {
				continue;
			}
			if (!stats) continue;
			darts += stats.darts;
			points += stats.points;
			first9Darts += stats.first9Darts;
			first9Points += stats.first9Points;
			oneEighties += stats.oneEighties;
			highestCheckout = Math.max(highestCheckout, stats.highestCheckout);
			chances += stats.checkoutChances;
			hits += stats.checkoutHits;
			if (stats.bestLeg !== null)
				bestLeg = bestLeg === null ? stats.bestLeg : Math.min(bestLeg, stats.bestLeg);
		}
		if (!darts) return [];

		const lines: StatLine[] = [
			{ label: '3-dart average', value: average(points, darts) },
			{ label: 'First-9 average', value: average(first9Points, first9Darts) },
			{ label: '180s', value: String(oneEighties) },
			{ label: 'Highest checkout', value: highestCheckout ? String(highestCheckout) : '–' },
			{
				label: 'Checkout rate',
				value: chances ? `${Math.round((hits / chances) * 100)}% (${hits}/${chances})` : '–'
			},
			{ label: 'Best leg', value: bestLeg === null ? '–' : `${bestLeg} darts` }
		];
		return lines;
	},

	Record: () => import('./Record.svelte')
});
