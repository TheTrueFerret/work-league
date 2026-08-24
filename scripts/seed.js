// Fills an empty database with a demo pool night. Run: npm run seed
import { addPlayer, close, leaderboard, recordMatch, stats } from '../src/lib/server/db.js';

if ((await stats()).players > 0) {
	console.error('Database is not empty — refusing to seed over existing data.');
	await close();
	process.exit(1);
}

const names = ['Ada', 'Linus', 'Grace', 'Ken', 'Margaret', 'Alan', 'Barbara', 'Dennis'];

/** @type {Record<string, number>} */
const id = {};
for (const name of names) id[name] = await addPlayer(name);

/** True skill levels, used only to make the fake results look plausible. */
const skill = {
	Ada: 0.8, Linus: 0.7, Grace: 0.65, Ken: 0.5,
	Margaret: 0.45, Alan: 0.4, Barbara: 0.35, Dennis: 0.3
};

/** @param {string[]} xs @param {number} n */
const pick = (xs, n) => [...xs].sort(() => Math.random() - 0.5).slice(0, n);
/** @param {string[]} team */
const strength = (team) => team.reduce((s, n) => s + skill[n], 0) / team.length;

for (let i = 0; i < 40; i++) {
	const size = Math.random() < 0.55 ? 1 : Math.random() < 0.8 ? 2 : 4;
	const chosen = pick(names, size * 2);
	const a = chosen.slice(0, size);
	const b = chosen.slice(size);

	const chanceA = strength(a) / (strength(a) + strength(b));
	await recordMatch(
		a.map((n) => id[n]),
		b.map((n) => id[n]),
		Math.random() < chanceA ? 'A' : 'B'
	);
}

console.log(`Seeded ${names.length} players and 40 matches.\n`);
for (const [i, p] of (await leaderboard()).entries()) {
	console.log(
		`${String(i + 1).padStart(2)}. ${p.name.padEnd(10)} ${String(p.rating).padStart(5)}` +
			`  ${p.wins}W-${p.losses}L  ${p.form}`
	);
}

await close();
