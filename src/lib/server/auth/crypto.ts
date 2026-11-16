/**
 * Small WebCrypto helpers. WebCrypto exists both in Node and on Cloudflare
 * Workers, so nothing here needs a native module.
 */

const encoder = new TextEncoder();

export function toBase64Url(bytes: Uint8Array): string {
	let binary = '';
	for (const b of bytes) binary += String.fromCharCode(b);
	return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function fromBase64Url(text: string): Uint8Array {
	const base64 = text.replace(/-/g, '+').replace(/_/g, '/');
	const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
	const binary = atob(padded);
	return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

/** Compares without leaking how many leading bytes matched. */
export function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
	if (a.length !== b.length) return false;
	let diff = 0;
	for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!;
	return diff === 0;
}

const hmacKeys = new Map<string, Promise<CryptoKey>>();

function hmacKey(secret: string): Promise<CryptoKey> {
	let key = hmacKeys.get(secret);
	if (!key) {
		key = crypto.subtle.importKey(
			'raw',
			encoder.encode(secret),
			{ name: 'HMAC', hash: 'SHA-256' },
			false,
			['sign']
		);
		hmacKeys.set(secret, key);
	}
	return key;
}

export async function hmac(secret: string, message: string): Promise<Uint8Array> {
	const signature = await crypto.subtle.sign('HMAC', await hmacKey(secret), encoder.encode(message));
	return new Uint8Array(signature);
}

/** Cloudflare Workers cap PBKDF2 at 100,000 iterations. */
const ITERATIONS = 100_000;

async function pbkdf2(secret: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
	const key = await crypto.subtle.importKey('raw', encoder.encode(secret), 'PBKDF2', false, [
		'deriveBits'
	]);
	const bits = await crypto.subtle.deriveBits(
		{ name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations },
		key,
		256
	);
	return new Uint8Array(bits);
}

/** Hashes a passphrase for storage as `pbkdf2$<iterations>$<salt>$<hash>`. */
export async function hashSecret(secret: string): Promise<string> {
	const salt = crypto.getRandomValues(new Uint8Array(16));
	const hash = await pbkdf2(secret, salt, ITERATIONS);
	return `pbkdf2$${ITERATIONS}$${toBase64Url(salt)}$${toBase64Url(hash)}`;
}

export async function verifySecret(secret: string, stored: string): Promise<boolean> {
	const [scheme, iterations, salt, hash] = stored.split('$');
	if (scheme !== 'pbkdf2' || !iterations || !salt || !hash) return false;
	const actual = await pbkdf2(secret, fromBase64Url(salt), Number(iterations));
	return constantTimeEqual(actual, fromBase64Url(hash));
}
