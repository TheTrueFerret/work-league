import { expect, test, type Page } from '@playwright/test';

/** Each project gets its own players, as both run against one database. */
const unique = (name: string, page: Page) => `${name} ${page.viewportSize()!.width}`;

/** Signs in with ADMIN_PASSWORD from playwright.config.ts. */
async function signInAsAdmin(page: Page, next = '/admin') {
	await page.goto(`/admin/login?next=${encodeURIComponent(next)}`);
	await page.getByLabel('Admin password').fill('e2e-admin-password');
	await page.getByRole('button', { name: 'Sign in' }).click();
	await expect(page).toHaveURL(new RegExp(`${next}$`));
}

/** Only admins can add people. */
async function addPlayer(page: Page, name: string) {
	await page.goto('/players', { waitUntil: 'networkidle' });
	if (await page.getByText('Only an admin can add people').isVisible()) {
		await signInAsAdmin(page, '/players');
		await page.waitForLoadState('networkidle');
	}
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

test('branding keeps what was typed, and a logo can be cropped before upload', async ({ page }) => {
	await page.goto('/admin/login?next=/admin');
	await page.getByLabel('Admin password').fill('e2e-admin-password');
	await page.getByRole('button', { name: 'Sign in' }).click();
	await expect(page.getByRole('heading', { name: 'Admin', exact: true })).toBeVisible();
	await page.waitForLoadState('networkidle');

	// Saving used to reset the form and blank every field.
	await page.getByLabel('League name').fill('Crop League');
	await page.getByLabel('Brand colour hex').fill('#E05A2B');
	await page.getByRole('button', { name: 'Save branding' }).click();
	await expect(page.getByText('Branding saved.')).toBeVisible();
	await expect(page.getByLabel('League name')).toHaveValue('Crop League');
	await expect(page.getByLabel('Brand colour hex')).toHaveValue('#e05a2b');

	// The link-preview card redraws itself and chat apps are pointed at it.
	const ogImage = async () => {
		const head = await (await page.request.get('/')).text();
		if (!head.includes('<meta property="og:title" content="Crop League" />')) return null;
		return (
			head.match(/property="og:image" content="([^"]+)"/)?.[1]?.replaceAll('&amp;', '&') ?? null
		);
	};
	await expect.poll(ogImage).toMatch(/\/brand\/share-card\.jpg\?v=[1-9]\d+$/);
	const image = await ogImage();
	const card = await page.request.get(image!);
	expect(card.headers()['content-type']).toBe('image/jpeg');

	// A wide logo with its mark off to one side: zoom in before uploading.
	await page.locator('input[type=file][accept^="image"]').setInputFiles({
		name: 'logo.svg',
		mimeType: 'image/svg+xml',
		buffer: Buffer.from(
			'<svg xmlns="http://www.w3.org/2000/svg" width="300" height="100"><circle cx="220" cy="50" r="40" fill="#e05a2b"/></svg>'
		)
	});
	const cropper = page.getByRole('dialog', { name: 'Position your logo' });
	await expect(cropper).toBeVisible();
	await cropper.getByRole('button', { name: 'Zoom in' }).click();
	await expect(cropper.getByRole('slider', { name: 'Zoom' })).toHaveAttribute(
		'aria-valuetext',
		'125%'
	);
	await cropper.getByRole('button', { name: 'Use this' }).click();
	await expect(cropper).toBeHidden();
	await expect(page.getByAltText('New logo preview')).toBeVisible();
	await page.getByRole('button', { name: 'Upload logo' }).click();
	await expect(page.getByText('Logo saved.')).toBeVisible();
	await expect(page.getByLabel('League name')).toHaveValue('Crop League');

	// Put the defaults back for the other tests.
	await page.getByRole('button', { name: 'Remove logo' }).click();
	await expect(page.getByAltText('Current logo')).toBeHidden();
	await page.getByLabel('League name').fill('Work League');
	await page.getByLabel('Brand colour hex').fill('#3dcd58');
	await page.getByRole('button', { name: 'Save branding' }).click();
	await expect(page.getByText('Branding saved.')).toBeVisible();
});

test('only an admin can add people', async ({ browser }) => {
	const colleague = await browser.newContext();
	const page = await colleague.newPage();
	await page.goto('/players', { waitUntil: 'networkidle' });
	await expect(page.getByText('Only an admin can add people')).toBeVisible();
	await expect(page.getByPlaceholder('Add a person')).toHaveCount(0);
	await colleague.close();
});
