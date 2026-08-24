import { connectionString } from './src/lib/server/connection.js';

/** @type {import('drizzle-kit').Config} */
export default {
	schema: './src/lib/server/schema.js',
	out: './drizzle',
	dialect: 'postgresql',
	dbCredentials: {
		url: connectionString(process.env)
	},
	// Supabase manages these itself.
	schemaFilter: ['public'],
	verbose: true,
	strict: true
};
