import { eq, sql } from 'drizzle-orm';
import { getDb } from '../db/client';
import { loginAttempts } from '../db/schema';

const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 10;

/** True when this client has failed too often recently and should wait. */
export async function isLockedOut(key: string, now = new Date()): Promise<boolean> {
	const db = await getDb();
	const [row] = await db.select().from(loginAttempts).where(eq(loginAttempts.key, key));
	if (!row) return false;
	return now.getTime() - row.windowStart.getTime() < WINDOW_MS && row.failures >= MAX_FAILURES;
}

export async function recordFailure(key: string, now = new Date()): Promise<void> {
	const db = await getDb();
	const expired = new Date(now.getTime() - WINDOW_MS);
	await db
		.insert(loginAttempts)
		.values({ key, failures: 1, windowStart: now })
		.onConflictDoUpdate({
			target: loginAttempts.key,
			set: {
				// Start a fresh window once the old one has run out.
				failures: sql`case when ${loginAttempts.windowStart} < ${expired} then 1 else ${loginAttempts.failures} + 1 end`,
				windowStart: sql`case when ${loginAttempts.windowStart} < ${expired} then ${now} else ${loginAttempts.windowStart} end`
			}
		});
}

export async function clearFailures(key: string): Promise<void> {
	const db = await getDb();
	await db.delete(loginAttempts).where(eq(loginAttempts.key, key));
}
