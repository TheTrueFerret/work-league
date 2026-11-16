import type { GameModule } from '$lib/modules/types';
import type { ServerEnv } from '$lib/server/env';
import type { Settings } from '$lib/server/repositories/settings';

// See https://svelte.dev/docs/kit/types#app.d.ts
declare global {
	namespace App {
		interface Error {
			message: string;
		}

		interface Locals {
			env: ServerEnv;
			settings: Settings;
			/** Installed modules that are switched on, in registry order. */
			games: readonly GameModule[];
			/** Knows the office passphrase (or the league has none). May record results. */
			member: boolean;
			/** Signed in with ADMIN_PASSWORD. */
			admin: boolean;
			/** Key for signing cookies. */
			secret: string;
		}

		/** What Cloudflare hands each request. Absent under `vite dev` and Node. */
		interface Platform {
			env?: {
				DATABASE_URL?: string;
				ADMIN_PASSWORD?: string;
				SESSION_SECRET?: string;
			};
			context?: {
				waitUntil(promise: Promise<unknown>): void;
			};
		}
	}
}

export {};
