import adapter from '@sveltejs/adapter-cloudflare';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
	// The standalone scripts read process.env, so mirror .env into it during dev.
	// On Cloudflare the environment arrives per request instead — see hooks.server.js.
	Object.assign(process.env, loadEnv(mode, process.cwd(), ''));

	return {
		plugins: [
			sveltekit({
				compilerOptions: {
					// Force runes mode for the project, except for libraries.
					runes: ({ filename }) =>
						filename.split(/[/\\]/).includes('node_modules') ? undefined : true
				},
				adapter: adapter()
			})
		]
	};
});
