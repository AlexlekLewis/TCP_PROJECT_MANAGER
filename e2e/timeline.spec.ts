import { expect, test } from '@playwright/test';

test.describe('Timeline view', () => {
  test('renders the page header and a range badge', async ({ page }) => {
    await page.goto('/timeline');
    await expect(page.getByRole('heading', { name: /Timeline/i })).toBeVisible();
    await expect(page.getByText(/\d+ \w+ – \d+ \w+ \d{4}/).first()).toBeVisible();
  });

  test('shows the three demo projects', async ({ page }) => {
    await page.goto('/timeline');
    await expect(page.getByText('Northcote High School').first()).toBeVisible();
    await expect(page.getByText('Preston High School').first()).toBeVisible();
    await expect(page.getByText('Belmore School').first()).toBeVisible();
  });

  test('renders the "Who\'s on what" weekly schedule with all workers', async ({ page }) => {
    await page.goto('/timeline');
    // CardTitle renders as a div, not a heading — use getByText.
    await expect(page.getByText(/Who's on what — this week/i)).toBeVisible();
    await expect(page.getByRole('cell', { name: 'Jerry' })).toBeVisible();
    await expect(page.getByRole('cell', { name: 'Pierce' })).toBeVisible();
    await expect(page.getByRole('cell', { name: 'Gavin' })).toBeVisible();
    await expect(page.getByRole('cell', { name: 'Alex' })).toBeVisible();
  });

  test('clicking a project bar navigates to the project detail', async ({ page }) => {
    await page.goto('/timeline');
    await page.getByRole('link', { name: /Northcote High School/i }).first().click();
    await expect(page).toHaveURL(/\/projects\/p-northcote/);
  });

  test('Later button advances the range, Today snaps back', async ({ page }) => {
    await page.goto('/timeline');
    const rangeBadge = page.locator('text=/\\d+ \\w+ – \\d+ \\w+ \\d{4}/').first();
    const initial = await rangeBadge.textContent();
    await page.getByRole('button', { name: 'Later' }).click();
    await expect(rangeBadge).not.toHaveText(initial ?? '');
    await page.getByRole('button', { name: 'Today' }).click();
    await expect(rangeBadge).toHaveText(initial ?? '');
  });
});
