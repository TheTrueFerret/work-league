import * as v from 'valibot';
import { constantTimeEqual, fromBase64Url, hmac, toBase64Url } from './crypto';

/**
 * Two kinds of signed cookie:
 *
 * - member: proves the holder knew the office passphrase. Lasts a year so the
 *   installed app stays unlocked, and stops working when the passphrase changes.
 * - admin: proves the holder knew ADMIN_PASSWORD. Lasts twelve hours.
 */
export const MEMBER_COOKIE = 'wl_member';
export const ADMIN_COOKIE = 'wl_admin';

export const MEMBER_MAX_AGE = 60 * 60 * 24 * 365;
export const ADMIN_MAX_AGE = 60 * 60 * 12;

const PayloadSchema = v.object({
	kind: v.picklist(['member', 'admin']),
	/** Passphrase version, for member tokens. */
	version: v.number(),
	issuedAt: v.number()
});

export type TokenPayload = v.InferOutput<typeof PayloadSchema>;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export async function signToken(secret: string, payload: TokenPayload): Promise<string> {
	const body = toBase64Url(encoder.encode(JSON.stringify(payload)));
	return `${body}.${toBase64Url(await hmac(secret, body))}`;
}

export async function readToken(
	secret: string,
	token: string | undefined
): Promise<TokenPayload | null> {
	if (!token) return null;
	const [body, signature] = token.split('.');
	if (!body || !signature) return null;
	try {
		const expected = await hmac(secret, body);
		if (!constantTimeEqual(expected, fromBase64Url(signature))) return null;
		const parsed = v.safeParse(PayloadSchema, JSON.parse(decoder.decode(fromBase64Url(body))));
		return parsed.success ? parsed.output : null;
	} catch {
		return null;
	}
}

export async function isValidMember(
	secret: string,
	token: string | undefined,
	passphraseVersion: number
): Promise<boolean> {
	const payload = await readToken(secret, token);
	return payload?.kind === 'member' && payload.version === passphraseVersion;
}

export async function isValidAdmin(
	secret: string,
	token: string | undefined,
	now = Date.now()
): Promise<boolean> {
	const payload = await readToken(secret, token);
	return payload?.kind === 'admin' && now - payload.issuedAt < ADMIN_MAX_AGE * 1000;
}

/** Compares a typed password with ADMIN_PASSWORD without leaking timing. */
export async function matchesAdminPassword(
	secret: string,
	typed: string,
	configured: string
): Promise<boolean> {
	const [a, b] = await Promise.all([
		hmac(secret, `admin:${typed}`),
		hmac(secret, `admin:${configured}`)
	]);
	return constantTimeEqual(a, b);
}
