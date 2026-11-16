import { redirect, type Handle, type HandleServerError } from '@sveltejs/kit';
import { sequence } from '@sveltejs/kit/hooks';
import { installedModules } from '$lib/modules/registry';
import { ADMIN_COOKIE, isValidAdmin, isValidMember, MEMBER_COOKIE } from '$lib/server/auth/session';
import {
	configureDatabase,
	DatabaseNotConfiguredError,
	withRequestConnection
} from '$lib/server/db/client';
import { readEnv } from '$lib/server/env';
import { loadSettings, sessionSecret } from '$lib/server/repositories/settings';
import { themeFor } from '$lib/server/theme';

/** Reachable without the office passphrase. */
const PUBLIC_PATHS = ['/unlock', '/admin/login', '/manifest.webmanifest'];
const PUBLIC_PREFIXES = ['/brand/'];

const isPublic = (path: string) =>
	PUBLIC_PATHS.includes(path) || PUBLIC_PREFIXES.some((prefix) => path.startsWith(prefix));

/**
 * Cloudflare Workers get a connection per request (a socket may not outlive
 * it); Node keeps one shared pool and only needs the URL.
 */
const database: Handle = async ({ event, resolve }) => {
	event.locals.env = readEnv(event);
	const url = event.locals.env.databaseUrl;
	const platform = event.platform;

	if (!platform?.env) {
		configureDatabase(url);
		return resolve(event);
	}
	return withRequestConnection(
		url,
		async () => resolve(event),
		(promise) => platform.context?.waitUntil(promise)
	);
};

/** Loads settings and works out who is asking: visitor, member or admin. */
const access: Handle = async ({ event, resolve }) => {
	const settings = await loadSettings();
	const secret = await sessionSecret(event.locals.env.sessionSecret);
	const { access } = settings;

	event.locals.settings = settings;
	event.locals.secret = secret;
	event.locals.games = installedModules.filter((m) => !settings.modules.disabled.includes(m.id));

	const adminConfigured = Boolean(event.locals.env.adminPassword);
	event.locals.admin =
		adminConfigured && (await isValidAdmin(secret, event.cookies.get(ADMIN_COOKIE)));
	event.locals.member =
		event.locals.admin ||
		access.passphraseHash === null ||
		(await isValidMember(secret, event.cookies.get(MEMBER_COOKIE), access.passphraseVersion));

	const path = event.url.pathname;
	if (isPublic(path)) return resolve(event);

	if (path === '/admin' || path.startsWith('/admin/')) {
		if (!event.locals.admin) redirect(303, `/admin/login?next=${encodeURIComponent(path)}`);
		return resolve(event);
	}

	if (!event.locals.member) {
		const reading = event.request.method === 'GET' || event.request.method === 'HEAD';
		// A public league lets anyone look, but only members can change anything.
		if (!(reading && access.publicRead)) {
			const next = encodeURIComponent(path + event.url.search);
			redirect(303, `/unlock?next=${next}`);
		}
	}
	return resolve(event);
};

const escapeHtml = (text: string) => text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** Writes the brand colours and name into the HTML so the first paint is already themed. */
const theme: Handle = ({ event, resolve }) => {
	const { branding } = event.locals.settings;
	const rendered = themeFor(branding.seed, event.locals.games);
	return resolve(event, {
		transformPageChunk: ({ html }) =>
			html
				.replace('%wl.theme%', rendered.css)
				.replaceAll('%wl.name%', escapeHtml(branding.name))
				.replace('%wl.description%', escapeHtml(branding.tagline))
				.replace('%wl.themeLight%', rendered.palette.light['--theme-color'] ?? '#ffffff')
				.replace('%wl.themeDark%', rendered.palette.dark['--theme-color'] ?? '#000000')
				.replaceAll('%wl.assetVersion%', String(branding.logoVersion ?? 0))
	});
};

export const handle = sequence(database, access, theme);

/**
 * The one failure worth explaining: a deploy with no database configured.
 * Everything else is logged and shown as a generic message.
 */
export const handleError: HandleServerError = ({ error }) => {
	if (error instanceof DatabaseNotConfiguredError) {
		console.error(error.message);
		return { message: 'This Work League has no database yet. Set DATABASE_URL and restart it.' };
	}
	console.error(error);
	return { message: 'Something went wrong' };
};
