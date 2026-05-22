import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

async function asAdmin(page: Page) {
  await page.goto('/');
  await page.getByTestId('role-admin').click();
  await expect(page.getByTestId('role-admin')).toHaveClass(/bg-secondary/);
}

/**
 * Trivial CSV parser sufficient for our payroll output. The full toCSV
 * helper is unit-tested separately; here we just need to slice rows.
 */
function parseCsv(text: string): { headers: string[]; rows: Record<string, string>[] } {
  // Strip a trailing newline if present
  const lines = text.replace(/\n$/, '').split('\n');
  const headers = lines[0].split(',');
  const rows = lines.slice(1).map((line) => {
    // Naive split — adequate for the simple payroll columns produced by
    // toCSV in this test (no embedded commas in the seeded values).
    const cells = line.split(',');
    return Object.fromEntries(headers.map((h, i) => [h, cells[i] ?? '']));
  });
  return { headers, rows };
}

test.describe('Payroll CSV — the artefact Alex cuts cheques from', () => {
  test('exported CSV has the expected header schema', async ({ page }) => {
    await asAdmin(page);
    await page.goto('/reports');
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: /Payroll CSV/i }).click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/^payroll-\d{4}-\d{2}-\d{2}\.csv$/);

    const path = await download.path();
    expect(path).toBeTruthy();
    const text = await readFile(path!, 'utf8');
    const { headers } = parseCsv(text);
    expect(headers).toEqual(['date', 'worker', 'project', 'hours', 'rate', 'amount', 'notes']);
  });

  test('row count + sum(amount) integrity', async ({ page }) => {
    await asAdmin(page);
    await page.goto('/reports');
    // Read the on-screen "Total hours" stat (admin view). Use a stable test
    // id and wait for the value to populate before parsing — the Query
    // hook may not have resolved yet on first paint.
    const totalHoursLocator = page.getByTestId('summary-total-hours');
    await expect(totalHoursLocator).toBeVisible();
    await expect(totalHoursLocator).not.toHaveText(/^0(\.0+)?h?$/);
    const totalHoursText = await totalHoursLocator.textContent();
    const totalHours = parseFloat((totalHoursText ?? '0').replace(/[^\d.]/g, ''));
    expect(totalHours).toBeGreaterThan(0);

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: /Payroll CSV/i }).click(),
    ]);
    const path = await download.path();
    const text = await readFile(path!, 'utf8');
    const { rows } = parseCsv(text);

    // Row count > 0 — confirms we exported something
    expect(rows.length).toBeGreaterThan(0);

    // Hours sum from CSV equals the on-screen total to the tenth
    const hoursFromCsv = rows.reduce((s, r) => s + Number(r.hours ?? 0), 0);
    expect(Math.abs(hoursFromCsv - totalHours)).toBeLessThan(0.01);

    // amount column = hours * rate to the cent
    for (const r of rows) {
      const hours = Number(r.hours);
      const rate = Number(r.rate);
      const amount = Number(r.amount);
      expect(Math.abs(amount - hours * rate)).toBeLessThan(0.01);
    }
  });

  test('manager has no access to the Payroll CSV button', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('role-manager').click();
    await page.goto('/reports');
    await expect(page.getByRole('button', { name: /Payroll CSV/i })).toHaveCount(0);
  });
});
