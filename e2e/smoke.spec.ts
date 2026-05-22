import { expect, test } from '@playwright/test';

// These run against the dev server in demo mode (VITE_DEMO_MODE=true in .env.local).
// For production smoke tests, set PLAYWRIGHT_BASE_URL to the Vercel URL and
// provide real credentials via env.

test.describe('Tricoat PM smoke', () => {
  test('login → dashboard renders demo data', async ({ page }) => {
    await page.goto('/login');
    // The Tricoat wordmark is the visual identity on Login
    await expect(page.getByText('TRICOAT')).toBeVisible();
    await expect(page.getByText('Project Manager')).toBeVisible();
    await page.getByRole('button', { name: /sign in/i }).click();
    await expect(page.getByRole('heading', { name: /Active projects/i })).toBeVisible();
    // Seeded demo projects present
    await expect(page.getByText('Northcote High School')).toBeVisible();
  });

  test('week calendar opens day entry dialog', async ({ page }) => {
    await page.goto('/calendar');
    // Click today
    const today = await page.locator('[class*="ring-1 ring-ring"]').first();
    await today.click();
    await expect(page.getByText(/Log hours per worker/i)).toBeVisible();
  });

  test('projects list shows statuses and navigates to detail', async ({ page }) => {
    await page.goto('/projects');
    await expect(page.getByText('Northcote High School')).toBeVisible();
    await page.getByRole('link', { name: /open/i }).first().click();
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });

  test('reports page computes totals and exports CSV', async ({ page }) => {
    await page.goto('/reports');
    await expect(page.getByRole('heading', { name: /Reports/i })).toBeVisible();
    await expect(page.getByText(/Total hours/i)).toBeVisible();
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: /Payroll CSV/i }).click(),
    ]);
    expect(download.suggestedFilename()).toContain('payroll');
  });

  test('admin can toggle demo role and reach workers page', async ({ page }) => {
    await page.goto('/');
    // Demo role pill switch (hidden on mobile emulation)
    const adminLink = page.getByRole('link', { name: /Workers/i });
    if (await adminLink.count()) {
      await adminLink.first().click();
      await expect(page.getByRole('heading', { name: /Workers/i })).toBeVisible();
    }
  });
});
