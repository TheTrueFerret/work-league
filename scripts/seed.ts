// Fills an empty database with a demo office: people and a few weeks of
// matches in every installed game. Run: npm run seed
//
// Results are generated from hidden "true" skill levels so the rankings look
// plausible, and every match goes through the same validation as the app.
import { eq } from 'drizzle-orm';
import { installedModules } from '$lib/modules/registry';
import type { GameModule } from '$lib/modules/types';
import { closeDatabase, getDb } from '$lib/server/db/client';
import { matches } from '$lib/server/db/schema';
import { recordMatch } from '$lib/server/repositories/matches';
import { addPlayer, listPlayers } from '$lib/server/repositories/players';
import { demoMatch } from './seed-games';

if ((await listPlayers()).length > 0) {
	console.error('The database already has people in it. Refusing to seed over real data.');
	await closeDatabase();
	process.exit(1);
}

const people: Record<string, number> = {
	Ada: 0.82,
	Linus: 0.7,
	Grace: 0.66,
	Ken: 0.55,
	Margaret: 0.5,
	Alan: 0.44,
	Barbara: 0.38,
	Dennis: 0.3
};

const ids = new Map<number, number>();
for (const [name, skill] of Object.entries(people)) ids.set(await addPlayer(name), skill);
const skillOf = (id: number) => ids.get(id) ?? 0.5;

const db = await getDb();
const DAY = 24 * 60 * 60 * 1000;
let recorded = 0;

for (const game of installedModules) {
	const count = game.id === 'pool' ? 40 : 24;
	for (let i = 0; i < count; i++) {
		const match = demoMatch(game as GameModule, [...ids.keys()], skillOf);
		if (!match) continue;
		const id = await recordMatch(game, match);
		recorded++;
		// Spread results over the past four weeks, oldest first.
		const playedAt = new Date(Date.now() - (count - i) * (28 / count) * DAY);
		await db.update(matches).set({ playedAt }).where(eq(matches.id, id));
	}
}

console.log(
	`Seeded ${ids.size} people and ${recorded} matches across ${installedModules.length} games.`
);
await closeDatabase();
