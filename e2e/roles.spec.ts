import { expect, test, type Page } from '@playwright/test';

/**
 * Role-gating adversarial suite.
 * - As Gavin (manager): assert nothing financial leaks anywhere.
 * - As Alex (admin): assert financials are visible everywhere they should be.
 */

async function switchTo(page: Page, role: 'admin' | 'manager') {
  await page.goto('/');
  await page.getByTestId(`role-${role}`).click();
  // Confirm the pill became active (gets bg-secondary class)
  await expect(page.getByTestId(`role-${role}`)).toHaveClass(/bg-secondary/);
}

test.describe('Manager (Gavin) — no financials anywhere', () => {
  test('manager landing has no $ stat cards, just the recording-shaped view', async ({ page }) => {
    await switchTo(page, 'manager');
    // Manager lands on the recording-shaped landing, not the monitoring one.
    await expect(page.getByText(/Today —/)).toBeVisible();
    await expect(page.getByText(/This week/i).first()).toBeVisible();
    await expect(page.getByText('Labour cost this week')).toHaveCount(0);
    await expect(page.getByText('Materials this week')).toHaveCount(0);
  });

  test('project detail hides financial cards', async ({ page }) => {
    await switchTo(page, 'manager');
    await page.goto('/projects/p-northcote');
    await expect(page.getByText('Hours logged')).toBeVisible();
    await expect(page.getByText(/Gross margin/i)).toHaveCount(0);
    await expect(page.getByText(/Materials budget/i)).toHaveCount(0);
  });

  test('projects list hides Quote line', async ({ page }) => {
    await switchTo(page, 'manager');
    await page.goto('/projects');
    await expect(page.getByRole('heading', { name: 'Projects' })).toBeVisible();
    // Specific phrase used on the card: "Quote $...". Should not be present.
    await expect(page.locator('text=Quote $')).toHaveCount(0);
  });

  test('reports hides cost summary cells + CSV buttons + lock button', async ({ page }) => {
    await switchTo(page, 'manager');
    await page.goto('/reports');
    await expect(page.getByRole('heading', { name: 'Reports' })).toBeVisible();
    await expect(page.getByText('Total hours')).toBeVisible();
    // Summary cells / column headers for $ should be absent
    await expect(page.getByText(/^Labour cost$/i)).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Payroll CSV/i })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Projects CSV/i })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Lock week/i })).toHaveCount(0);
  });

  test('admin-only nav links are hidden', async ({ page }) => {
    await switchTo(page, 'manager');
    const nav = page.locator('nav').first();
    await expect(nav.getByRole('link', { name: 'Workers' })).toHaveCount(0);
    await expect(nav.getByRole('link', { name: 'Admin' })).toHaveCount(0);
  });

  test('direct navigation to /workers redirects to /', async ({ page }) => {
    await switchTo(page, 'manager');
    await page.goto('/workers');
    await expect(page).toHaveURL('/');
  });

  test('direct navigation to /admin redirects to /', async ({ page }) => {
    await switchTo(page, 'manager');
    await page.goto('/admin');
    await expect(page).toHaveURL('/');
  });

  test('project cards show no three-dot admin menu', async ({ page }) => {
    await switchTo(page, 'manager');
    await page.goto('/projects');
    await expect(page.getByText('Northcote High School')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Project actions' })).toHaveCount(0);
  });

  test('project detail shows no Edit or admin menu', async ({ page }) => {
    await switchTo(page, 'manager');
    await page.goto('/projects/p-northcote');
    await expect(page.getByRole('button', { name: /^Edit$/ })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'More actions' })).toHaveCount(0);
  });
});

test.describe('Admin (Alex) — financials visible', () => {
  test('dashboard shows all three stat cards', async ({ page }) => {
    await switchTo(page, 'admin');
    await expect(page.getByText('Hours this week')).toBeVisible();
    await expect(page.getByText('Labour cost this week')).toBeVisible();
    await expect(page.getByText('Materials this week')).toBeVisible();
  });

  test('project detail shows the financial block', async ({ page }) => {
    await switchTo(page, 'admin');
    await page.goto('/projects/p-northcote');
    await expect(page.getByText('Gross margin')).toBeVisible();
    await expect(page.getByText('Quoted')).toBeVisible();
  });

  test('reports has CSV exports + lock control', async ({ page }) => {
    await switchTo(page, 'admin');
    await page.goto('/reports');
    await expect(page.getByRole('button', { name: /Payroll CSV/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Projects CSV/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Lock week/i })).toBeVisible();
  });

  test('workers page reachable + Jerry row visible', async ({ page }) => {
    await switchTo(page, 'admin');
    await page.goto('/workers');
    await expect(page.getByRole('heading', { name: 'Workers' })).toBeVisible();
    await expect(page.getByText('Jerry')).toBeVisible();
  });
});
