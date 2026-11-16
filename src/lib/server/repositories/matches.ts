import { and, asc, count, desc, eq, inArray, sql, type SQL, type SQLWrapper } from 'drizzle-orm';
import type { BatchItem } from 'drizzle-orm/batch';
import * as v from 'valibot';
import { UserError } from '$lib/core/errors';
import { computeDeltas, type Competitor } from '$lib/core/rating/elo';
import { advanceStanding, blankStanding, type Standing } from '$lib/core/standing';
import type { GameModule, MatchSubmission } from '$lib/modules/types';
import { getDb, type Database } from '../db/client';
import { gameVersions, matches, matchPlayers, players, ratings } from '../db/schema';

/** D1 accepts at most 100 bound parameters in one statement. */
const MAX_PARAMS = 100;

function chunked<T>(items: readonly T[], size: number): T[][] {
	const out: T[][] = [];
	for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
	return out;
}

const MAX_NOTE_LENGTH = 120;

/** Checks the parts of a submission every game shares: who played on which side. */
function validateSides(module: GameModule, sides: readonly (readonly number[])[]): void {
	const { format } = module;
	if (sides.length < format.sides.min || sides.length > format.sides.max) {
		throw new UserError(
			format.sides.min === format.sides.max
				? `${module.name} needs exactly ${format.sides.min} sides`
				: `${module.name} needs ${format.sides.min} to ${format.sides.max} sides`
		);
	}
	for (const side of sides) {
		if (side.length < format.playersPerSide.min || side.length > format.playersPerSide.max) {
			throw new UserError(
				format.playersPerSide.min === format.playersPerSide.max
					? `Each side needs ${format.playersPerSide.min} player${format.playersPerSide.min === 1 ? '' : 's'}`
					: `Each side needs ${format.playersPerSide.min} to ${format.playersPerSide.max} players`
			);
		}
	}
	const ids = sides.flat();
	if (ids.some((id) => !Number.isInteger(id) || id <= 0)) throw new UserError('Unknown player');
	if (new Set(ids).size !== ids.length) throw new UserError('A player can only be on one side');
}

function parseDetails<Details>(module: GameModule<Details>, raw: unknown): Details {
	const result = v.safeParse(module.details, raw);
	if (!result.success) {
		throw new UserError(`That ${module.name} result doesn't add up: ${result.issues[0].message}`);
	}
	return result.output;
}

/* -------------------------------------------------------------------------- */
/* Writing safely without transactions                                         */
/* -------------------------------------------------------------------------- */

/*
 * D1 cannot hold a transaction open while the app reads, thinks and writes; it
 * only runs a batch of statements atomically. So every write to a game's
 * ratings reads that game's version first, does its sums, then sends one batch
 * that starts by moving the version on. If another write moved it in the
 * meantime, that first statement fails, the whole batch rolls back, and the
 * write starts over from fresh data.
 */

type Batch = [BatchItem<'sqlite'>, ...BatchItem<'sqlite'>[]];

async function readVersion(db: Database, moduleId: string): Promise<number> {
	await db.insert(gameVersions).values({ moduleId }).onConflictDoNothing();
	const [row] = await db
		.select({ version: gameVersions.version })
		.from(gameVersions)
		.where(eq(gameVersions.moduleId, moduleId));
	return row?.version ?? 0;
}

/**
 * Moves the version on, or sets it to NULL when it is no longer `seen`. The
 * NOT NULL constraint rejects that, which aborts and rolls back the batch.
 */
function claimVersion(db: Database, moduleId: string, seen: number) {
	return db
		.update(gameVersions)
		.set({
			version: sql`case when ${gameVersions.version} = ${seen} then ${gameVersions.version} + 1 end`
		})
		.where(eq(gameVersions.moduleId, moduleId));
}

function isVersionConflict(error: unknown): boolean {
	for (let e = error; e instanceof Error; e = e.cause) {
		if (e.message.includes('game_versions.version')) return true;
	}
	return false;
}

/** Retries `write` while another write to the same game keeps getting there first. */
async function retrying<T>(write: () => Promise<T>): Promise<T> {
	for (let attempt = 1; ; attempt++) {
		try {
			return await write();
		} catch (error) {
			if (!isVersionConflict(error) || attempt >= 8) throw error;
			await new Promise((done) => setTimeout(done, Math.random() * 20 * attempt));
		}
	}
}

