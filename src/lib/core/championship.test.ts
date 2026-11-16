import { describe, expect, it } from 'vitest';
import { computeChampionship } from './championship';

const games = [
	{ id: 'pool', rating: { start: 1000 } },
	{ id: 'darts', rating: { start: 1000 } }
];
const players = [
	{ id: 1, name: 'Ada', active: true },
	{ id: 2, name: 'Linus', active: true },
	{ id: 3, name: 'Grace', active: true },
	{ id: 4, name: 'Old Timer', active: false }
];

describe('office championship', () => {
	it('includes every active player, played or not', () => {
		const table = computeChampionship(players, [], games);
		expect(table.map((e) => e.name)).toEqual(['Ada', 'Grace', 'Linus']);
		expect(table.every((e) => e.score === 1000)).toBe(true);
	});

	it('averages across games, counting unplayed games at the start rating', () => {
		const table = computeChampionship(
			players,
			[
				{ moduleId: 'pool', playerId: 1, rating: 1200, games: 10 },
				{ moduleId: 'pool', playerId: 2, rating: 1100, games: 5 },
				{ moduleId: 'darts', playerId: 2, rating: 1150, games: 5 }
			],
			games
		);
		expect(table[0]).toMatchObject({ name: 'Linus', score: 1125, games: 10 });
		expect(table[1]).toMatchObject({ name: 'Ada', score: 1100, games: 10 });
		expect(table[1]!.perGame.find((g) => g.moduleId === 'darts')).toMatchObject({
			played: false,
			rating: 1000
		});
	});

	it('counts an imported rating before the first match', () => {
		const table = computeChampionship(
			players,
			[{ moduleId: 'pool', playerId: 1, rating: 1300, games: 0 }],
			games
		);
		expect(table[0]).toMatchObject({ name: 'Ada', games: 0 });
		expect(table[0]!.perGame.find((g) => g.moduleId === 'pool')).toMatchObject({
			played: false,
			rated: true,
			rating: 1300
		});
	});

	it('ignores games that are switched off', () => {
		const table = computeChampionship(
			players,
			[{ moduleId: 'pingpong', playerId: 3, rating: 1500, games: 9 }],
			games
		);
		expect(table.find((e) => e.name === 'Grace')?.score).toBe(1000);
	});

	it('is empty when no games are switched on', () => {
		expect(computeChampionship(players, [], [])).toEqual([]);
	});
});
