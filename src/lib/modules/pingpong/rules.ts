/**
 * Table tennis scoring, with no framework in sight so the browser (live
 * scorer) and the server (checking a submitted result) run the same code.
 *
 * A live match is stored as the setup plus every rally's winning side. All
 * state — scores, who serves, deuce, the winner — is derived by replaying that
 * list, which keeps undo trivial and lets the server verify every point.
 */
import { UserError } from '$lib/core/errors';

/** Index of a side: 0 is the first side picked, 1 the second. */
export type Side = 0 | 1;
export type PointsToWin = 11 | 21;
export type BestOf = 1 | 3 | 5 | 7;
/** A game's final score, side 0 first. */
export type GameScore = [number, number];

export interface PingPongSetup {
	readonly pointsToWin: PointsToWin;
	readonly bestOf: BestOf;
	/** Side serving the first rally of the match. */
	readonly firstServer: Side;
}

export type ScoresSetup = Pick<PingPongSetup, 'pointsToWin' | 'bestOf'>;

/** What is saved on a match. */
export type PingPongDetails =
	| { mode: 'live'; setup: PingPongSetup; points: Side[] }
	/** Game scores typed in afterwards, for matches played without the app. */
	| { mode: 'scores'; setup: ScoresSetup; games: GameScore[] };

/** A player position within a side: their index in that side's player list. */
export interface Server {
	readonly side: Side;
	/** Which of the side's two players serves; null in singles. */
	readonly slot: 0 | 1 | null;
}

export interface MatchState {
	/** Finished games, in order. */
	readonly games: readonly GameScore[];
	/** Score of the game in progress; 0–0 between games and once the match is over. */
	readonly score: GameScore;
	readonly gamesWon: GameScore;
	/** Zero-based index of the game in progress (equals games.length). */
	readonly gameIndex: number;
	/** Whether the game in progress is the last one possible. */
	readonly deciding: boolean;
	/** Who serves the next rally. */
	readonly server: Server;
	/** Level at pointsToWin-1 or beyond (10–10, 11–11…). */
	readonly deuce: boolean;
	/** The side one point from winning the game, if any. */
	readonly gamePoint: Side | null;
	/** The side one point from winning the match, if any. */
	readonly matchPoint: Side | null;
	/** The last point means the players should swap ends now. */
	readonly changeEnds: boolean;
	/** How many times the players have swapped ends, so a screen can mirror the table. */
	readonly ends: number;
	readonly finished: boolean;
	readonly winner: Side | null;
}

export const winsNeeded = (bestOf: number): number => Math.ceil(bestOf / 2);

const other = (side: Side): Side => (side === 0 ? 1 : 0);

/** Consecutive serves per player before deuce. */
const servesPerTurn = (pointsToWin: PointsToWin): number => (pointsToWin === 11 ? 2 : 5);

/** Score at which ends change in the deciding game: halfway, rounded down. */
const midGame = (pointsToWin: PointsToWin): number => (pointsToWin === 11 ? 5 : 10);

/** A game is won at pointsToWin or more with a two-point lead. */
export function gameWinner([a, b]: readonly [number, number], pointsToWin: number): Side | null {
	if (a >= pointsToWin && a - b >= 2) return 0;
	if (b >= pointsToWin && b - a >= 2) return 1;
	return null;
}

/**
 * Index of the serve turn the next rally belongs to. Serve changes every
 * `servesPerTurn` points, then every point once both reach pointsToWin-1.
 */
function serveTurn([a, b]: readonly [number, number], pointsToWin: PointsToWin): number {
	const every = servesPerTurn(pointsToWin);
	const deuceAt = pointsToWin - 1;
	if (a >= deuceAt && b >= deuceAt) {
		const turnsBefore = (2 * deuceAt) / every;
		return turnsBefore + (a + b - 2 * deuceAt);
	}
	return Math.floor((a + b) / every);
}

/**
 * Serve order for one game, one entry per serve turn, repeating. Each server
 * serves to the next entry in the list. The side serving first alternates
 * each game. In doubles the order is A1 → B1 → A2 → B2, with each side's
 * first-listed player starting the match; in later games the side serving
 * first leads with the player who received first in the previous game, which
 * the rules then force to receive from whoever served to them, giving the
 * same shape with the sides swapped.
 */
function serveCycle(firstSide: Side, doubles: boolean): Server[] {
	const o = other(firstSide);
	if (!doubles) {
		return [
			{ side: firstSide, slot: null },
			{ side: o, slot: null }
		];
	}
	return [
		{ side: firstSide, slot: 0 },
		{ side: o, slot: 0 },
		{ side: firstSide, slot: 1 },
		{ side: o, slot: 1 }
	];
}

/**
 * Replays a live match point by point.
 *
 * @param points the winning side of every rally, in order
 * @param doubles both sides have two players, so track which player serves
 * @throws UserError if a point is recorded after the match was won
 */