const toRow = (moduleId: string, s: Standing): typeof ratings.$inferInsert => ({ moduleId, ...s });
const RATING_ROWS = Math.floor(MAX_PARAMS / 10);

function upsertStandings(db: Database, moduleId: string, rows: readonly Standing[]) {
	return chunked(rows, RATING_ROWS).map((batch) =>
		db
			.insert(ratings)
			.values(batch.map((s) => toRow(moduleId, s)))
			.onConflictDoUpdate({
				target: [ratings.moduleId, ratings.playerId],
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
			})
	);
}

/* -------------------------------------------------------------------------- */
/* Recording, deleting, replaying                                              */
/* -------------------------------------------------------------------------- */

/**
 * Validates a result, rates it and saves it in one atomic batch.
 *
 * A new match is always the most recent one, so nothing before it changes and
 * standings are updated in place rather than replayed.
 */
export async function recordMatch<Details>(
	module: GameModule<Details>,
	submission: MatchSubmission<unknown>
): Promise<number> {
	const sides = submission.sides.map((side) => [...side]);
	validateSides(module, sides);
	const details = parseDetails(module, submission.details);
	const placements = module.resolve(details, sides);
	if (placements.length !== sides.length)
		throw new Error(`${module.id}.resolve returned the wrong number of placements`);

	const note = submission.note?.trim().slice(0, MAX_NOTE_LENGTH) || null;
	const ids = sides.flat();
	const db = await getDb();

	return retrying(async () => {
		const version = await readVersion(db, module.id);
		const known = await db
			.select({ id: players.id, active: players.active })
			.from(players)
			.where(inArray(players.id, ids));
		if (known.length !== ids.length) throw new UserError('Unknown player');
		if (known.some((p) => !p.active)) throw new UserError('Archived players cannot play');

		const current = await db
			.select()
			.from(ratings)
			.where(and(eq(ratings.moduleId, module.id), inArray(ratings.playerId, ids)));
		const before = new Map<number, Standing>(current.map((row) => [row.playerId, row]));
		const standingOf = (id: number): Standing =>
			before.get(id) ?? blankStanding(id, module.rating.start);

		const competitors: Competitor[][] = sides.map((side) =>
			side.map((id) => ({ id, rating: standingOf(id).rating, games: standingOf(id).games }))
		);
		const deltas = computeDeltas(competitors, placements, module.rating);
		const playedAt = new Date();

		const lines = sides.flatMap((side, sideIndex) =>
			side.map((playerId) => ({
				// The match row inserted just before, in the same atomic batch.
				matchId: sql`(select max(${matches.id}) from ${matches})`,
				playerId,
				side: sideIndex,
				placement: placements[sideIndex]!,
				ratingBefore: standingOf(playerId).rating,
				delta: deltas.get(playerId) ?? 0
			}))
		);
		const standings = lines.map((l) =>
			advanceStanding(standingOf(l.playerId), l.placement === 1, l.delta, playedAt)
		);

		const [, inserted] = await db.batch([
			claimVersion(db, module.id, version),
			db
				.insert(matches)
				.values({ moduleId: module.id, playedAt, note, details: details as unknown })
				.returning({ id: matches.id }),
			...chunked(lines, Math.floor(MAX_PARAMS / 5)).map((batch) =>
				db.insert(matchPlayers).values(batch)
			),
			...upsertStandings(db, module.id, standings)
		] as unknown as Batch);
		const match = (inserted as { id: number }[])[0];
		if (!match) throw new Error('Insert returned no row');
		return match.id;
	});
}

/** Removes a match and replays its game, since every later rating depended on it. */
export async function deleteMatch(
	id: number,
	modules: (moduleId: string) => GameModule | undefined
): Promise<void> {
	const db = await getDb();
	await retrying(async () => {
		const [match] = await db
			.select({ moduleId: matches.moduleId })
			.from(matches)
			.where(eq(matches.id, id));
		if (!match) throw new UserError('That match no longer exists');
		const removal = [
			db.delete(matchPlayers).where(eq(matchPlayers.matchId, id)),
			db.delete(matches).where(eq(matches.id, id))
		];

		const module = modules(match.moduleId);
		// A match from an uninstalled game has no ratings to keep in step.
		if (!module) return void (await db.batch(removal as unknown as Batch));

		const version = await readVersion(db, module.id);
		const replay = await planReplay(db, module, id);
		await db.batch([claimVersion(db, module.id, version), ...removal, ...replay] as Batch);
	});
}

