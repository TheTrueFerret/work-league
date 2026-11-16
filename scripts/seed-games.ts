// Demo match generators for the seed script, one per game module.
import {
	applyTurn,
	canCheckout,
	newMatch,
	possibleTotal,
	type TotalTurn
} from '$lib/modules/darts/x01';
import { replay, type Side } from '$lib/modules/pingpong/rules';
import type { GameModule, MatchSubmission } from '$lib/modules/types';

type Skill = (playerId: number) => number;

export const shuffle = <T>(items: readonly T[]): T[] => [...items].sort(() => Math.random() - 0.5);

const strength = (side: readonly number[], skill: Skill) =>
	side.reduce((sum, id) => sum + skill(id), 0) / side.length;

/** Probability that side A beats side B, from hidden skill levels. */
export const chance = (a: readonly number[], b: readonly number[], skill: Skill) =>
	strength(a, skill) / (strength(a, skill) + strength(b, skill));

function pool(players: number[], skill: Skill): MatchSubmission {
	const size = Math.random() < 0.55 ? 1 : Math.random() < 0.8 ? 2 : 3;
	const chosen = shuffle(players).slice(0, size * 2);
	const a = chosen.slice(0, size);
	const b = chosen.slice(size);
	return { sides: [a, b], details: { winner: Math.random() < chance(a, b, skill) ? 0 : 1 } };
}

/** A live, point-by-point match, so the demo includes serve and deuce data. */
function pingpong(players: number[], skill: Skill): MatchSubmission {
	const size = Math.random() < 0.75 ? 1 : 2;
	const chosen = shuffle(players).slice(0, size * 2);
	const sides = [chosen.slice(0, size), chosen.slice(size)];
	// Rallies are closer than matches: squash the skill gap towards 50/50.
	const rally = 0.5 + (chance(sides[0]!, sides[1]!, skill) - 0.5) * 0.45;
	const setup = { pointsToWin: 11, bestOf: Math.random() < 0.7 ? 3 : 5, firstServer: 0 } as const;
	const points: Side[] = [];
	while (!replay(setup, points, size === 2).finished) points.push(Math.random() < rally ? 0 : 1);
	return { sides, details: { mode: 'live', setup, points } };
}

/** A 501 match thrown turn by turn, singles or a small free-for-all. */
function darts(players: number[], skill: Skill): MatchSubmission {
	const count = Math.random() < 0.7 ? 2 : 3;
	const sides = shuffle(players)
		.slice(0, count)
		.map((id) => [id]);
	const setup = {
		startScore: 501,
		doubleIn: false,
		doubleOut: true,
		legsToWin: Math.random() < 0.6 ? 2 : 3,
		layout: sides.map(() => 1)
	} as const;
	const state = newMatch(setup, sides);
	const turns: TotalTurn[] = [];

	while (!state.finished && state.current) {
		const s = skill(sides[state.current.side]![0]!);
		const remaining = state.sides[state.current.side]!.remaining;
		let turn: TotalTurn;
		if (canCheckout(remaining, 3, true) && Math.random() < 0.15 + s * 0.45) {
			turn = { total: remaining, darts: 3, doubleFinish: true };
		} else {
			// Three-dart scores around 25–70 depending on skill, kept below a bust.
			let total = Math.round(25 + s * 45 + (Math.random() - 0.5) * 50);
			total = Math.max(0, Math.min(total, 180, remaining - 2));
			while (total > 0 && !possibleTotal(total)) total--;
			turn = { total };
		}
		applyTurn(state, turn);
		turns.push(turn);
	}
	return { sides, details: { setup, turns } };
}

const generators: Record<string, (players: number[], skill: Skill) => MatchSubmission | null> = {
	pool,
	pingpong,
	darts
};

export function demoMatch(game: GameModule, players: number[], skill: Skill) {
	return generators[game.id]?.(players, skill) ?? null;
}
