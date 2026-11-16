import { sql } from 'drizzle-orm';
import {
	boolean,
	index,
	integer,
	pgEnum,
	pgTable,
	primaryKey,
	serial,
	text,
	timestamp,
	uniqueIndex
} from 'drizzle-orm/pg-core';
import { START_RATING } from '../modules/pool';

export const teamSide = pgEnum('team_side', ['A', 'B']);

export const players = pgTable(
	'players',
	{
		id: serial('id').primaryKey(),
		name: text('name').notNull(),
		active: boolean('active').notNull().default(true),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
	},
	(t) => [
		// "ada" and "Ada" are the same person at the pool table.
		uniqueIndex('players_name_unique').on(sql`lower(${t.name})`)
	]
);

export const matches = pgTable(
	'matches',
	{
		id: serial('id').primaryKey(),
		playedAt: timestamp('played_at', { withTimezone: true }).notNull().defaultNow(),
		note: text('note')
	},
	(t) => [index('matches_played_at').on(t.playedAt.desc(), t.id.desc())]
);

export const participants = pgTable(
	'participants',
	{
		matchId: integer('match_id')
			.notNull()
			.references(() => matches.id, { onDelete: 'cascade' }),
		playerId: integer('player_id')
			.notNull()
			.references(() => players.id, { onDelete: 'cascade' }),
		team: teamSide('team').notNull(),
		won: boolean('won').notNull(),
		ratingBefore: integer('rating_before').notNull().default(START_RATING),
		delta: integer('delta').notNull().default(0)
	},
	(t) => [
		primaryKey({ columns: [t.matchId, t.playerId] }),
		index('participants_player').on(t.playerId)
	]
);

/**
 * Current standings. Derived entirely from `participants` — a full replay can
 * rebuild this table at any time, so never edit it by hand.
 */
export const standings = pgTable('standings', {
	playerId: integer('player_id')
		.primaryKey()
		.references(() => players.id, { onDelete: 'cascade' }),
	rating: integer('rating').notNull().default(START_RATING),
	games: integer('games').notNull().default(0),
	wins: integer('wins').notNull().default(0),
	losses: integer('losses').notNull().default(0),
	peak: integer('peak').notNull().default(START_RATING),
	streak: integer('streak').notNull().default(0),
	/** Up to five recent results, most recent last, e.g. `WWLWL`. */
	form: text('form').notNull().default(''),
	lastPlayed: timestamp('last_played', { withTimezone: true })
});