/** Rebuilds every rating in one game from its match history. */
export async function rebuildRatings(module: GameModule): Promise<void> {
	const db = await getDb();
	await retrying(async () => {
		const version = await readVersion(db, module.id);
		const replay = await planReplay(db, module);
		await db.batch([claimVersion(db, module.id, version), ...replay] as Batch);
	});
}

/** Rows per `update match_players` statement. The values are inlined integers, not parameters. */
const UPDATE_ROWS = 1000;

const int = (n: number): number => {
	if (!Number.isSafeInteger(n)) throw new Error(`Expected an integer, got ${n}`);
	return n;
};

/**
 * Ratings are path-dependent, so removing an old match invalidates everything
 * that followed it. This replays the whole history of one game, leaving out
 * `withoutMatch` if given, and returns the statements that store the result.
 */
async function planReplay(
	db: Database,
	module: GameModule,
	withoutMatch?: number
): Promise<BatchItem<'sqlite'>[]> {
	const rows = await db
		.select({
			matchId: matchPlayers.matchId,
			playerId: matchPlayers.playerId,
			side: matchPlayers.side,
			placement: matchPlayers.placement,
			playedAt: matches.playedAt
		})
		.from(matchPlayers)
		.innerJoin(matches, eq(matches.id, matchPlayers.matchId))
		.where(eq(matches.moduleId, module.id))
		.orderBy(
			asc(matches.playedAt),
			asc(matches.id),
			asc(matchPlayers.side),
			asc(matchPlayers.playerId)
		)
		.then((all) => all.filter((r) => r.matchId !== withoutMatch));

	const state = new Map<number, Standing>();
	const standingOf = (id: number): Standing =>
		state.get(id) ?? blankStanding(id, module.rating.start);
	const updates: { matchId: number; playerId: number; ratingBefore: number; delta: number }[] = [];

	const rate = (match: typeof rows) => {
		const sideCount = Math.max(...match.map((r) => r.side)) + 1;
		const sides = Array.from({ length: sideCount }, (_, i) => match.filter((r) => r.side === i));
		if (sides.some((side) => side.length === 0)) return;

		const placements = sides.map((side) => side[0]!.placement);
		const competitors = sides.map((side) =>
			side.map((r) => ({
				id: r.playerId,
				rating: standingOf(r.playerId).rating,
				games: standingOf(r.playerId).games
			}))
		);
		const deltas = computeDeltas(competitors, placements, module.rating);
		for (const r of match) {
			const before = standingOf(r.playerId);
			const delta = deltas.get(r.playerId) ?? 0;
			updates.push({
				matchId: r.matchId,
				playerId: r.playerId,
				ratingBefore: before.rating,
				delta
			});
			state.set(r.playerId, advanceStanding(before, r.placement === 1, delta, r.playedAt));
		}
	};

	let start = 0;
	for (let i = 1; i <= rows.length; i++) {
		if (i === rows.length || rows[i]!.matchId !== rows[start]!.matchId) {
			rate(rows.slice(start, i));
			start = i;
		}
	}

	const statements: BatchItem<'sqlite'>[] = chunked(updates, UPDATE_ROWS).map((batch) => {
		// Inlined because D1 allows only 100 parameters a statement; `int` makes this safe.
		const values: SQL = sql.raw(
			batch
				.map(
					(u) => `(${int(u.matchId)}, ${int(u.playerId)}, ${int(u.ratingBefore)}, ${int(u.delta)})`
				)
				.join(', ')
		);
		return db.run(sql`
			with u(match_id, player_id, rating_before, delta) as (values ${values})
			update match_players
			set rating_before = u.rating_before, delta = u.delta
			from u
			where match_players.match_id = u.match_id and match_players.player_id = u.player_id
		`);
	});
	statements.push(db.delete(ratings).where(eq(ratings.moduleId, module.id)));
	statements.push(...upsertStandings(db, module.id, [...state.values()]));
	return statements;
}

/* -------------------------------------------------------------------------- */
/* Reads                                                                       */
/* -------------------------------------------------------------------------- */

export interface LeaderboardRow {
	id: number;
	name: string;
	active: boolean;
	rating: number;
	games: number;
	wins: number;
	losses: number;
	peak: number;
	streak: number;
	form: string;
	lastPlayed: Date | null;
}

