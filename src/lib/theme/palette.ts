import {
	argbFromHex,
	Blend,
	Hct,
	hexFromArgb,
	MaterialDynamicColors as Colors,
	SchemeTonalSpot,
	TonalPalette,
	type DynamicScheme
} from '@material/material-color-utilities';

/**
 * Turns one brand colour into the whole UI palette, the way Android's
 * Material You does: tonal palettes derived from the seed, with contrast
 * between text and its background built in. Game and side colours are
 * nudged towards the seed's hue so they sit well with any brand.
 *
 * Runs on the server to render the theme into every page, and in the admin
 * screen for a live preview.
 */

export const DEFAULT_SEED = '#3dcd58';

/** Colours for teams and free-for-all players, in side order. */
const SIDE_COLOURS = ['#0a6ed1', '#e07000', '#8e44ad', '#00897b', '#d81b60', '#c0a000', '#6d4c41', '#0097a7'];
const WIN = '#2e9e4f';

export interface ModuleAccent {
	readonly id: string;
	readonly accent: string;
}

export const isHexColour = (value: string): boolean => /^#[0-9a-f]{6}$/i.test(value);

type Tokens = Record<string, string>;

function schemeTokens(scheme: DynamicScheme, seed: number, modules: readonly ModuleAccent[]): Tokens {
	const c = (colour: { getArgb(s: DynamicScheme): number }) => hexFromArgb(colour.getArgb(scheme));
	const dark = scheme.isDark;
	const tone = (argb: number, light: number, night: number) =>
		hexFromArgb(TonalPalette.fromInt(Blend.harmonize(argb, seed)).tone(dark ? night : light));

	const tokens: Tokens = {
		'--bg': c(dark ? Colors.surface : Colors.surfaceContainerLow),
		'--surface': c(dark ? Colors.surfaceContainerLow : Colors.surfaceContainerLowest),
		'--surface-2': c(Colors.surfaceContainerHigh),
		'--surface-3': c(Colors.surfaceContainerHighest),
		'--border': c(Colors.outlineVariant),
		'--outline': c(Colors.outline),
		'--text': c(Colors.onSurface),
		'--muted': c(Colors.onSurfaceVariant),
		'--accent': c(Colors.primary),
		'--accent-fill': c(Colors.primary),
		'--accent-on-fill': c(Colors.onPrimary),
		'--accent-soft': c(Colors.primaryContainer),
		'--accent-on-soft': c(Colors.onPrimaryContainer),
		'--secondary-soft': c(Colors.secondaryContainer),
		'--secondary-on-soft': c(Colors.onSecondaryContainer),
		'--loss': c(Colors.error),
		'--loss-soft': c(Colors.errorContainer),
		'--win': tone(argbFromHex(WIN), 40, 80),
		'--theme-color': c(dark ? Colors.surface : Colors.surfaceContainerLow)
	};

	SIDE_COLOURS.forEach((hex, i) => {
		const argb = argbFromHex(hex);
		tokens[`--side-${i}`] = tone(argb, 45, 75);
		tokens[`--on-side-${i}`] = tone(argb, 100, 10);
	});

	for (const module of modules) {
		const argb = argbFromHex(isHexColour(module.accent) ? module.accent : DEFAULT_SEED);
		tokens[`--game-${module.id}`] = tone(argb, 40, 80);
		tokens[`--game-${module.id}-container`] = tone(argb, 90, 30);
		tokens[`--game-${module.id}-on-container`] = tone(argb, 10, 90);
	}
	return tokens;
}

export interface Palette {
	readonly light: Tokens;
	readonly dark: Tokens;
}

export function buildPalette(seedHex: string, modules: readonly ModuleAccent[] = []): Palette {
	const seed = argbFromHex(isHexColour(seedHex) ? seedHex : DEFAULT_SEED);
	const hct = Hct.fromInt(seed);
	return {
		light: schemeTokens(new SchemeTonalSpot(hct, false, 0), seed, modules),
		dark: schemeTokens(new SchemeTonalSpot(hct, true, 0), seed, modules)
	};
}

const block = (tokens: Tokens): string =>
	Object.entries(tokens)
		.map(([name, value]) => `${name}:${value};`)
		.join('');

/** The palette as a stylesheet: light by default, dark when the device prefers it. */
export function paletteCss(palette: Palette): string {
	return (
		`:root{color-scheme:light;${block(palette.light)}}` +
		`@media (prefers-color-scheme: dark){:root{color-scheme:dark;${block(palette.dark)}}}`
	);
}
