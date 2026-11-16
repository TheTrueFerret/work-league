import { defineConfig } from 'drizzle-kit';

// Only `npm run db:generate` uses this file: it diffs the schema below against
// the last snapshot in ./drizzle and writes the next migration. The same SQL
// files are applied to D1 by Wrangler (`npm run db:migrate:d1`) and to a local
// SQLite file by scripts/migrate.ts.
export default defineConfig({
	schema: ['./src/lib/server/db/schema.ts', './src/lib/modules/*/server/schema.ts'],
	out: './drizzle',
	dialect: 'sqlite',
	verbose: true,
	strict: true
});
