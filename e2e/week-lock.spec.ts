import { expect, test, type Page } from '@playwright/test';

async function setRole(page: Page, role: 'admin' | 'manager') {
  await page.goto('/');
  await page.getByTestId(`role-${role}`).click();
  await expect(page.getByTestId(`role-${role}`)).toHaveClass(/bg-secondary/);
}

test.describe('Week lock', () => {
  test('admin can lock + unlock the current week', async ({ page }) => {
    await setRole(page, 'admin');
    await page.goto('/reports');

    await page.getByRole('button', { name: /Lock week/i }).click();
    await expect(page.getByText(/Week .* locked/i)).toBeVisible();
    // Locked badge shows on Reports
    await expect(page.getByText(/^Locked$/)).toBeVisible();

    // Reverse
    await page.getByRole('button', { name: /Unlock week/i }).click();
    await expect(page.getByText(/Week .* unlocked/i)).toBeVisible();
  });

  test('locked badge appears on the Reports header after lock', async ({ page }) => {
    await setRole(page, 'admin');
    await page.goto('/reports');
    await page.getByRole('button', { name: /Lock week/i }).click();
    await expect(page.getByText(/Week .* locked/i)).toBeVisible();
    // The header shows a "Locked" badge alongside the week range
    await expect(page.getByText('Locked').first()).toBeVisible();
    // Cleanup
    await page.getByRole('button', { name: /Unlock week/i }).click();
  });

  test('locking the week also surfaces on the same-page week calendar', async ({ page }) => {
    await setRole(page, 'admin');
    await page.goto('/reports');
    await page.getByRole('button', { name: /Lock week/i }).click();
    await expect(page.getByText(/Week .* locked/i)).toBeVisible();
    // Navigate via SPA link (no full reload — demo state persists)
    await page.getByRole('link', { name: 'Week' }).click();
    await expect(page).toHaveURL(/\/calendar/);
    await expect(page.getByText('Locked').first()).toBeVisible();
    // Cleanup
    await page.getByRole('link', { name: 'Reports' }).click();
    await page.getByRole('button', { name: /Unlock week/i }).click();
  });
});
