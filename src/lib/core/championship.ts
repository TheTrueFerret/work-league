/**
 * The office championship: one table with everyone in it.
 *
 * A player's score is the average of their ratings across every game in the
 * league, counting a game they have never played at its starting rating.
 * That keeps everyone on the table from day one, rewards being good across
 * games rather than just playing a lot, and stays in ELO units.
 */

export interface ChampionshipGame {
	readonly id: string;
	readonly rating: { readonly start: number };
}

export interface ChampionshipPlayer {
	readonly id: number;
	readonly name: string;
	readonly active: boolean;
}

export interface ChampionshipStanding {
	readonly moduleId: string;
	readonly playerId: number;
	readonly rating: number;
	readonly games: number;
}

export interface GameScore {
	readonly moduleId: string;
	readonly rating: number;
	readonly games: number;
	readonly played: boolean;
}

export interface ChampionshipEntry {
	readonly playerId: number;
	readonly name: string;
	readonly score: number;
	readonly games: number;
	readonly perGame: readonly GameScore[];
}

export function computeChampionship(
	players: readonly ChampionshipPlayer[],
	standings: readonly ChampionshipStanding[],
	games: readonly ChampionshipGame[]
): ChampionshipEntry[] {
	if (!games.length) return [];
	const lookup = new Map(standings.map((s) => [`${s.moduleId}:${s.playerId}`, s]));

	return players
		.filter((p) => p.active)
		.map((player) => {
			const perGame = games.map((game): GameScore => {
				const s = lookup.get(`${game.id}:${player.id}`);
				const played = !!s && s.games > 0;
				return {
					moduleId: game.id,
					rating: played ? s.rating : game.rating.start,
					games: played ? s.games : 0,
					played
				};
			});
			const score = perGame.reduce((sum, g) => sum + g.rating, 0) / perGame.length;
			return {
				playerId: player.id,
				name: player.name,
				score: Math.round(score * 10) / 10,
				games: perGame.reduce((sum, g) => sum + g.games, 0),
				perGame
			};
		})
		.sort(
			(a, b) =>
				b.score - a.score ||
				b.games - a.games ||
				a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
		);
}