export function replay(setup: PingPongSetup, points: readonly Side[], doubles = false): MatchState {
	const { pointsToWin, bestOf } = setup;
	const need = winsNeeded(bestOf);
	const games: GameScore[] = [];
	const won: GameScore = [0, 0];
	let score: GameScore = [0, 0];
	let cycle = serveCycle(setup.firstServer, doubles);
	let changeEnds = false;
	let ends = 0;
	let winner: Side | null = null;

	for (const point of points) {
		if (winner !== null)
			throw new UserError('The match was already over; extra points were recorded');
		if (point !== 0 && point !== 1) throw new UserError('Every point must be won by side 0 or 1');
		changeEnds = false;
		score[point]++;

		const deciding = games.length === bestOf - 1;
		if (deciding && score[point] === midGame(pointsToWin) && score[other(point)] < score[point]) {
			// Halfway through the last possible game the players swap ends, and in
			// doubles the pair about to receive swaps its receiving order.
			changeEnds = true;
			ends++;
			if (doubles) {
				const turn = serveTurn(score, pointsToWin);
				const i = (turn + 1) % cycle.length;
				const j = (turn + 3) % cycle.length;
				cycle = [...cycle];
				[cycle[i], cycle[j]] = [cycle[j]!, cycle[i]!];
			}
		}

		if (gameWinner(score, pointsToWin) === point) {
			games.push(score);
			won[point]++;
			score = [0, 0];
			if (won[point] === need) {
				winner = point;
				changeEnds = false;
			} else {
				changeEnds = true;
				ends++;
				const firstSide: Side = (setup.firstServer + games.length) % 2 === 0 ? 0 : 1;
				cycle = serveCycle(firstSide, doubles);
			}
		}
	}

	const finished = winner !== null;
	const deuceAt = pointsToWin - 1;
	const gamePoint = finished ? null : sideOnGamePoint(score, pointsToWin);
	return {
		games,
		score,
		gamesWon: won,
		gameIndex: games.length,
		deciding: !finished && games.length === bestOf - 1,
		server: cycle[serveTurn(score, pointsToWin) % cycle.length]!,
		deuce: !finished && score[0] >= deuceAt && score[0] === score[1],
		gamePoint,
		matchPoint: gamePoint !== null && won[gamePoint] + 1 === need ? gamePoint : null,
		changeEnds,
		ends,
		finished,
		winner
	};
}

function sideOnGamePoint(score: GameScore, pointsToWin: number): Side | null {
	for (const side of [0, 1] as const) {
		const next: GameScore = [...score];
		next[side]++;
		if (gameWinner(next, pointsToWin) === side) return side;
	}
	return null;
}

/**
 * Checks game scores typed in after the fact and returns the winning side.
 * Each game needs a winner at pointsToWin with a two-point lead, exactly two
 * points if it went past pointsToWin, and the match must stop the moment a
 * side has won enough games.
 *
 * @throws UserError describing the first impossible game
 */
export function validateGames(
	setup: ScoresSetup,
	games: readonly (readonly [number, number])[]
): Side {
	const { pointsToWin, bestOf } = setup;
	const need = winsNeeded(bestOf);
	const won: GameScore = [0, 0];
	if (!games.length) throw new UserError('Enter at least one game');

	for (const [i, [a, b]] of games.entries()) {
		const label = `Game ${i + 1}`;
		if (!Number.isInteger(a) || !Number.isInteger(b) || a < 0 || b < 0) {
			throw new UserError(`${label}: scores must be whole numbers`);
		}
		if (won[0] === need || won[1] === need) {
			throw new UserError(`The match was decided before game ${i + 1}`);
		}
		const high = Math.max(a, b);
		const low = Math.min(a, b);
		if (high < pointsToWin)
			throw new UserError(`${label}: someone needs ${pointsToWin} points to win`);
		if (high - low < 2) throw new UserError(`${label}: a game is won by two clear points`);
		if (high > pointsToWin && high - low !== 2) {
			throw new UserError(
				`${label}: past ${pointsToWin}, a game ends as soon as someone leads by two`
			);
		}
		won[a > b ? 0 : 1]++;
	}

	if (won[0] === need) return 0;
	if (won[1] === need) return 1;
	throw new UserError(`The match isn't finished: someone needs to win ${need} games`);
}

/** The games of a match, whichever way it was recorded. */
export function gamesOf(details: PingPongDetails): readonly GameScore[] {
	return details.mode === 'live' ? replay(details.setup, details.points).games : details.games;
}

/** The winning side of a finished match. */
export function matchWinner(details: PingPongDetails): Side {
	if (details.mode === 'scores') return validateGames(details.setup, details.games);
	const state = replay(details.setup, details.points);
	if (state.winner === null) throw new UserError("The match isn't finished yet");
	return state.winner;
}

/** "11–7 · 9–11 · 11–5", side 0's points first. */
export const formatGames = (games: readonly GameScore[]): string =>
	games.map(([a, b]) => `${a}–${b}`).join(' · ');

/** A game that reached pointsToWin-1 all, whatever order the points came in. */
export const wentToDeuce = ([a, b]: GameScore, pointsToWin: number): boolean =>
	Math.min(a, b) >= pointsToWin - 1;