/**
 * Everyone's standing in one game. Active players who have not played yet are
 * included at the starting rating; archived players only if they have played.
 */
export async function leaderboard(module: GameModule): Promise<LeaderboardRow[]> {
	const db = await getDb();
	const rows = await db
		.select({
			id: players.id,
			name: players.name,
			active: players.active,
			rating: ratings.rating,
			games: ratings.games,
			wins: ratings.wins,
			losses: ratings.losses,
			peak: ratings.peak,
			streak: ratings.streak,
			form: ratings.form,
			lastPlayed: ratings.lastPlayed
		})
		.from(players)
		.leftJoin(ratings, and(eq(ratings.playerId, players.id), eq(ratings.moduleId, module.id)));

	const start = module.rating.start;
	return rows
		.map((r) => ({
			id: r.id,
			name: r.name,
			active: r.active,
			rating: r.rating ?? start,
			games: r.games ?? 0,
			wins: r.wins ?? 0,
			losses: r.losses ?? 0,
			peak: r.peak ?? start,
			streak: r.streak ?? 0,
			form: r.form ?? '',
			lastPlayed: r.lastPlayed
		}))
		.filter((r) => r.active || r.games > 0)
		.sort(
			(a, b) =>
				Number(a.games === 0) - Number(b.games === 0) ||
				b.rating - a.rating ||
				b.wins - a.wins ||
				a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
		);
}

export async function matchCount(moduleId: string): Promise<number> {
	const db = await getDb();
	const [row] = await db.select({ n: count() }).from(matches).where(eq(matches.moduleId, moduleId));
	return row?.n ?? 0;
}

/** Match counts for every game at once, for the launcher. */
export async function matchCounts(): Promise<Map<string, number>> {
	const db = await getDb();
	const rows = await db
		.select({ moduleId: matches.moduleId, n: count() })
		.from(matches)
		.groupBy(matches.moduleId);
	return new Map(rows.map((r) => [r.moduleId, r.n]));
}

export interface HistoryLine {
	playerId: number;
	name: string;
	side: number;
	placement: number;
	ratingBefore: number;
	delta: number;
}

export interface HistoryMatch {
	id: number;
	moduleId: string;
	playedAt: Date;
	note: string | null;
	summary: string | null;
	/** Players grouped by side, sides ordered by where they finished. */
	sides: { side: number; placement: number; players: HistoryLine[] }[];
}

type MatchLine = HistoryLine & { matchId: number };

/**
 * Everyone who played in the matches `matchIds` selects. Takes a subquery, not
 * a list, because D1 allows only 100 parameters a statement.
 */
async function linesFor(matchIds: SQLWrapper): Promise<MatchLine[]> {
	const db = await getDb();
	return db
		.select({
			matchId: matchPlayers.matchId,
			playerId: matchPlayers.playerId,
			name: players.name,
			side: matchPlayers.side,
			placement: matchPlayers.placement,
			ratingBefore: matchPlayers.ratingBefore,
			delta: matchPlayers.delta
		})
		.from(matchPlayers)
		.innerJoin(players, eq(players.id, matchPlayers.playerId))
		.where(inArray(matchPlayers.matchId, matchIds))
		.orderBy(asc(matchPlayers.side), asc(sql`lower(${players.name})`));
}

function groupSides(lines: readonly HistoryLine[]): HistoryMatch['sides'] {
	const bySide = new Map<number, HistoryLine[]>();
	for (const line of lines) {
		const list = bySide.get(line.side) ?? [];
		list.push(line);
		bySide.set(line.side, list);
	}
	return [...bySide.entries()]
		.map(([side, list]) => ({ side, placement: list[0]!.placement, players: list }))
		.sort((a, b) => a.placement - b.placement || a.side - b.side);
}

/** Recent matches in one game, newest first, with each player's rating change. */
export async function history(module: GameModule, limit = 100): Promise<HistoryMatch[]> {
	const db = await getDb();
	const inGame = eq(matches.moduleId, module.id);
	const order = [desc(matches.playedAt), desc(matches.id)];
	const [recent, lines] = await Promise.all([
		db
			.select({
				id: matches.id,
				moduleId: matches.moduleId,
				playedAt: matches.playedAt,
				note: matches.note,
				details: matches.details
			})
			.from(matches)
			.where(inGame)
			.orderBy(...order)
			.limit(limit),
		linesFor(
			db
				.select({ id: matches.id })
				.from(matches)
				.where(inGame)
				.orderBy(...order)
				.limit(limit)
		)
	]);
	return recent.map((m) => ({
		id: m.id,
		moduleId: m.moduleId,
		playedAt: m.playedAt,
		note: m.note,
		summary: summarize(module, m.details),
		sides: groupSides(lines.filter((l) => l.matchId === m.id))
	}));
}

