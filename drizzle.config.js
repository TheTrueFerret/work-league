/** @type {import('drizzle-kit').Config} */
export default {
	schema: './src/lib/server/schema.js',
	out: './drizzle',
	dialect: 'postgresql',
	dbCredentials: {
		url: process.env.DATABASE_URL ?? ''
	},
	// Supabase manages these itself.
	schemaFilter: ['public'],
	verbose: true,
	strict: true
};
