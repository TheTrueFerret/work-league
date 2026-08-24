/**
 * Builds the Postgres connection string from its two halves.
 *
 * The host, port, user and database name aren't sensitive, so `DATABASE_URL`
 * can sit in plain sight — in `wrangler.jsonc`, or as a normal variable in the
 * dashboard. `DATABASE_PASSWORD` is the only part that needs to be a secret.
 *
 * Assembling it here also means nobody has to percent-encode a password
 * containing `@`, `#` or `/` by hand; the URL serialiser does it.
 *
 * A password already embedded in `DATABASE_URL` still works, and
 * `DATABASE_PASSWORD` overrides it when both are present.
 *
 * @param {{ DATABASE_URL?: string, DATABASE_PASSWORD?: string }} env
 * @returns {string}
 */
export function connectionString(env) {
	const base = env.DATABASE_URL?.trim();
	if (!base) throw new Error(`DATABASE_URL is not set. ${where}`);

	let url;
	try {
		url = new URL(base);
	} catch {
		throw new Error('DATABASE_URL is not a valid connection string.');
	}

	const password = env.DATABASE_PASSWORD?.trim();
	// The setter percent-encodes whatever it is given.
	if (password) url.password = password;

	if (!url.password || url.password.includes('%5B')) {
		throw new Error(`DATABASE_PASSWORD is not set. ${where}`);
	}

	return url.toString();
}

const where =
	'On Cloudflare: `npx wrangler secret put DATABASE_PASSWORD` and set DATABASE_URL ' +
	'as a variable. Locally: copy .env.example to .env.';
