import { asc } from 'drizzle-orm';
import { requireAdmin } from '$lib/server/forms';
import { getDb } from '$lib/server/db/client';
import { matches, matchPlayers, players } from '$lib/server/db/schema';
import type { RequestHandler } from './$types';

/**
 * Everything the league has recorded, as one JSON file: people, matches and
 * who played where. Ratings are left out because they can be rebuilt from
 * this, and secrets are never included.
 */
export const GET: RequestHandler = async ({ locals }) => {
	requireAdmin(locals);
	const db = await getDb();
	const [people, played, lines] = await Promise.all([
		db.select().from(players).orderBy(asc(players.id)),
		db.select().from(matches).orderBy(asc(matches.playedAt), asc(matches.id)),
		db.select().from(matchPlayers)
	]);
	const { branding, modules } = locals.settings;
	const body = JSON.stringify(
		{
			format: 'work-league-export',
			version: 1,
			exportedAt: new Date().toISOString(),
			settings: { branding: { ...branding, logoVersion: undefined }, modules },
			players: people,
			matches: played.map((m) => ({ ...m, players: lines.filter((l) => l.matchId === m.id) }))
		},
		null,
		2
	);
	const date = new Date().toISOString().slice(0, 10);
	return new Response(body, {
		headers: {
			'content-type': 'application/json',
			'content-disposition': `attachment; filename="work-league-${date}.json"`
		}
	});
};
