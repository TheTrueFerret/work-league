import { argbFromHex, Contrast, Hct } from '@material/material-color-utilities';
import { describe, expect, it } from 'vitest';
import { buildPalette, DEFAULT_SEED, paletteCss } from './palette';

const tone = (hex: string) => Hct.fromInt(argbFromHex(hex)).tone;
const contrast = (a: string, b: string) => Contrast.ratioOfTones(tone(a), tone(b));

describe('palette', () => {
	const seeds = ['#3dcd58', '#e53935', '#1e88e5', '#ffeb3b', '#000000', '#ffffff', '#8e24aa'];

	it.each(seeds)('keeps text readable for seed %s', (seed) => {
		const palette = buildPalette(seed, [{ id: 'pool', accent: '#3dcd58' }]);
		for (const scheme of [palette.light, palette.dark]) {
			expect(contrast(scheme['--text']!, scheme['--bg']!)).toBeGreaterThanOrEqual(7);
			expect(
				contrast(scheme['--accent-on-fill']!, scheme['--accent-fill']!)
			).toBeGreaterThanOrEqual(4.5);
			expect(
				contrast(scheme['--accent-on-soft']!, scheme['--accent-soft']!)
			).toBeGreaterThanOrEqual(4.5);
			expect(contrast(scheme['--muted']!, scheme['--surface']!)).toBeGreaterThanOrEqual(4.5);
			expect(contrast(scheme['--on-side-0']!, scheme['--side-0']!)).toBeGreaterThanOrEqual(3);
			for (const rank of ['bronze', 'silver', 'gold', 'platinum', 'diamond']) {
				expect(
					contrast(scheme[`--rank-${rank}-on-soft`]!, scheme[`--rank-${rank}-soft`]!)
				).toBeGreaterThanOrEqual(4.5);
			}
		}
	});

	it('generates game colours for every module', () => {
		const palette = buildPalette(DEFAULT_SEED, [{ id: 'darts', accent: '#e53935' }]);
		expect(palette.light['--game-darts']).toMatch(/^#[0-9a-f]{6}$/);
		expect(palette.dark['--game-darts-container']).toMatch(/^#[0-9a-f]{6}$/);
	});

	it('falls back to the default seed for a bad colour', () => {
		expect(buildPalette('not-a-colour')).toEqual(buildPalette(DEFAULT_SEED));
	});

	it('renders light and dark blocks', () => {
		const css = paletteCss(buildPalette(DEFAULT_SEED));
		expect(css).toContain(':root{color-scheme:light;');
		expect(css).toContain('@media (prefers-color-scheme: dark)');
	});
});
