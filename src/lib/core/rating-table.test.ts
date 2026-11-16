import { describe, expect, it } from 'vitest';
import { parseRatingTable } from './rating-table';

const people = (text: string) => parseRatingTable(text).rows.map((r) => [r.name, r.rating]);

describe('reading a table of names and ratings', () => {
	it('reads plain CSV with a header row', () => {
		expect(people('Name,Elo\nAda,1200\nLinus,980\n')).toEqual([
			['Ada', 1200],
			['Linus', 980]
		]);
	});

	it('reads CSV without a header', () => {
		expect(people('Ada,1200\r\nLinus,980')).toEqual([
			['Ada', 1200],
			['Linus', 980]
		]);
	});

	it('reads cells pasted from a spreadsheet (tabs)', () => {
		expect(people('Speler\tELO\nAda\t1200\nGrace Hopper\t1015')).toEqual([
			['Ada', 1200],
			['Grace Hopper', 1015]
		]);
	});

	it('reads semicolon CSV with decimal commas, as Excel writes it in Belgium', () => {
		expect(people('Naam;Elo\nAda;1200,6\nLinus;1 015')).toEqual([
			['Ada', 1201],
			['Linus', 1015]
		]);
	});

	it('handles quotes, a byte order mark, extra columns and blank lines', () => {
		expect(
			people('﻿"Name","Rating","Team"\n"Hopper, Grace","1100",Blue\n\n  Ada  ,  1200 ,x\n')
		).toEqual([
			['Hopper, Grace', 1100],
			['Ada', 1200]
		]);
	});

	it('explains every line it cannot use', () => {
		const { rows, errors } = parseRatingTable(
			'Name,Elo\nAda,1200\nLinus,abc\nGrace,\n,1000\nada,1100\nKen,99999'
		);
		expect(rows.map((r) => r.name)).toEqual(['Ada']);
		expect(errors).toEqual([
			'Line 3: “abc” is not a rating',
			'Line 4: Grace has no rating',
			'Line 5: the name is empty',
			'Line 6: ada is already on line 2',
			'Line 7: 99999 is outside 0–5000'
		]);
	});

	it('returns nothing for empty input', () => {
		expect(parseRatingTable('  \n ')).toEqual({ rows: [], errors: [] });
	});
});
