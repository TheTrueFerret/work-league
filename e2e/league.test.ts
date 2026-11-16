import { expect, test, type Page } from '@playwright/test';

/** Each project gets its own players, as both run against one database. */
const unique = (name: string, page: Page) => `${name} ${page.viewportSize()!.width}`;

async function addPlayer(page: Page, name: string) {
	await page.goto('/players', { waitUntil: 'networkidle' });
	await page.getByPlaceholder('Add a person').fill(name);
	await page.getByRole('button', { name: 'Add', exact: true }).click();
	await expect(page.getByRole('link', { name: new RegExp(name) })).toBeVisible();
}

test('the launcher lists every game and the championship', async ({ page }) => {
	await page.goto('/');
	await expect(page.getByRole('heading', { level: 1 })).toHaveText('Work League');
	for (const game of ['Pool', 'Ping pong', 'Darts']) {
		await expect(page.getByRole('link', { name: new RegExp(`^${game}`) })).toBeVisible();
	}
	await expect(page.getByText('made by')).toBeVisible();
	await expect(page.getByRole('link', { name: 'TheTrueFerret' })).toHaveAttribute(
		'href',
		'https://github.com/TheTrueFerret'
	);
});

test('a pool result moves the rankings', async ({ page }) => {
	const ada = unique('Ada', page);
	const linus = unique('Linus', page);
	await addPlayer(page, ada);
	await addPlayer(page, linus);

	await page.goto('/pool/play');
	await page.getByRole('button', { name: new RegExp(`^${ada}`) }).click();
	await page.getByRole('button', { name: new RegExp(`^${linus}`) }).click();
	await page.getByRole('button', { name: new RegExp(`^${linus}`) }).click();
	await page.getByRole('button', { name: 'Team A won' }).click();

	await expect(page).toHaveURL(/\/pool\?recorded=/);
	await expect(page.getByText('Result saved')).toBeVisible();
	await expect(page.locator('ol li').filter({ hasText: ada }).first()).toContainText('1020');
});

test('the passphrase keeps outsiders out and the admin in', async ({ page, context }) => {
	await page.goto('/admin');
	await expect(page).toHaveURL(/\/admin\/login/);
	await page.getByLabel('Admin password').fill('wrong');
	await page.getByRole('button', { name: 'Sign in' }).click();
	await expect(page.getByRole('alert')).toContainText('not the admin password');
	await page.getByLabel('Admin password').fill('e2e-admin-password');
	await page.getByRole('button', { name: 'Sign in' }).click();
	await expect(page.getByRole('heading', { name: 'Admin' })).toBeVisible();

	await page
		.getByLabel(/passphrase/i)
		.first()
		.fill('table tennis');
	await page.getByRole('button', { name: /Set passphrase|Change/ }).click();
	await expect(page.getByText('Passphrase updated')).toBeVisible();

	// A colleague without the passphrase is sent to the unlock screen.
	const outsider = await context.browser()!.newContext();
	const other = await outsider.newPage();
	await other.goto(page.url().replace(/\/admin.*/, '/pool'));
	await expect(other).toHaveURL(/\/unlock/);
	await other.getByLabel('Passphrase').fill('table tennis');
	await other.getByRole('button', { name: 'Unlock' }).click();
	await expect(other).toHaveURL(/\/pool$/);
	await outsider.close();

	// Leave the league open for the other tests.
	await page.getByRole('button', { name: 'Remove passphrase' }).click();
	await expect(page.getByText('The league is open')).toBeVisible();
});
