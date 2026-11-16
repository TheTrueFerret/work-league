import * as v from 'valibot';

const side = v.picklist([0, 1]);
const pointsToWin = v.picklist([11, 21]);
const bestOf = v.picklist([1, 3, 5, 7]);
const score = v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(999));

/** The live scorer's setup; also checks a game restored from storage. */
export const setupSchema = v.object({ pointsToWin, bestOf, firstServer: side });

/**
 * Far more rallies than any real best of 7 needs, so a bloated or hostile
 * submission is refused before it is replayed.
 */
const MAX_POINTS = 2000;

export const detailsSchema = v.variant('mode', [
	v.object({
		mode: v.literal('live'),
		setup: setupSchema,
		points: v.pipe(v.array(side), v.maxLength(MAX_POINTS))
	}),
	v.object({
		mode: v.literal('scores'),
		setup: v.object({ pointsToWin, bestOf }),
		games: v.pipe(v.array(v.tuple([score, score])), v.maxLength(7))
	})
]);
