/**
 * Reads a two-column table of names and ratings: a CSV file, or cells copied
 * straight out of Excel or Google Sheets. Used in the browser for the preview
 * and again on the server, which trusts nothing the browser said.
 */

export interface RatingRow {
	/** Line in the original text, from 1, for error messages. */
	readonly line: number;
	readonly name: string;
	readonly rating: number;
}

export interface RatingTable {
	readonly rows: RatingRow[];
	/** One readable message per line that could not be used. */
	readonly errors: string[];
}

export const MIN_IMPORT_RATING = 0;
export const MAX_IMPORT_RATING = 5000;
export const MAX_IMPORT_ROWS = 1000;
const MAX_NAME_LENGTH = 40;

/**
 * Tabs when pasted from a spreadsheet, semicolons from Excel in countries that
 * write decimals with a comma, commas otherwise.
 */
function detectDelimiter(firstLine: string): string {
	if (firstLine.includes('\t')) return '\t';
	if (firstLine.includes(';')) return ';';
	return ',';
}

/** Splits CSV text into rows of cells, honouring "quoted, cells" and "" escapes. */
function splitRows(text: string, delimiter: string): { line: number; cells: string[] }[] {
	const rows: { line: number; cells: string[] }[] = [];
	let cells: string[] = [];
	let cell = '';
	let quoted = false;
	let line = 1;
	let rowStart = 1;

	const endRow = () => {
		cells.push(cell);
		if (cells.some((c) => c.trim() !== '')) rows.push({ line: rowStart, cells });
		cells = [];
		cell = '';
	};

	for (let i = 0; i < text.length; i++) {
		const c = text[i]!;
		if (quoted) {
			if (c === '"' && text[i + 1] === '"') {
				cell += '"';
				i++;
			} else if (c === '"') quoted = false;
			else {
				if (c === '\n') line++;
				cell += c;
			}
		} else if (c === '"' && cell.trim() === '') {
			quoted = true;
			cell = '';
		} else if (c === delimiter) {
			cells.push(cell);
			cell = '';
		} else if (c === '\n' || c === '\r') {
			if (c === '\r' && text[i + 1] === '\n') i++;
			endRow();
			line++;
			rowStart = line;
		} else cell += c;
	}
	endRow();
	return rows;
}

/** "1234", "1234.6", "1 234", and "1234,6" when commas are not the delimiter. */
function parseRating(raw: string, delimiter: string): number | null {
	let text = raw.trim().replace(/[\s\u00a0']/g, '');
	if (delimiter !== ',') text = text.replace(',', '.');
	if (!/^-?\d+(\.\d+)?$/.test(text)) return null;
	return Math.round(Number(text));
}

export function parseRatingTable(text: string): RatingTable {
	const clean = text.replace(/^\uFEFF/, '');
	const firstLine = clean.split(/\r?\n/).find((l) => l.trim() !== '') ?? '';
	const delimiter = detectDelimiter(firstLine);
	const parsed = splitRows(clean, delimiter);

	const rows: RatingRow[] = [];
	const errors: string[] = [];
	const seen = new Map<string, number>();

	parsed.forEach(({ line, cells }, index) => {
		const name = (cells[0] ?? '').trim().replace(/\s+/g, ' ');
		const rawRating = cells[1] ?? '';
		const rating = parseRating(rawRating, delimiter);

		// A first row like "Name, Elo" is a header, not a person.
		if (index === 0 && rating === null) return;

		if (!name) return void errors.push(`Line ${line}: the name is empty`);
		if (name.length > MAX_NAME_LENGTH)
			return void errors.push(`Line ${line}: “${name.slice(0, 20)}…” is too long for a name`);
		if (rating === null)
			return void errors.push(
				rawRating.trim()
					? `Line ${line}: “${rawRating.trim()}” is not a rating`
					: `Line ${line}: ${name} has no rating`
			);
		if (rating < MIN_IMPORT_RATING || rating > MAX_IMPORT_RATING)
			return void errors.push(
				`Line ${line}: ${rating} is outside ${MIN_IMPORT_RATING}–${MAX_IMPORT_RATING}`
			);
		const key = name.toLowerCase();
		const earlier = seen.get(key);
		if (earlier !== undefined)
			return void errors.push(`Line ${line}: ${name} is already on line ${earlier}`);
		seen.set(key, line);
		rows.push({ line, name, rating });
	});

	if (rows.length > MAX_IMPORT_ROWS)
		errors.push(`That is ${rows.length} people; import at most ${MAX_IMPORT_ROWS} at a time`);
	return { rows, errors };
}
