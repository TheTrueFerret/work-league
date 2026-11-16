interface Rated {
	readonly rating: number;
}

const average = (team: readonly Rated[]): number =>
	team.length ? team.reduce((sum, p) => sum + p.rating, 0) / team.length : 0;

/**
 * Splits players into the two fairest teams by average rating. Small groups are
 * solved exactly; large ones use a snake draft, which is close enough and instant.
 */
export function balanceTeams<T extends Rated>(players: readonly T[]): [T[], T[]] {
	if (players.length < 2) return [[...players], []];
	const half = Math.floor(players.length / 2);

	if (players.length > 14) {
		const sorted = [...players].sort((a, b) => b.rating - a.rating);
		const left = sorted.filter((_, i) => i % 4 === 0 || i % 4 === 3);
		return [left, sorted.filter((p) => !left.includes(p))];
	}

	let best: [T[], T[]] = [[], []];
	let bestGap = Infinity;
	const visit = (start: number, picked: number[]) => {
		if (picked.length === half) {
			const chosen = new Set(picked);
			const left = players.filter((_, i) => chosen.has(i));
			const right = players.filter((_, i) => !chosen.has(i));
			const gap = Math.abs(average(left) - average(right));
			if (gap < bestGap) {
				bestGap = gap;
				best = [left, right];
			}
			return;
		}
		for (let i = start; i < players.length; i++) visit(i + 1, [...picked, i]);
	};
	visit(0, []);
	return best;
}
