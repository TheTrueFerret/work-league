// Copies a league out of PostgreSQL (Work League 0.1, or the original pool
// ladder) into SQLite. Run: npm run import:postgres -- 'postgres://…'
//
// Writes work-league-import.sql, which you then run on an empty, migrated
// database:
//   Cloudflare D1:     npx wrangler d1 execute DB --remote --file=work-league-import.sql
//   Local SQLite file: add --apply to load it into DATABASE_URL directly
import { writeFileSync } from 'node:fs';
import { createClient } from '@libsql/client';
import postgres from 'postgres';
import { planImport, toSqlFile } from '../src/lib/server/import/postgres';

const args = process.argv.slice(2);
const from = args.find((a) => /^postgres(ql)?:\/\//.test(a));
const apply = args.includes('--apply');
const outIndex = args.indexOf('--out');
const out = outIndex >= 0 ? args[outIndex + 1] : 'work-league-import.sql';

if (!from || !out) {
	console.error(
		"Usage: npm run import:postgres -- 'postgres://…' [--out file.sql] [--apply]\n\n" +
			'  --apply  also load it into the local database at DATABASE_URL (file:…)'
	);
	process.exit(1);
}

const source = postgres(from, { max: 1, prepare: false, onnotice: () => {} });
const plan = await planImport((text) => source.unsafe(text));
await source.end();

writeFileSync(out, toSqlFile(plan));
const { players, matches, ratings, settings } = plan.counts;
console.log(
	`Read a ${plan.source === 'pottr' ? 'pool ladder' : 'Work League 0.1'} database: ` +
		`${players} people, ${matches} matches, ${ratings} ratings, ${settings} settings.\n` +
		`Wrote ${out}.`
);

if (apply) {
	const url = process.env.DATABASE_URL;
	if (!url?.startsWith('file:')) {
		console.error('--apply needs DATABASE_URL=file:… (run `npm run db:migrate` on it first).');
		process.exit(1);
	}
	const target = createClient({ url });
	await target.batch(plan.statements, 'write');
	target.close();
	console.log(`Loaded it into ${url}.`);
} else {
	console.log(
		'\nNext, on an empty database that has been migrated:\n' +
			`  Cloudflare D1:  npx wrangler d1 execute DB --remote --file=${out}\n` +
			`  Local file:     DATABASE_URL=file:… npm run import:postgres -- '<url>' --apply`
	);
}
console.log('Uploaded logos are not copied; upload yours again at /admin.');
