import cloudflare from '@sveltejs/adapter-cloudflare';
import node from '@sveltejs/adapter-node';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig, loadEnv } from 'vite';

/**
 * Where the built app runs. Cloudflare Workers is the default; set
 * WORK_LEAGUE_ADAPTER=node for Docker or any plain Node host.
 */
const target = process.env.WORK_LEAGUE_ADAPTER === 'node' ? 'node' : 'cloudflare';

/** Workers use the D1 binding; a stub keeps the native libSQL driver out of the Worker. */
const stub = '/src/lib/server/db/libsql-unavailable.ts';
const withoutLibsql = [
	{ find: /^@libsql\/client$/, replacement: stub },
	{ find: /^drizzle-orm\/libsql(\/migrator)?$/, replacement: stub }
];

export default defineConfig(({ command, mode }) => {
	// Mirror .env into process.env during dev so the database client and the
	// scripts see the same configuration. Cloudflare passes it per request.
	Object.assign(process.env, loadEnv(mode, process.cwd(), ''));

	return {
		plugins: [
			sveltekit({
				compilerOptions: {
					// Force runes mode for the project, except for libraries.
					runes: ({ filename }) =>
						filename.split(/[/\\]/).includes('node_modules') ? undefined : true
				},
				adapter: target === 'node' ? node({ out: 'build' }) : cloudflare()
			})
		],
		resolve: {
			alias: command === 'build' && target === 'cloudflare' ? withoutLibsql : []
		},
		ssr: {
			// Its published ESM has an import without a file extension, which Node
			// rejects; letting Vite bundle it resolves that.
			noExternal: ['@material/material-color-utilities']
		},
		test: {
			include: ['src/**/*.test.ts'],
			server: { deps: { inline: ['@material/material-color-utilities'] } }
		}
	};
});
