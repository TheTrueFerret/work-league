import { defineConfig } from 'drizzle-kit';

// Only `npm run db:generate` uses this file: it diffs the schema below against
// the last snapshot in ./drizzle and writes the next migration. Applying
// migrations is done by scripts/migrate.ts, which also handles PGlite.
export default defineConfig({
	schema: ['./src/lib/server/db/schema.ts', './src/lib/modules/*/server/schema.ts'],
	out: './drizzle',
	dialect: 'postgresql',
	// Supabase and other hosts keep their own tables in other schemas.
	schemaFilter: ['public'],
	verbose: true,
	strict: true
});
