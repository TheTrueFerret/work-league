import type { RequestEvent } from '@sveltejs/kit';
import { UserError } from '$lib/core/errors';
import { clearFailures, isLockedOut, recordFailure } from './rate-limit';

/** Where to go after signing in. Only same-site paths, never another origin. */
export function safeNext(raw: string | null, fallback = '/'): string {
	if (!raw || !raw.startsWith('/') || raw.startsWith('//') || raw.startsWith('/\\')) return fallback;
	return raw;
}

function clientKey(event: RequestEvent, kind: string): string {
	let address = 'unknown';
	try {
		address = event.getClientAddress();
	} catch {
		// Some adapters cannot tell; everyone then shares one bucket.
	}
	return `${kind}:${address}`;
}

/**
 * Runs a password check with lockout after repeated failures, so a passphrase
 * cannot be guessed by brute force.
 */
export async function guardedCheck(
	event: RequestEvent,
	kind: 'member' | 'admin',
	check: () => Promise<boolean>
): Promise<void> {
	const key = clientKey(event, kind);
	if (await isLockedOut(key)) {
		throw new UserError('Too many wrong attempts. Wait fifteen minutes and try again.');
	}
	if (!(await check())) {
		await recordFailure(key);
		throw new UserError(kind === 'admin' ? 'That is not the admin password' : 'That is not the passphrase');
	}
	await clearFailures(key);
}

export const cookieOptions = (event: RequestEvent, maxAge: number) => ({
	path: '/',
	httpOnly: true,
	sameSite: 'lax' as const,
	secure: event.url.protocol === 'https:',
	maxAge
});
