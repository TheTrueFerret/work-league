import { json } from '@sveltejs/kit';
import { themeFor } from '$lib/server/theme';
import type { RequestHandler } from './$types';

/** Generated per league, so an installed app carries the league's own name, icon and colours. */
export const GET: RequestHandler = ({ locals }) => {
	const { branding } = locals.settings;
	const { palette } = themeFor(branding.seed, locals.games);
	const v = branding.logoVersion ?? 0;
	const icon = (file: string, size: number, purpose?: string) => ({
		src: `/brand/${file}?v=${v}`,
		sizes: `${size}x${size}`,
		type: 'image/png',
		...(purpose ? { purpose } : {})
	});

	return json(
		{
			name: branding.name,
			short_name: branding.name.length > 12 ? branding.name.split(' ')[0] : branding.name,
			description: branding.tagline,
			start_url: '/',
			scope: '/',
			display: 'standalone',
			orientation: 'portrait',
			background_color: palette.light['--bg'],
			theme_color: palette.light['--theme-color'],
			categories: ['sports', 'games'],
			icons: [
				icon('icon-192.png', 192),
				icon('icon-512.png', 512),
				icon('icon-maskable-512.png', 512, 'maskable')
			],
			shortcuts: locals.games.slice(0, 4).map((g) => ({
				name: `Play ${g.name.toLowerCase()}`,
				short_name: g.name,
				url: `/${g.id}/play`
			}))
		},
		{
			headers: {
				'content-type': 'application/manifest+json',
				'cache-control': 'public, max-age=300'
			}
		}
	);
};
