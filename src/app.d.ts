// See https://svelte.dev/docs/kit/types#app.d.ts
declare global {
	namespace App {
		// interface Error {}
		// interface Locals {}
		// interface PageData {}
		// interface PageState {}

		/** What Cloudflare hands each request. Absent under `vite dev` and Node. */
		interface Platform {
			env?: {
				/** Supabase connection string, set with `wrangler secret put`. */
				DATABASE_URL?: string;
			};
			context?: {
				waitUntil(promise: Promise<unknown>): void;
			};
		}
	}
}

export {};
