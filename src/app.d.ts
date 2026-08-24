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
				/** Connection string without the password. Not sensitive. */
				DATABASE_URL?: string;
				/** Set with `wrangler secret put DATABASE_PASSWORD`. */
				DATABASE_PASSWORD?: string;
			};
			context?: {
				waitUntil(promise: Promise<unknown>): void;
			};
		}
	}
}

export {};
