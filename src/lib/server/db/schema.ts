import { sql } from 'drizzle-orm';
import {
	boolean,
	customType,
	index,
	integer,
	jsonb,
	pgTable,
	primaryKey,
	serial,
	smallint,
	text,
	timestamp,
	uniqueIndex
} from 'drizzle-orm/pg-core';

/**
 * Core tables, shared by every game module. A module that needs its own
 * tables puts them in `src/lib/modules/<id>/server/schema.ts`, prefixed with
 * its id; drizzle.config.ts picks those up too.
 */

const bytea = customType<{ data: Uint8Array; driverData: Uint8Array }>({
	dataType: () => 'bytea'
});

/** One row per person in the office, shared by every game. */
export const players = pgTable(
	'players',
	{
		id: serial('id').primaryKey(),
		name: text('name').notNull(),
		active: boolean('active').notNull().default(true),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
	},
	(t) => [
		// "ada" and "Ada" are the same person.
		uniqueIndex('players_name_unique').on(sql`lower(${t.name})`)
	]
);

export const matches = pgTable(
	'matches',
	{
		id: serial('id').primaryKey(),
		/** The game module that owns this match, such as `pool` or `darts`. */
		moduleId: text('module_id').notNull(),
		playedAt: timestamp('played_at', { withTimezone: true }).notNull().defaultNow(),
		note: text('note'),
		/** Whatever the module needs to replay the match: scores, throws, settings. */
		details: jsonb('details').$type<unknown>().notNull().default({})
	},
	(t) => [index('matches_module_played_at').on(t.moduleId, t.playedAt.desc(), t.id.desc())]
);

export const matchPlayers = pgTable(
	'match_players',
	{
		matchId: integer('match_id')
			.notNull()
			.references(() => matches.id, { onDelete: 'cascade' }),
		playerId: integer('player_id')
			.notNull()
			.references(() => players.id, { onDelete: 'cascade' }),
		/** 0-based side index; teammates share a side. */
		side: smallint('side').notNull(),
		/** Where the side finished, 1 being the winner. */
		placement: smallint('placement').notNull(),
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
export const ratings = pgTable(
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
		lastPlayed: timestamp('last_played', { withTimezone: true })
	},
	(t) => [primaryKey({ columns: [t.moduleId, t.playerId] })]
);

/** Instance settings: branding, access, enabled modules. One JSON value per key. */
export const settings = pgTable('settings', {
	key: text('key').primaryKey(),
	value: jsonb('value').$type<unknown>().notNull(),
	updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
});

/** Uploaded logo and the app icons resized from it. */
export const brandAssets = pgTable('brand_assets', {
	key: text('key').primaryKey(),
	contentType: text('content_type').notNull(),
	data: bytea('data').notNull(),
	updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
});

/** Failed sign-in attempts, for slowing down passphrase guessing. */
export const loginAttempts = pgTable('login_attempts', {
	key: text('key').primaryKey(),
	failures: integer('failures').notNull().default(0),
	windowStart: timestamp('window_start', { withTimezone: true }).notNull().defaultNow()
});
