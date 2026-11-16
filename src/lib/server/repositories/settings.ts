import { eq, inArray, sql } from 'drizzle-orm';
import * as v from 'valibot';
import { DEFAULT_SEED, isHexColour } from '$lib/theme/palette';
import { getDb } from '../db/client';
import { settings } from '../db/schema';

/**
 * Instance settings live in the database so whoever hosts a league can set it
 * up from the browser, and pull upstream updates without merge conflicts.
 * Each key holds one JSON value, checked against a schema with defaults so a
 * missing or outdated value never breaks a page.
 */

const hexColour = v.pipe(v.string(), v.check(isHexColour, 'Pick a colour like #3dcd58'));

const BrandingSchema = v.object({
	name: v.optional(v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(40)), 'Work League'),
	tagline: v.optional(
		v.pipe(v.string(), v.trim(), v.maxLength(80)),
		'Friendly competition at work.'
	),
	seed: v.optional(hexColour, DEFAULT_SEED),
	/** Bumped on every logo upload so browsers fetch the new one. Null means no logo. */
	logoVersion: v.optional(v.nullable(v.number()), null)
});

const ModulesSchema = v.object({
	/** Module ids that are switched off. Everything else installed is on. */
	disabled: v.optional(v.array(v.string()), [])
});

const AccessSchema = v.object({
	/** PBKDF2 hash of the office passphrase; null leaves the league open. */
	passphraseHash: v.optional(v.nullable(v.string()), null),
	/** Bumped whenever the passphrase changes, which signs everyone out. */
	passphraseVersion: v.optional(v.number(), 0),
	/** Let anyone view rankings without the passphrase, read-only. */
	publicRead: v.optional(v.boolean(), false)
});

const SecretSchema = v.object({ value: v.string() });

const schemas = {
	branding: BrandingSchema,
	modules: ModulesSchema,
	access: AccessSchema,
	secret: SecretSchema
} as const;

export type Branding = v.InferOutput<typeof BrandingSchema>;
export type ModuleSettings = v.InferOutput<typeof ModulesSchema>;
export type AccessSettings = v.InferOutput<typeof AccessSchema>;

export interface Settings {
	branding: Branding;
	modules: ModuleSettings;
	access: AccessSettings;
}

export const defaultSettings = (): Settings => ({
	branding: v.parse(BrandingSchema, {}),
	modules: v.parse(ModulesSchema, {}),
	access: v.parse(AccessSchema, {})
});

/**
 * Settings are read on every request, so each server instance keeps them for
 * a few seconds. A save clears this instance's copy at once; others catch up
 * within the TTL.
 */
const TTL_MS = 10_000;
let cached: { at: number; value: Settings } | undefined;

const lenient = <S extends v.GenericSchema>(schema: S, raw: unknown): v.InferOutput<S> => {
	const parsed = v.safeParse(schema, raw ?? {});
	return parsed.success ? parsed.output : v.parse(schema, {});
};

export async function loadSettings(): Promise<Settings> {
	if (cached && Date.now() - cached.at < TTL_MS) return cached.value;
	const db = await getDb();
	const rows = await db
		.select()
		.from(settings)
		.where(inArray(settings.key, ['branding', 'modules', 'access']));
	const raw = new Map(rows.map((r) => [r.key, r.value]));
	const value: Settings = {
		branding: lenient(BrandingSchema, raw.get('branding')),
		modules: lenient(ModulesSchema, raw.get('modules')),
		access: lenient(AccessSchema, raw.get('access'))
	};
	cached = { at: Date.now(), value };
	return value;
}

type Key = keyof typeof schemas;

/** Validates and stores one settings value. Throws a ValiError for bad input. */
export async function saveSetting<K extends Exclude<Key, 'secret'>>(
	key: K,
	value: v.InferInput<(typeof schemas)[K]>
): Promise<void> {
	const clean = v.parse(schemas[key] as v.GenericSchema, value);
	const db = await getDb();
	await db
		.insert(settings)
		.values({ key, value: clean })
		.onConflictDoUpdate({ target: settings.key, set: { value: clean, updatedAt: sql`now()` } });
	cached = undefined;
}

/**
 * The key that signs session cookies. `SESSION_SECRET` wins when set;
 * otherwise one is generated on first use and kept in the database, so a
 * fresh install needs no extra configuration.
 */
let storedSecret: string | undefined;

export async function sessionSecret(fromEnv: string | undefined): Promise<string> {
	if (fromEnv && fromEnv.length >= 16) return fromEnv;
	// It never changes once created, so read it once per server instance.
	if (storedSecret) return storedSecret;
	storedSecret = await loadOrCreateSecret();
	return storedSecret;
}

async function loadOrCreateSecret(): Promise<string> {
	const db = await getDb();
	const [row] = await db.select().from(settings).where(eq(settings.key, 'secret'));
	const existing = row && v.safeParse(SecretSchema, row.value);
	if (existing?.success) return existing.output.value;

	const bytes = crypto.getRandomValues(new Uint8Array(32));
	const generated = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
	// If two requests race, the first insert wins and both read it back.
	await db
		.insert(settings)
		.values({ key: 'secret', value: { value: generated } })
		.onConflictDoNothing();
	const [stored] = await db.select().from(settings).where(eq(settings.key, 'secret'));
	return v.parse(SecretSchema, stored?.value).value;
}

/** Forget the cached copy, for tests. */
export function clearSettingsCache(): void {
	cached = undefined;
	storedSecret = undefined;
}
