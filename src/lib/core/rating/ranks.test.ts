import { describe, expect, it } from 'vitest';
import { rankFor, rankProgress, RANKS } from './ranks';

describe('ranks', () => {
	it('starts everyone in Silver', () => {
		expect(rankFor(1000, 1000).name).toBe('Silver');
	});

	it.each([
		[900, 'Bronze'],
		[974, 'Bronze'],
		[975, 'Silver'],
		[1049, 'Silver'],
		[1050, 'Gold'],
		[1125, 'Platinum'],
		[1199, 'Platinum'],
		[1200, 'Diamond'],
		[1800, 'Diamond']
	])('rates %i as %s', (rating, name) => {
		expect(rankFor(rating, 1000).name).toBe(name);
	});

	it('moves with a game that starts elsewhere', () => {
		expect(rankFor(1550, 1500).name).toBe('Gold');
	});

	it('is ordered lowest first', () => {
		expect(RANKS.map((r) => r.id)).toEqual(['bronze', 'silver', 'gold', 'platinum', 'diamond']);
	});

	it('reports progress to the next rank', () => {
		expect(rankProgress(1000, 1000)).toMatchObject({ next: { name: 'Gold' }, toGo: 50 });
		expect(rankProgress(1012.5, 1000).progress).toBeCloseTo(0.5, 5);
		expect(rankProgress(940, 1000)).toMatchObject({ rank: { name: 'Bronze' }, toGo: 35 });
		expect(rankProgress(1300, 1000)).toEqual(
			expect.objectContaining({ next: null, toGo: 0, progress: 1 })
		);
	});
});
