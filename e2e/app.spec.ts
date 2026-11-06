import { expect, test, type Page } from '@playwright/test';

const ROUTES = [
  '/',
  '/leaderboard',
  '/models',
  '/compare',
  '/radar',
  '/bars',
  '/heatmap',
  '/scatter',
  '/timeline',
  '/data',
  '/methodology',
  '/model/claude-fable-5.5',
];

function trackErrors(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  return errors;
}

for (const route of ROUTES) {
  test(`renders ${route} without errors or sideways scrolling`, async ({ page }) => {
    const errors = trackErrors(page);
    await page.goto(route);
    await expect(page.locator('main h1').first()).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    expect(errors).toEqual([]);
  });
}

test('leaderboard category, sort and filter live in the URL', async ({ page }) => {
  await page.goto('/leaderboard');
  await page.getByRole('tab', { name: /Coding/ }).click();
  await expect(page).toHaveURL(/cat=coding/);
  await page.getByRole('button', { name: /Book summary costs|\$\/MTok/ }).click();
  await expect(page).toHaveURL(/sort=price/);
  const rows = page.locator('.lb-table tbody tr');
  const before = await rows.count();
  await page.getByPlaceholder('Filter models or labs…').fill('deepseek');
  await expect(rows).toHaveCount(2);
  expect(before).toBeGreaterThan(2);
});

test('Simple shows grades, Detailed shows raw scores', async ({ page, isMobile }) => {
  test.skip(isMobile, 'keyboard shortcut');
  await page.goto('/leaderboard');
  await expect(page.locator('main h1')).toContainText('skill by skill');
  await expect(page.locator('.lb-table .grade-chip').first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Fixing code' })).toBeVisible();
  await page.keyboard.press('d');
  await expect(page.locator('main h1')).toContainText('Who leads');
  await expect(page.locator('.lb-table .grade-chip')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /SWE-bench/ })).toBeVisible();
});

test('home: picking a question rebuilds the city and the answer', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.skyline .tower').first()).toBeVisible();
  const verdict = page.locator('.verdict p');
  const before = await verdict.textContent();
  await page.getByRole('tab', { name: /money/i }).click();
  await expect(verdict).not.toHaveText(before ?? '');
  await expect(page.locator('.skyline .tower')).not.toHaveCount(0);
});

test('model page reads like a report card', async ({ page }) => {
  await page.goto('/model/claude-fable-5.5');
  await expect(page.locator('.report-grade .grade-letter')).toBeVisible();
  await expect(page.locator('.standing')).not.toHaveCount(0);
  await page.getByRole('button', { name: /Show all the numbers/ }).click();
  await expect(page.locator('.kpi-grid')).toBeVisible();
});

test('command palette jumps to a model', async ({ page, isMobile }) => {
  test.skip(isMobile, 'keyboard shortcut');
  await page.goto('/');
  await expect(page.locator('main h1').first()).toBeVisible();
  await page.keyboard.press('Control+k');
  await page.getByRole('textbox', { name: 'Search' }).fill('fable 5.5');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/model\/claude-fable-5\.5/);
  await expect(page.locator('main h1')).toContainText('Claude Fable 5.5');
});

test('theme toggle and custom weights', async ({ page, isMobile }) => {
  test.skip(isMobile, 'keyboard shortcut');
  await page.goto('/leaderboard');
  await expect(page.locator('main h1').first()).toBeVisible();
  const theme = () => page.evaluate(() => document.documentElement.dataset.theme);
  const start = await theme();
  await page.keyboard.press('t');
  expect(await theme()).not.toBe(start);
  await page.keyboard.press('w');
  await page.getByRole('dialog').getByRole('button', { name: 'Coding' }).click();
  await page.keyboard.press('Escape');
  await expect(page.getByText('Custom weights.')).toBeVisible();
});

test('mobile navigation drawer opens and navigates', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'mobile only');
  await page.goto('/');
  await page.getByRole('button', { name: 'Open navigation' }).click();
  await page
    .getByRole('link', { name: /Methodology/ })
    .first()
    .click();
  await expect(page).toHaveURL(/\/methodology/);
  await expect(page.locator('main h1')).toContainText('How the numbers are made');
});

test('data page offers every CSV for download', async ({ page }) => {
  await page.goto('/data');
  for (const f of ['models', 'benchmarks', 'scores', 'runs', 'changes']) {
    await expect(page.getByText(`data/${f}.csv`)).toBeVisible();
  }
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Download models.csv' }).click(),
  ]);
  expect(download.suggestedFilename()).toBe('models.csv');
});
