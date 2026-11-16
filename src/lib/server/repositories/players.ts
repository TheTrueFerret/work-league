import { and, count, eq, ne, sql } from 'drizzle-orm';
import { UserError } from '$lib/core/errors';
import { getDb } from '../db/client';
import { matchPlayers, players } from '../db/schema';

export const MAX_NAME_LENGTH = 40;

export interface PlayerSummary {
	id: number;
	name: string;
	active: boolean;
	/** Matches played across every game. */
	games: number;
}

export function cleanName(name: string): string {
	const clean = name.trim().replace(/\s+/g, ' ');
	if (!clean) throw new UserError('Name cannot be empty');
	if (clean.length > MAX_NAME_LENGTH) throw new UserError('Name is too long');
	return clean;
}

export async function listPlayers(): Promise<PlayerSummary[]> {
	const db = await getDb();
	return db
		.select({
			id: players.id,
			name: players.name,
			active: players.active,
			games: sql<number>`count(${matchPlayers.matchId})`.mapWith(Number)
		})
		.from(players)
		.leftJoin(matchPlayers, eq(matchPlayers.playerId, players.id))
		.groupBy(players.id)
		.orderBy(sql`lower(${players.name})`);
}

export async function getPlayer(id: number) {
	const db = await getDb();
	const [player] = await db
		.select({ id: players.id, name: players.name, active: players.active })
		.from(players)
		.where(eq(players.id, id));
	return player ?? null;
}

async function assertNameFree(name: string, exceptId?: number): Promise<void> {
	const db = await getDb();
	const sameName = eq(sql`lower(${players.name})`, name.toLowerCase());
	const [clash] = await db
		.select({ id: players.id })
		.from(players)
		.where(exceptId === undefined ? sameName : and(sameName, ne(players.id, exceptId)));
	if (clash) throw new UserError(`${name} is already in the league`);
}

export async function addPlayer(name: string): Promise<number> {
	const clean = cleanName(name);
	await assertNameFree(clean);
	const db = await getDb();
	const [row] = await db.insert(players).values({ name: clean }).returning({ id: players.id });
	if (!row) throw new Error('Insert returned no row');
	return row.id;
}

export async function renamePlayer(id: number, name: string): Promise<void> {
	const clean = cleanName(name);
	await assertNameFree(clean, id);
	const db = await getDb();
	await db.update(players).set({ name: clean }).where(eq(players.id, id));
}

/** Hides a player from match entry without touching their history. */
export async function setPlayerActive(id: number, active: boolean): Promise<void> {
	const db = await getDb();
	await db.update(players).set({ active }).where(eq(players.id, id));
}

export async function deletePlayer(id: number): Promise<void> {
	const db = await getDb();
	await db.transaction(async (tx) => {
		const [played] = await tx
			.select({ n: count() })
			.from(matchPlayers)
			.where(eq(matchPlayers.playerId, id));
		if (played && played.n > 0) {
			throw new UserError('That player has matches on record. Archive them instead.');
		}
		await tx.delete(players).where(eq(players.id, id));
	});
}
