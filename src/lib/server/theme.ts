import type { GameModule } from '$lib/modules/types';
import { buildPalette, paletteCss, type Palette } from '$lib/theme/palette';

interface RenderedTheme {
	readonly palette: Palette;
	readonly css: string;
}

const cache = new Map<string, RenderedTheme>();

/** The league's palette for a brand colour. Computed once per colour and reused. */
export function themeFor(seed: string, games: readonly GameModule[]): RenderedTheme {
	const key = `${seed}|${games.map((g) => `${g.id}:${g.accent}`).join(',')}`;
	let theme = cache.get(key);
	if (!theme) {
		const palette = buildPalette(seed, games);
		theme = { palette, css: paletteCss(palette) };
		if (cache.size > 20) cache.clear();
		cache.set(key, theme);
	}
	return theme;
}
