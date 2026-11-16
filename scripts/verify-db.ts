// Integration checks against a real Postgres. Run: npm run test:db
//
// This WIPES the players, matches, participants and standings tables, so it
// deliberately refuses to touch the database the app itself is configured with.
import { START_RATING } from '../src/lib/modules/pool';

const url = process.env.TEST_DATABASE_URL;
if (!url) {
	console.error(
		'Set TEST_DATABASE_URL to a throwaway Postgres database.\n' +
			'These checks delete every row, so never point it at real data.\n\n' +
			'  docker run -d --name work-league-pg -p 5433:5432 -e POSTGRES_PASSWORD=workleague postgres:16\n' +
			'  export TEST_DATABASE_URL=postgres://postgres:workleague@localhost:5433/postgres\n'
	);
	process.exit(1);
}
if (process.env.DATABASE_URL && process.env.DATABASE_URL === url) {
	console.error('TEST_DATABASE_URL must differ from DATABASE_URL — refusing to wipe live data.');
	process.exit(1);
}

process.env.DATABASE_URL = url;

const db = await import('../src/lib/modules/pool/server/repository');
const { matches, participants, players, standings } = await import('../src/lib/server/schema');

let failures = 0;

/**
 * @param {string} label
 * @param {boolean} cond
 * @param {string} [detail]
 */
const check = (label, cond, detail = '') => {
	console.log(`${cond ? '  ok  ' : ' FAIL '} ${label}${detail ? '  ' + detail : ''}`);
	if (!cond) failures++;
};

/** @param {string} label @param {() => Promise<unknown>} fn */
const rejects = async (label, fn) => {
	try {
		await fn();
		check(label, false, 'no error thrown');
	} catch {
		check(label, true);
	}
};

const raw = db.getDb();
await raw.delete(participants);
await raw.delete(standings);
await raw.delete(matches);
await raw.delete(players);

// --- Players -----------------------------------------------------------------
const id = {};
for (const name of ['Ada', 'Linus', 'Grace', 'Ken']) id[name] = await db.addPlayer(name);

let board = await db.leaderboard();
check('players are created', board.length === 4);
check('new players start at the base rating', board.every((p) => p.rating === START_RATING));
check('new players have a standings row', board.every((p) => p.games === 0));

await rejects('duplicate names are rejected', () => db.addPlayer('ada'));
await rejects('blank names are rejected', () => db.addPlayer('   '));

// --- Matches -----------------------------------------------------------------
await db.recordMatch([id.Ada, id.Grace], [id.Linus, id.Ken], 'A');
await db.recordMatch([id.Ada, id.Grace], [id.Linus, id.Ken], 'A');

board = await db.leaderboard();
const by = (n) => board.find((p) => p.name === n);

check('winners are ranked above losers', board[0].rating > board[3].rating);
check('the ladder is sorted by rating', board.every((p, i) => i === 0 || board[i - 1].rating >= p.rating));
check('records are tallied', by('Ada').wins === 2 && by('Ada').losses === 0);
check('a win streak is tracked', by('Ada').streak === 2, `${by('Ada').streak}`);
check('a losing streak is negative', by('Ken').streak === -2, `${by('Ken').streak}`);
check('recent form is recorded', by('Ken').form === 'LL', by('Ken').form);
check('peak rating is kept', by('Ada').peak === by('Ada').rating);
check('the last played time is stamped', by('Ada').lastPlayed instanceof Date);

const afterTwo = by('Ada').rating;

// The stored per-match numbers must agree with the standings.
const log = await db.history();
check('history returns both matches', log.length === 2);
check('history splits the teams', log[0].teamA.length === 2 && log[0].teamB.length === 2);
check('history marks the winner', log[0].winner === 'A');
check(
	'match deltas add up to the current rating',
	log.reduce((sum, m) => sum + (m.teamA.find((l) => l.name === 'Ada')?.delta ?? 0), START_RATING) ===
		afterTwo
);

// --- Deleting replays history ------------------------------------------------
await db.deleteMatch(log[0].id);
board = await db.leaderboard();
check('deleting a match rewinds the ratings', by('Ada').rating < afterTwo);
check('deleting a match rewinds the record', by('Ada').wins === 1);
check('deleting a match rewinds the form', by('Ada').form === 'W', by('Ada').form);

await db.deleteMatch((await db.history())[0].id);
board = await db.leaderboard();
check('deleting every match restores the base rating', board.every((p) => p.rating === START_RATING));
check('deleting every match clears the games played', board.every((p) => p.games === 0));
check('deleting every match clears the form', board.every((p) => p.form === ''));

// --- Guard rails -------------------------------------------------------------
await rejects('a player cannot be on both teams', () => db.recordMatch([id.Ada], [id.Ada], 'A'));
await rejects('a team cannot be empty', () => db.recordMatch([id.Ada], [], 'A'));
await rejects('unknown players are rejected', () => db.recordMatch([id.Ada], [987654], 'A'));

await db.recordMatch([id.Ada], [id.Linus], 'A');
await rejects('a player with matches cannot be deleted', () => db.deletePlayer(id.Ada));

// A failed write must leave nothing behind.
const countBefore = (await db.stats()).matches;
await rejects('an invalid match is rejected', () => db.recordMatch([id.Ada], [id.Ada], 'A'));
check('a rejected match is not recorded', (await db.stats()).matches === countBefore);

// --- Player admin ------------------------------------------------------------
await db.renamePlayer(id.Grace, 'Grace H');
check('players can be renamed', (await db.leaderboard()).some((p) => p.name === 'Grace H'));
await rejects('renaming onto a taken name is rejected', () => db.renamePlayer(id.Grace, 'ada'));

await db.setPlayerActive(id.Ken, false);
check('archived players leave the match picker', (await db.activePlayers()).every((p) => p.name !== 'Ken'));
check('archived players stay on the ladder', (await db.leaderboard()).some((p) => p.name === 'Ken'));

await db.deletePlayer(id.Ken);
check('players without matches can be deleted', (await db.leaderboard()).every((p) => p.name !== 'Ken'));

// --- Profile -----------------------------------------------------------------
const profile = await db.playerProfile(id.Ada);
check('a profile is returned', profile !== null);
check('the profile counts matches', profile.matches.length === 1);
check('the profile lists opponents', profile.opponents.some((o) => o.name === 'Linus'));
check('the rating curve starts at the base rating', profile.curve[0] === START_RATING);
check('the rating curve ends at the current rating', profile.curve.at(-1) === profile.player.rating);
check('an unknown player has no profile', (await db.playerProfile(987654)) === null);

await db.close();
console.log(failures ? `\n${failures} check(s) failed` : '\nAll database checks passed');
process.exit(failures ? 1 : 0);