function summarize(module: GameModule, details: unknown): string | null {
	if (!module.summarize) return null;
	// Matches imported from before a module stored details have none to summarise.
	const parsed = v.safeParse(module.details, details);
	return parsed.success ? module.summarize(parsed.output) : null;
}

/* -------------------------------------------------------------------------- */
/* Player profile                                                              */
/* -------------------------------------------------------------------------- */

export interface GameStanding extends Standing {
	moduleId: string;
}

/** A player's standing in every game they have played. */
export async function standingsFor(playerId: number): Promise<GameStanding[]> {
	const db = await getDb();
	return db.select().from(ratings).where(eq(ratings.playerId, playerId));
}

/** Every standing in the league, for the championship. */
export async function allStandings(): Promise<GameStanding[]> {
	const db = await getDb();
	return db.select().from(ratings);
}

export async function playerGameProfile(module: GameModule, playerId: number) {
	const db = await getDb();
	const mine = and(eq(matchPlayers.playerId, playerId), eq(matches.moduleId, module.id));
	const played = await db
		.select({
			id: matches.id,
			playedAt: matches.playedAt,
			details: matches.details,
			side: matchPlayers.side,
			placement: matchPlayers.placement,
			delta: matchPlayers.delta,
			ratingBefore: matchPlayers.ratingBefore
		})
		.from(matchPlayers)
		.innerJoin(matches, eq(matches.id, matchPlayers.matchId))
		.where(mine)
		.orderBy(asc(matches.playedAt), asc(matches.id));

	const everyone = await linesFor(
		db
			.select({ id: matchPlayers.matchId })
			.from(matchPlayers)
			.innerJoin(matches, eq(matches.id, matchPlayers.matchId))
			.where(mine)
	);
	const linesByMatch = new Map<number, HistoryLine[]>();
	for (const line of everyone) {
		const list = linesByMatch.get(line.matchId) ?? [];
		list.push(line);
		linesByMatch.set(line.matchId, list);
	}

	// Head to head: everyone who has been on another side from this player.
	const rivals = new Map<number, { id: number; name: string; wins: number; losses: number }>();
	for (const match of played) {
		for (const other of linesByMatch.get(match.id) ?? []) {
			if (other.side === match.side) continue;
			const rival = rivals.get(other.playerId) ?? {
				id: other.playerId,
				name: other.name,
				wins: 0,
				losses: 0
			};
			if (match.placement < other.placement) rival.wins++;
			else if (match.placement > other.placement) rival.losses++;
			rivals.set(other.playerId, rival);
		}
	}

	const stats = module.playerStats
		? module.playerStats(
				played.flatMap((m) => {
					const parsed = v.safeParse(module.details, m.details);
					if (!parsed.success) return [];
					const lines = linesByMatch.get(m.id) ?? [];
					const sideCount = Math.max(...lines.map((l) => l.side)) + 1;
					return [
						{
							details: parsed.output,
							side: m.side,
							placement: m.placement,
							playerId,
							sides: Array.from({ length: sideCount }, (_, i) =>
								lines.filter((l) => l.side === i).map((l) => l.playerId)
							)
						}
					];
				})
			)
		: [];

	return {
		curve: [module.rating.start, ...played.map((m) => m.ratingBefore + m.delta)],
		matches: played
			.map((m) => ({
				id: m.id,
				playedAt: m.playedAt,
				won: m.placement === 1,
				placement: m.placement,
				delta: m.delta,
				ratingAfter: m.ratingBefore + m.delta,
				summary: summarize(module, m.details),
				opponents: (linesByMatch.get(m.id) ?? [])
					.filter((l) => l.side !== m.side)
					.map((l) => l.name)
			}))
			.reverse(),
		rivals: [...rivals.values()].sort(
			(a, b) => b.wins + b.losses - (a.wins + a.losses) || a.name.localeCompare(b.name)
		),
		stats
	};
}
