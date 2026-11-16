import { describe, expect, it } from 'vitest';
import { hashSecret, verifySecret } from './crypto';
import {
	ADMIN_MAX_AGE,
	isValidAdmin,
	isValidMember,
	matchesAdminPassword,
	readToken,
	signToken
} from './session';

const secret = 'a-test-secret-that-is-long-enough';

describe('session tokens', () => {
	it('round-trips a signed token', async () => {
		const token = await signToken(secret, { kind: 'member', version: 3, issuedAt: 1 });
		expect(await readToken(secret, token)).toEqual({ kind: 'member', version: 3, issuedAt: 1 });
	});

	it('rejects a tampered token or the wrong key', async () => {
		const token = await signToken(secret, { kind: 'member', version: 1, issuedAt: 1 });
		const [body, sig] = token.split('.');
		const forged = await signToken('another-secret-entirely-here', {
			kind: 'admin',
			version: 0,
			issuedAt: Date.now()
		});
		expect(await readToken(secret, `${forged.split('.')[0]}.${sig}`)).toBeNull();
		expect(await readToken('wrong-secret-wrong-secret', token)).toBeNull();
		expect(await readToken(secret, `${body}.`)).toBeNull();
		expect(await readToken(secret, 'garbage')).toBeNull();
	});

	it('signs members out when the passphrase changes', async () => {
		const token = await signToken(secret, { kind: 'member', version: 1, issuedAt: Date.now() });
		expect(await isValidMember(secret, token, 1)).toBe(true);
		expect(await isValidMember(secret, token, 2)).toBe(false);
	});

	it('does not accept a member token as admin, and expires admin sessions', async () => {
		const now = Date.now();
		const member = await signToken(secret, { kind: 'member', version: 0, issuedAt: now });
		const admin = await signToken(secret, { kind: 'admin', version: 0, issuedAt: now });
		expect(await isValidAdmin(secret, member, now)).toBe(false);
		expect(await isValidAdmin(secret, admin, now)).toBe(true);
		expect(await isValidAdmin(secret, admin, now + ADMIN_MAX_AGE * 1000 + 1)).toBe(false);
	});

	it('compares the admin password exactly', async () => {
		expect(await matchesAdminPassword(secret, 'hunter2', 'hunter2')).toBe(true);
		expect(await matchesAdminPassword(secret, 'hunter3', 'hunter2')).toBe(false);
	});
});

describe('passphrase hashing', () => {
	it('verifies the right passphrase only', async () => {
		const hash = await hashSecret('pool night');
		expect(hash).toMatch(/^pbkdf2\$100000\$/);
		expect(await verifySecret('pool night', hash)).toBe(true);
		expect(await verifySecret('pool nights', hash)).toBe(false);
		expect(await verifySecret('pool night', 'not-a-hash')).toBe(false);
	});

	it('salts every hash', async () => {
		expect(await hashSecret('same')).not.toBe(await hashSecret('same'));
	});
});
