import * as v from 'valibot';
import { defaultKFactor, DEFAULT_START_RATING } from '$lib/core/rating/elo';
import { UserError } from '$lib/core/errors';
import { defineModule } from '../types';

export interface PoolDetails {
	/** Index of the winning side. Absent on matches imported from Open Pottr. */
	winner?: 0 | 1;
}

/**
 * The original Work League game: any team size, one winner, nothing else to
 * record. Everything interesting happens in the rating.
 */
export default defineModule<PoolDetails>({
	id: 'pool',
	name: 'Pool',
	description: 'Singles or teams of any size. Record who won and watch the ladder move.',
	accent: '#3dcd58',
	icon: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z',
	format: { sides: { min: 2, max: 2 }, playersPerSide: { min: 1, max: 8 } },
	rating: {
		start: DEFAULT_START_RATING,
		kFactor: defaultKFactor
	},
	details: v.object({ winner: v.optional(v.picklist([0, 1])) }),
	resolve(details) {
		if (details.winner === undefined) throw new UserError('Pick the winning side');
		return details.winner === 0 ? [1, 2] : [2, 1];
	},
	Record: () => import('./Record.svelte')
});
