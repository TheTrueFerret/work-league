import { AsyncLocalStorage } from 'node:async_hooks';
import { and, asc, count, desc, eq, inArray, ne, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { START_RATING, computeDeltas } from '../elo.js';
import { matches, participants, players, standings } from './schema.js';

/** @typedef {ReturnType<typeof postgres>} Client */

/**
 * Cloudflare Workers forbid reusing a socket across requests ("Cannot perform
 * I/O on behalf of a different request"), so on Workers each request gets its
 * own connection held here. Under Node a single long-lived pool is better, and
 * that lives in the module-level pair below.
 * @type {AsyncLocalStorage<{ url: string, client?: Client, db?: ReturnType<typeof drizzle> }>}
 */
const scope = new AsyncLocalStorage();

/** @type {Client | undefined} */
let client;
/** @type {ReturnType<typeof drizzle> | undefined} */
let database;
/** @type {string | undefined} */
let configured;

const tables = { matches, participants, players, standings };

/**
 * @param {string} url
 * @param {number} max how many sockets this pool may open
 */
const pool = (url, max) =>
	postgres(url, {
		// Supabase's transaction pooler cannot reuse prepared statements.
		prepare: false,
		// Skip the type-OID lookup on connect; every column here is a built-in.
		fetch_types: false,
		max,
		connect_timeout: 10
	});

/**
 * Supplies the connection string from outside `process.env`, which is how
 * Cloudflare Workers deliver secrets. Safe to call on every request.
 * @param {string | undefined} url
 */
export function useDatabaseUrl(url) {
	if (url && url !== configured) {
		configured = url;
		// Drop any pool built against the previous URL.
		client = undefined;
		database = undefined;
	}
}

/**
 * Gives everything `fn` does its own connection, closed once the response is
 * out. Used on Cloudflare, where a socket may not outlive its request.
 * @template T
 * @param {string | undefined} url
 * @param {() => T | Promise<T>} fn
 * @param {(promise: Promise<unknown>) => void} [waitUntil] defers the close
 * @returns {Promise<T>}
 */
export async function withConnection(url, fn, waitUntil) {
	if (!url) throw new Error(missing);

	/** @type {{ url: string, client?: Client, db?: ReturnType<typeof drizzle> }} */
	const store = { url };

	try {
		return await scope.run(store, fn);
	} finally {
		// The response body may still be streaming, so never block on this.
		const closing = store.client?.end({ timeout: 5 });
		if (closing) waitUntil ? waitUntil(closing) : closing.catch(() => {});
	}
}

const missing =
	'DATABASE_URL is not set. On Cloudflare run `npx wrangler secret put DATABASE_URL`; ' +
	'locally, copy .env.example to .env.';

/**
 * Connects on first use rather than on import — `vite build` loads this module
 * to analyse the routes, and a build shouldn't need database credentials.
 */
function conn() {
	const store = scope.getStore();
	if (store) {
		if (!store.db) {
			store.client = pool(store.url, 1);
			store.db = drizzle(store.client, { schema: tables });
		}
		return store.db;
	}

	if (!database) {
		const url = configured ?? globalThis.process?.env?.DATABASE_URL;
		if (!url) throw new Error(missing);
		client = pool(url, 5);
		database = drizzle(client, { schema: tables });
	}
	return database;
}

export { conn as getDb };

/** Postgres caps a statement at 65535 parameters, so write in batches. */
const CHUNK = 500;

/** @template T @param {T[]} items @returns {T[][]} */
function chunked(items) {
	/** @type {T[][]} */
	const out = [];
	for (let i = 0; i < items.length; i += CHUNK) out.push(items.slice(i, i + CHUNK));
	return out;
}

/** @typedef {ReturnType<typeof conn>} Database */
/** Either the pool or a transaction handle — both accept the same queries. */
/** @typedef {Database | Parameters<Parameters<Database['transaction']>[0]>[0]} Db */

/**
 * @typedef {object} StandingRow
 * @property {number} playerId
 * @property {number} rating
 * @property {number} games
 * @property {number} wins
 * @property {number} losses
 * @property {number} peak
 * @property {number} streak
 * @property {string} form
 * @property {Date | null} lastPlayed
 */

/**
 * Writes standings rows, creating them if a player somehow has none yet.
 * @param {Db} tx
 * @param {StandingRow[]} rows
 */
async function writeStandings(tx, rows) {
	for (const batch of chunked(rows)) {
		await tx
			.insert(standings)
			.values(batch)
			.onConflictDoUpdate({
				target: standings.playerId,
				set: {
					rating: sql`excluded.rating`,
					games: sql`excluded.games`,
					wins: sql`excluded.wins`,
					losses: sql`excluded.losses`,
					peak: sql`excluded.peak`,
					streak: sql`excluded.streak`,
					form: sql`excluded.form`,
					lastPlayed: sql`excluded.last_played`
				}
			});
	}
}

/**
 * The running tally a player carries into their next match.
 * @param {number} id
 * @returns {StandingRow}
 */
const blank = (id) => ({
	playerId: id,
	rating: START_RATING,
	games: 0,
	wins: 0,
	losses: 0,
	peak: START_RATING,
	streak: 0,
	form: '',
	lastPlayed: null
});

/**
 * Folds one result into a player's standing.
 * @param {StandingRow} s
 * @param {boolean} won
 * @param {number} delta
 * @param {Date} playedAt
 * @returns {StandingRow}
 */
function advance(s, won, delta, playedAt) {
	const rating = s.rating + delta;
	return {
		playerId: s.playerId,
		rating,
		games: s.games + 1,
		wins: s.wins + (won ? 1 : 0),
		losses: s.losses + (won ? 0 : 1),
		peak: Math.max(s.peak, rating),
		streak: won ? Math.max(s.streak, 0) + 1 : Math.min(s.streak, 0) - 1,
		form: (s.form + (won ? 'W' : 'L')).slice(-5),
		lastPlayed: playedAt
	};
}

/**
 * Replays every match from scratch and rewrites the derived columns.
 *
 * Ratings are path-dependent, so removing an old match invalidates everything
 * that followed it. Appending a match doesn't — that path stays incremental.
 * @param {Db} tx
 */
async function replayAll(tx) {
	const everyone = await tx.select({ id: players.id }).from(players);

	/** @type {Map<number, StandingRow>} */
	const state = new Map(everyone.map((p) => [p.id, blank(p.id)]));

	const rows = await tx
		.select({
			matchId: participants.matchId,
			playerId: participants.playerId,
			team: participants.team,
			won: participants.won,
			playedAt: matches.playedAt
		})
		.from(participants)
		.innerJoin(matches, eq(matches.id, participants.matchId))
		.orderBy(asc(matches.playedAt), asc(matches.id));

	/** @type {{ matchId: number, playerId: number, team: 'A' | 'B', won: boolean, ratingBefore: number, delta: number }[]} */
	const lines = [];

	/** @type {typeof rows} */
	let batch = [];

	const flush = () => {
		if (!batch.length) return;

		const teamA = batch.filter((r) => r.team === 'A');
		const teamB = batch.filter((r) => r.team === 'B');

		if (teamA.length && teamB.length) {
			/** @param {typeof batch} side */
			const rated = (side) =>
				side.map((r) => {
					const s = /** @type {StandingRow} */ (state.get(r.playerId));
					return { id: r.playerId, rating: s.rating, games: s.games };
				});

			const deltas = computeDeltas(rated(teamA), rated(teamB), teamA[0].won ? 'A' : 'B');

			for (const r of batch) {
				const s = /** @type {StandingRow} */ (state.get(r.playerId));
				const delta = deltas.get(r.playerId) ?? 0;

				lines.push({
					matchId: r.matchId,
					playerId: r.playerId,
					team: r.team,
					won: r.won,
					ratingBefore: s.rating,
					delta
				});
				state.set(r.playerId, advance(s, r.won, delta, r.playedAt));
			}
		}
		batch = [];
	};

	for (const row of rows) {
		if (batch.length && batch[0].matchId !== row.matchId) flush();
		batch.push(row);
	}
	flush();

	for (const part of chunked(lines)) {
		await tx
			.insert(participants)
			.values(part)
			.onConflictDoUpdate({
				target: [participants.matchId, participants.playerId],
				set: { ratingBefore: sql`excluded.rating_before`, delta: sql`excluded.delta` }
			});
	}

	await writeStandings(tx, [...state.values()]);
}

/* -------------------------------------------------------------------------- */
/* Reads                                                                       */
/* -------------------------------------------------------------------------- */

export async function leaderboard() {
	return conn()
		.select({
			id: players.id,
			name: players.name,
			active: players.active,
			rating: standings.rating,
			games: standings.games,
			wins: standings.wins,
			losses: standings.losses,
			peak: standings.peak,
			streak: standings.streak,
			form: standings.form,
			lastPlayed: standings.lastPlayed
		})
		.from(players)
		.innerJoin(standings, eq(standings.playerId, players.id))
		.orderBy(
			// Anyone yet to play sits below the ranked players.
			asc(sql`(${standings.games} = 0)`),
			desc(standings.rating),
			desc(standings.wins),
			asc(sql`lower(${players.name})`)
		);
}

export async function activePlayers() {
	return (await leaderboard()).filter((p) => p.active);
}

/** Match history, newest first, with each player's rating change baked in. */
export async function history(limit = 100) {
	const recent = await conn()
		.select({ id: matches.id, playedAt: matches.playedAt, note: matches.note })
		.from(matches)
		.orderBy(desc(matches.playedAt), desc(matches.id))
		.limit(limit);

	if (!recent.length) return [];

	const lines = await conn()
		.select({
			matchId: participants.matchId,
			playerId: participants.playerId,
			name: players.name,
			team: participants.team,
			won: participants.won,
			delta: participants.delta,
			ratingBefore: participants.ratingBefore
		})
		.from(participants)
		.innerJoin(players, eq(players.id, participants.playerId))
		.where(
			inArray(
				participants.matchId,
				recent.map((m) => m.id)
			)
		)
		.orderBy(asc(participants.team), asc(sql`lower(${players.name})`));

	return recent.map((m) => {
		const mine = lines.filter((l) => l.matchId === m.id);
		return {
			...m,
			teamA: mine.filter((l) => l.team === 'A'),
			teamB: mine.filter((l) => l.team === 'B'),
			winner: /** @type {'A' | 'B'} */ (mine.find((l) => l.won)?.team ?? 'A')
		};
	});
}

/**
 * Everything needed for one player's profile page.
 * @param {number} id
 */
export async function playerProfile(id) {
	const [player] = await conn()
		.select({
			id: players.id,
			name: players.name,
			active: players.active,
			rating: standings.rating,
			games: standings.games,
			wins: standings.wins,
			losses: standings.losses,
			peak: standings.peak,
			streak: standings.streak,
			form: standings.form
		})
		.from(players)
		.innerJoin(standings, eq(standings.playerId, players.id))
		.where(eq(players.id, id));

	if (!player) return null;

	const played = await conn()
		.select({
			id: matches.id,
			playedAt: matches.playedAt,
			team: participants.team,
			won: participants.won,
			delta: participants.delta,
			ratingBefore: participants.ratingBefore
		})
		.from(participants)
		.innerJoin(matches, eq(matches.id, participants.matchId))
		.where(eq(participants.playerId, id))
		.orderBy(asc(matches.playedAt), asc(matches.id));

	// Everyone who has stood on the other side of a table from this player.
	const them = alias(participants, 'them');

	const opponents = await conn()
		.select({
			name: players.name,
			wins: sql`sum(case when ${participants.won} then 1 else 0 end)`.mapWith(Number),
			losses: sql`sum(case when ${participants.won} then 0 else 1 end)`.mapWith(Number)
		})
		.from(participants)
		.innerJoin(
			them,
			and(eq(them.matchId, participants.matchId), ne(them.team, participants.team))
		)
		.innerJoin(players, eq(players.id, them.playerId))
		.where(eq(participants.playerId, id))
		.groupBy(players.id)
		.orderBy(desc(count()), asc(sql`lower(${players.name})`));

	const curve = [START_RATING, ...played.map((m) => m.ratingBefore + m.delta)];
	return { player, matches: played.reverse(), opponents, curve };
}

export async function stats() {
	const [[p], [m]] = await Promise.all([
		conn().select({ n: count() }).from(players),
		conn().select({ n: count() }).from(matches)
	]);
	return { players: p.n, matches: m.n };
}

/* -------------------------------------------------------------------------- */
/* Writes                                                                      */
/* -------------------------------------------------------------------------- */

/** @param {string} name */
function cleanName(name) {
	const clean = name.trim().replace(/\s+/g, ' ');
	if (!clean) throw new Error('Name cannot be empty');
	if (clean.length > 40) throw new Error('Name is too long');
	return clean;
}

/** @param {string} name */
export async function addPlayer(name) {
	const clean = cleanName(name);

	return conn().transaction(async (tx) => {
		const [clash] = await tx
			.select({ id: players.id })
			.from(players)
			.where(eq(sql`lower(${players.name})`, clean.toLowerCase()));
		if (clash) throw new Error(`${clean} is already on the board`);

		const [row] = await tx.insert(players).values({ name: clean }).returning({ id: players.id });
		await writeStandings(tx, [blank(row.id)]);
		return row.id;
	});
}

/**
 * @param {number} id
 * @param {string} name
 */
export async function renamePlayer(id, name) {
	const clean = cleanName(name);

	await conn().transaction(async (tx) => {
		const [clash] = await tx
			.select({ id: players.id })
			.from(players)
			.where(and(eq(sql`lower(${players.name})`, clean.toLowerCase()), ne(players.id, id)));
		if (clash) throw new Error(`${clean} is already on the board`);

		await tx.update(players).set({ name: clean }).where(eq(players.id, id));
	});
}

/**
 * Hides a player from match entry without destroying their match history.
 * @param {number} id
 * @param {boolean} active
 */
export async function setPlayerActive(id, active) {
	await conn().update(players).set({ active }).where(eq(players.id, id));
}

/** @param {number} id */
export async function deletePlayer(id) {
	await conn().transaction(async (tx) => {
		const [{ n }] = await tx
			.select({ n: count() })
			.from(participants)
			.where(eq(participants.playerId, id));

		if (n > 0) {
			throw new Error('That player has matches on record — archive them instead of deleting.');
		}
		await tx.delete(players).where(eq(players.id, id));
	});
}

/**
 * Records a result and moves the ratings.
 *
 * A new match is always the most recent one, so nothing before it changes and
 * the standings can be updated in place rather than replayed.
 * @param {number[]} teamA
 * @param {number[]} teamB
 * @param {'A' | 'B'} winner
 * @param {string} [note]
 */
export async function recordMatch(teamA, teamB, winner, note) {
	if (!teamA.length || !teamB.length) throw new Error('Both teams need at least one player');

	const ids = [...teamA, ...teamB];
	if (new Set(ids).size !== ids.length) throw new Error('A player cannot be on both teams');

	return conn().transaction(async (tx) => {
		const current = await tx
			.select()
			.from(standings)
			.where(inArray(standings.playerId, ids))
			.for('update');

		if (current.length !== ids.length) throw new Error('Unknown player');

		const before = new Map(current.map((s) => [s.playerId, s]));
		/** @param {number[]} side */
		const rated = (side) =>
			side.map((id) => {
				const s = /** @type {StandingRow} */ (before.get(id));
				return { id, rating: s.rating, games: s.games };
			});

		const deltas = computeDeltas(rated(teamA), rated(teamB), winner);

		const [match] = await tx
			.insert(matches)
			.values({ note: note?.trim() || null })
			.returning({ id: matches.id, playedAt: matches.playedAt });

		const rows = ids.map((id) => {
			const team = /** @type {'A' | 'B'} */ (teamA.includes(id) ? 'A' : 'B');
			const s = /** @type {StandingRow} */ (before.get(id));
			return {
				matchId: match.id,
				playerId: id,
				team,
				won: team === winner,
				ratingBefore: s.rating,
				delta: deltas.get(id) ?? 0
			};
		});

		await tx.insert(participants).values(rows);
		await writeStandings(
			tx,
			rows.map((r) =>
				advance(/** @type {StandingRow} */ (before.get(r.playerId)), r.won, r.delta, match.playedAt)
			)
		);

		return match.id;
	});
}

/** @param {number} id */
export async function deleteMatch(id) {
	await conn().transaction(async (tx) => {
		await tx.delete(matches).where(eq(matches.id, id));
		await replayAll(tx);
	});
}

/** Rebuilds every rating from the match history. Exposed for the seed script. */
export async function rebuild() {
	await conn().transaction(replayAll);
}

/** Closes the pool so one-off scripts can exit. */
export async function close() {
	await client?.end();
	client = undefined;
	database = undefined;
}
