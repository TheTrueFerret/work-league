// Rating engine checks. Pure maths — no database needed. Run: npm test
import { computeDeltas, expectedScore, kFactor, tier, START_RATING } from '../src/lib/modules/pool/rating.ts';

let failures = 0;

/**
 * @param {string} label
 * @param {boolean} cond
 * @param {string} [detail]
 */
const check = (label, cond, detail = '') => {
	console.log(`${cond ? '  ok  ' : ' FAIL '} ${label}${detail ? '  ' + detail : ''}`);
	if (!cond) failures++;
};

/** @param {number} rating @param {number} games */
const p = (id, rating, games = 50) => ({ id, rating, games });

// --- The headline property: upsets pay more than expected wins ---------------
const upset = computeDeltas([p(1, 900)], [p(2, 1400)], 'A').get(1);
const expected = computeDeltas([p(1, 1400)], [p(2, 900)], 'A').get(1);

check('underdog beating a favourite gains more', upset > expected, `+${upset} vs +${expected}`);
check('an upset is worth most of a full K', upset > 18, `+${upset}`);
check('a favourite beating a nobody gains almost nothing', expected <= 2, `+${expected}`);

const even = computeDeltas([p(1, 1200)], [p(2, 1200)], 'A');
check('an even match is worth half of K', even.get(1) === 10, `+${even.get(1)}`);
check('the loser drops what the winner gains', even.get(2) === -10, `${even.get(2)}`);

// --- Team play: the weak link on a winning team earns the most ---------------
const mixed = computeDeltas([p(1, 800), p(2, 1600)], [p(3, 1200), p(4, 1200)], 'A');
check(
	'weaker teammate gains more than the strong one',
	mixed.get(1) > mixed.get(2),
	`+${mixed.get(1)} vs +${mixed.get(2)}`
);
check('every player on a winning team gains', mixed.get(1) > 0 && mixed.get(2) > 0);
check('every player on a losing team drops', mixed.get(3) < 0 && mixed.get(4) < 0);

// A 4v4 is rated the same way as a 1v1 against the opposing average.
const big = computeDeltas(
	[p(1, 1000), p(2, 1000), p(3, 1000), p(4, 1000)],
	[p(5, 1200), p(6, 1200), p(7, 1200), p(8, 1200)],
	'A'
);
const solo = computeDeltas([p(1, 1000)], [p(5, 1200)], 'A');
check('a 4v4 rates each player against the opposing average', big.get(1) === solo.get(1));

// --- K factor ----------------------------------------------------------------
check('newcomers move fastest', kFactor(0) === 40);
check('regulars settle down', kFactor(15) === 28);
check('veterans are stable', kFactor(100) === 20);

const rookie = computeDeltas([p(1, 1000, 0)], [p(2, 1000, 0)], 'A').get(1);
const veteran = computeDeltas([p(1, 1000, 99)], [p(2, 1000, 99)], 'A').get(1);
check('newcomers find their level faster', rookie > veteran, `+${rookie} vs +${veteran}`);

// --- Expected score ----------------------------------------------------------
check('an even matchup is a coin flip', expectedScore(1000, 1000) === 0.5);
check('400 points of advantage is roughly 10:1', Math.abs(expectedScore(1400, 1000) - 10 / 11) < 1e-9);
check('expectations are symmetric', Math.abs(expectedScore(900, 1300) + expectedScore(1300, 900) - 1) < 1e-9);

// --- Cosmetics ---------------------------------------------------------------
check('everyone starts as a Casual', tier(START_RATING) === 'Casual');
check('the top of the ladder are Sharks', tier(1500) === 'Shark');
check('the bottom of the ladder are Rookies', tier(800) === 'Rookie');

console.log(failures ? `\n${failures} check(s) failed` : '\nAll rating checks passed');
process.exit(failures ? 1 : 0);
