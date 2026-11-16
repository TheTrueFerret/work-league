import { sql } from 'drizzle-orm';
import {
	blob,
	index,
	integer,
	primaryKey,
	sqliteTable,
	text,
	uniqueIndex
} from 'drizzle-orm/sqlite-core';

/**
 * Core tables, shared by every game module. A module that needs its own
 * tables puts them in `src/lib/modules/<id>/server/schema.ts`, prefixed with
 * its id; drizzle.config.ts picks those up too.
 *
 * SQLite everywhere: Cloudflare D1 in production on Workers, a local SQLite
 * file (libSQL) under Node, Docker, `npm run dev` and the tests.
 */

/** Milliseconds since the epoch, read back as a Date. */
const timestamp = (name: string) => integer(name, { mode: 'timestamp_ms' });
const createdNow = (name: string) =>
	timestamp(name)
		.notNull()
		.$defaultFn(() => new Date());

/** One row per person in the office, shared by every game. */
export const players = sqliteTable(
	'players',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		name: text('name').notNull(),
		active: integer('active', { mode: 'boolean' }).notNull().default(true),
		createdAt: createdNow('created_at')
	},
	(t) => [
		// "ada" and "Ada" are the same person.
		uniqueIndex('players_name_unique').on(sql`lower(${t.name})`)
	]
);

export const matches = sqliteTable(
	'matches',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		/** The game module that owns this match, such as `pool` or `darts`. */
		moduleId: text('module_id').notNull(),
		playedAt: createdNow('played_at'),
		note: text('note'),
		/** Whatever the module needs to replay the match: scores, throws, settings. */
		details: text('details', { mode: 'json' }).$type<unknown>().notNull().default({})
	},
	(t) => [
		// SQLite reads it backwards for the newest-first history.
		index('matches_module_played_at').on(t.moduleId, t.playedAt, t.id)
	]
);

export const matchPlayers = sqliteTable(
	'match_players',
	{
		matchId: integer('match_id')
			.notNull()
			.references(() => matches.id, { onDelete: 'cascade' }),
		playerId: integer('player_id')
			.notNull()
			.references(() => players.id, { onDelete: 'cascade' }),
		/** 0-based side index; teammates share a side. */
		side: integer('side').notNull(),
		/** Where the side finished, 1 being the winner. */
		placement: integer('placement').notNull(),
		ratingBefore: integer('rating_before').notNull(),
		delta: integer('delta').notNull().default(0)
	},
	(t) => [
		primaryKey({ columns: [t.matchId, t.playerId] }),
		index('match_players_player').on(t.playerId)
	]
);

/**
 * Each player's current standing in each game. Derived entirely from
 * `match_players` — a replay can rebuild it at any time, so never edit it by hand.
 */
export const ratings = sqliteTable(
	'ratings',
	{
		moduleId: text('module_id').notNull(),
		playerId: integer('player_id')
			.notNull()
			.references(() => players.id, { onDelete: 'cascade' }),
		rating: integer('rating').notNull(),
		games: integer('games').notNull().default(0),
		wins: integer('wins').notNull().default(0),
		losses: integer('losses').notNull().default(0),
		peak: integer('peak').notNull(),
		streak: integer('streak').notNull().default(0),
		/** Up to five recent results, most recent last, e.g. `WWLWL`. */
		form: text('form').notNull().default(''),
		lastPlayed: timestamp('last_played')
	},
	(t) => [primaryKey({ columns: [t.moduleId, t.playerId] })]
);

/**
 * Bumped by every write to a game's ratings. D1 has no locks or interactive
 * transactions, so each write checks the version it started from and the
 * whole batch rolls back if another write got there first (see matches.ts).
 */
export const gameVersions = sqliteTable('game_versions', {
	moduleId: text('module_id').primaryKey(),
	version: integer('version').notNull().default(0)
});

/** Instance settings: branding, access, enabled modules. One JSON value per key. */
export const settings = sqliteTable('settings', {
	key: text('key').primaryKey(),
	value: text('value', { mode: 'json' }).$type<unknown>().notNull(),
	updatedAt: createdNow('updated_at')
});

/** Uploaded logo and the app icons resized from it. */
export const brandAssets = sqliteTable('brand_assets', {
	key: text('key').primaryKey(),
	contentType: text('content_type').notNull(),
	data: blob('data', { mode: 'buffer' }).notNull(),
	updatedAt: createdNow('updated_at')
});

/** Failed sign-in attempts, for slowing down passphrase guessing. */
export const loginAttempts = sqliteTable('login_attempts', {
	key: text('key').primaryKey(),
	failures: integer('failures').notNull().default(0),
	windowStart: createdNow('window_start')
});
