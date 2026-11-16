import { computeChampionship } from '$lib/core/championship';
import { allStandings } from './repositories/matches';
import { listPlayers } from './repositories/players';

export async function loadChampionship(locals: App.Locals) {
	const [players, standings] = await Promise.all([listPlayers(), allStandings()]);
	return computeChampionship(players, standings, locals.games);
}
