/**
 * Moves a league out of PostgreSQL, where Work League 0.1 and the original pool
 * ladder (Open Pottr) kept their data, into SQL statements for the SQLite
 * schema: run them on D1 with `wrangler d1 execute`, or on a local file.
 *
 * Ratings are copied, not recalculated, so every number stays exactly as it was.
 * Uploaded logos are left out (D1 caps a statement at 100 KB); upload it again
 * at /admin afterwards.
 */

/** Runs one query on the source database and returns its rows. */
export type Query = (text: string) => Promise<Record<string, unknown>[]>;

export interface ImportPlan {
	/** Which schema the source database had. */
	source: 'work-league-0.1' | 'pottr';
	counts: { players: number; matches: number; ratings: number; settings: number };
	/** Every statement, in order, without a trailing semicolon. */
	statements: string[];
}

/** Keeps each statement well under D1's 100 KB limit. */
const MAX_STATEMENT = 90_000;

export function sqlValue(value: unknown): string {
	if (value === null || value === undefined) return 'NULL';
	if (typeof value === 'boolean') return value ? '1' : '0';
	if (typeof value === 'number') {
		if (!Number.isFinite(value)) throw new Error(`Cannot import the number ${value}`);
		return String(value);
	}
	if (typeof value === 'bigint') return value.toString();
	if (value instanceof Date) return String(value.getTime());
	if (typeof value === 'string') return `'${value.replaceAll("'", "''")}'`;
	// jsonb columns arrive parsed; SQLite keeps JSON as text.
	return sqlValue(JSON.stringify(value));
}

function inserts(table: string, columns: readonly string[], rows: readonly unknown[][]): string[] {
	const head = `INSERT INTO \`${table}\` (${columns.map((c) => `\`${c}\``).join(', ')}) VALUES `;
	const out: string[] = [];
	let tuples: string[] = [];
	let size = head.length;
	for (const row of rows) {
		const tuple = `(${row.map(sqlValue).join(', ')})`;
		if (tuple.length + head.length > MAX_STATEMENT) {
			throw new Error(`A row in ${table} is too large to import (${tuple.length} bytes)`);
		}
		if (tuples.length && size + tuple.length + 2 > MAX_STATEMENT) {
			out.push(head + tuples.join(', '));
			tuples = [];
			size = head.length;
		}
		tuples.push(tuple);
		size += tuple.length + 2;
	}
	if (tuples.length) out.push(head + tuples.join(', '));
	return out;
}

const pick = (rows: Record<string, unknown>[], columns: readonly string[]) =>
	rows.map((row) => columns.map((c) => row[c]));

const PLAYERS = ['id', 'name', 'active', 'created_at'] as const;
const MATCHES = ['id', 'module_id', 'played_at', 'note', 'details'] as const;
const LINES = ['match_id', 'player_id', 'side', 'placement', 'rating_before', 'delta'] as const;
const RATINGS = [
	'module_id',
	'player_id',
	'rating',
	'games',
	'wins',
	'losses',
	'peak',
	'streak',
	'form',
	'last_played'
] as const;
const SETTINGS = ['key', 'value', 'updated_at'] as const;

/** Reads every league table from the source and turns it into SQLite inserts. */
export async function planImport(query: Query): Promise<ImportPlan> {
	const [tables] = await query(`
		select
			to_regclass('match_players') is not null as modern,
			to_regclass('participants') is not null as pottr`);
	const source = tables?.modern ? 'work-league-0.1' : tables?.pottr ? 'pottr' : undefined;
	if (!source) throw new Error('That database has no Work League or pool ladder tables.');

	const players = await query(`select id, name, active, created_at from players order by id`);
	let matches, lines, ratings;
	let settings: Record<string, unknown>[] = [];

	if (source === 'work-league-0.1') {
		matches = await query(
			`select id, module_id, played_at, note, details from matches order by id`
		);
		lines = await query(
			`select match_id, player_id, side, placement, rating_before, delta
			 from match_players order by match_id, player_id`
		);
		ratings = await query(
			`select ${RATINGS.join(', ')} from ratings order by module_id, player_id`
		);
		settings = await query(`select key, value, updated_at from settings order by key`);
	} else {
		// The pool ladder had teams A and B and a won flag; Work League has numbered
		// sides and placements, and keeps the winning side in the match details.
		matches = await query(`
			select m.id, 'pool' as module_id, m.played_at, m.note,
				coalesce(
					(select json_build_object('winner', case p.team when 'A' then 0 else 1 end)
					 from participants p where p.match_id = m.id and p.won limit 1),
					'{}'::json
				) as details
			from matches m order by m.id`);
		lines = await query(`
			select match_id, player_id,
				case team when 'A' then 0 else 1 end as side,
				case when won then 1 else 2 end as placement,
				rating_before, delta
			from participants order by match_id, player_id`);
		ratings = await query(`
			select 'pool' as module_id, player_id, rating, games, wins, losses, peak, streak, form, last_played
			from standings order by player_id`);
	}

	// The logo itself is not imported, so forget it was ever uploaded.
	settings = settings.map((row) =>
		row.key === 'branding' && row.value && typeof row.value === 'object'
			? { ...row, value: { ...(row.value as object), logoVersion: null } }
			: row
	);

	const statements = [
		// Refuses to run on a league that already has people in it: a NULL version
		// breaks a NOT NULL constraint, which stops the import before it starts.
		"INSERT INTO `game_versions` (`module_id`, `version`) SELECT '_import', NULL WHERE EXISTS (SELECT 1 FROM `players`)",
		...inserts('players', PLAYERS, pick(players, PLAYERS)),
		...inserts('matches', MATCHES, pick(matches, MATCHES)),
		...inserts('match_players', LINES, pick(lines, LINES)),
		...inserts('ratings', RATINGS, pick(ratings, RATINGS)),
		...inserts('settings', SETTINGS, pick(settings, SETTINGS))
	];

	return {
		source,
		counts: {
			players: players.length,
			matches: matches.length,
			ratings: ratings.length,
			settings: settings.length
		},
		statements
	};
}

/** The plan as one SQL file. */
export const toSqlFile = (plan: ImportPlan): string =>
	`-- Work League import from PostgreSQL (${plan.source}), ${new Date().toISOString()}\n` +
	plan.statements.map((s) => `${s};\n`).join('');
