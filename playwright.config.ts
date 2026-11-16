import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defineConfig, devices } from '@playwright/test';

const PORT = 5180;

/** A new SQLite file for every run. */
const database = join(mkdtempSync(join(tmpdir(), 'work-league-e2e-')), 'league.db');

/**
 * Browser smoke tests against the dev server on a throwaway SQLite
 * database, so they never touch real data. Run: npm run test:e2e
 */
export default defineConfig({
	testDir: 'e2e',
	fullyParallel: false,
	workers: 1,
	use: {
		baseURL: `http://localhost:${PORT}`,
		trace: 'retain-on-failure',
		// Use an installed Chromium instead of Playwright's download, if you have one.
		launchOptions: process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}
	},
	projects: [
		{ name: 'phone', use: { ...devices['Pixel 7'] } },
		{ name: 'desktop', use: { ...devices['Desktop Chrome'] } }
	],
	webServer: {
		command: `npx vite dev --port ${PORT} --strictPort`,
		port: PORT,
		reuseExistingServer: false,
		env: { DATABASE_URL: `file:${database}`, ADMIN_PASSWORD: 'e2e-admin-password' }
	}
});
