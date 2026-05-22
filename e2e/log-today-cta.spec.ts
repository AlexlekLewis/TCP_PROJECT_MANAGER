import { expect, test, type Page } from '@playwright/test';

async function setRole(page: Page, role: 'admin' | 'manager') {
  await page.goto('/');
  await page.getByTestId(`role-${role}`).click();
  await expect(page.getByTestId(`role-${role}`)).toHaveClass(/bg-secondary/);
}

test.describe('Log today\'s work — primary daily CTA', () => {
  test('manager sees the CTA on the landing and it opens the day-entry dialog', async ({ page }) => {
    await setRole(page, 'manager');
    await page.goto('/');
    await expect(page.getByText("Log today's work")).toBeVisible();
    await page.getByRole('link', { name: /Open day entry/i }).first().click();
    // The dialog auto-opens on the calendar via ?log=today
    await expect(page).toHaveURL(/\/calendar/);
    await expect(page.getByText(/Log hours per worker/i)).toBeVisible();
  });

  test('admin sees the same CTA on the dashboard', async ({ page }) => {
    await setRole(page, 'admin');
    await page.goto('/');
    await expect(page.getByText("Log today's work")).toBeVisible();
  });

  test('manager day entry dialog renders with no $ figures', async ({ page }) => {
    await setRole(page, 'manager');
    await page.goto('/calendar?log=today');
    await expect(page.getByText(/Log hours per worker/i)).toBeVisible();
    // Manager should never see a $ amount inside the dialog
    const dialog = page.getByRole('dialog');
    await expect(dialog.locator('text=/\\$\\d/')).toHaveCount(0);
  });

  test('admin day entry dialog still shows $ on material entries (when any seeded)', async ({ page }) => {
    await setRole(page, 'admin');
    await page.goto('/calendar?log=today');
    await expect(page.getByText(/Log hours per worker/i)).toBeVisible();
    // Admin should be able to see $ figures somewhere on this page
    await expect(page.locator('text=/\\$\\d/').first()).toBeVisible();
  });
});
