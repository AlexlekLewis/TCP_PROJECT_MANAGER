import { expect, test, type Page } from '@playwright/test';

/**
 * Variation labour — the itemised record of extra work a client added mid-job.
 *
 * The invariant worth protecting: hours logged against a variation are billed
 * on TOP of the quote, so they must never move the quoted-hours progress bar.
 * A job that grew is not a job that's running late, and conflating the two is
 * what made this feature necessary.
 *
 * Runs against the demo fixtures (Northcote has a pending unpriced "Sick bay"
 * variation with 12.5h on it, and an approved "Corridor B" with 5h).
 */

async function asAdmin(page: Page) {
  await page.goto('/');
  await page.getByTestId('role-admin').click();
  await page.goto('/projects/p-northcote');
}

test.describe('Variation ledger', () => {
  test('itemises who worked on it, what day, how long and what they did', async ({ page }) => {
    await asAdmin(page);
    await page.getByTestId('variation-toggle-var-sickbay').click();

    const ledger = page.getByTestId('variation-ledger-var-sickbay');
    await expect(ledger).toBeVisible();
    // Seeded: Jerry 6h prep, Pierce 4.5h two coats, Gavin 2h cut-in.
    await expect(ledger).toContainText('Jerry');
    await expect(ledger).toContainText('Prep + patch');
    await expect(ledger).toContainText('6.0h');
    await expect(ledger).toContainText('Pierce');
    await expect(ledger).toContainText('4.5h');
    await expect(ledger).toContainText('Gavin');
    // Materials tagged to the variation show alongside the labour.
    await expect(ledger).toContainText('sick bay');
  });

  test('variation hours are held out of the quoted-hours budget', async ({ page }) => {
    await asAdmin(page);
    // 39.5h of base work against a 320h quote; 17.5h of variation work on top.
    await expect(page.getByText('39.5h / 320h · +17.5h variations')).toBeVisible();
  });

  test('unpriced work is called out at the top of the project', async ({ page }) => {
    await asAdmin(page);
    const callout = page.getByTestId('unbilled-variation-callout');
    await expect(callout).toBeVisible();
    await expect(callout).toContainText('Work done, not yet priced');
    await expect(callout).toContainText('12.5h');
    // Admin is told what it's worth and what to do about it.
    await expect(callout).toContainText('Price it below, then approve.');
  });

  test('an approved variation is not counted as unbilled', async ({ page }) => {
    await asAdmin(page);
    // Corridor B is approved with 5h on it — the callout covers the sick bay only.
    await expect(page.getByTestId('unbilled-variation-callout')).toContainText('1 variation');
  });
});

test.describe('Logging time against a variation', () => {
  test('lands in the ledger without moving the base hours bar', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('role-admin').click();

    // "Log time" on a variation deep-links to the day dialog, pre-tagged.
    await page.goto('/calendar?log=today&project=p-northcote&variation=var-sickbay');
    const picker = page.getByTestId('time-work-against');
    await expect(picker).toContainText('Sick bay');

    await page.getByRole('combobox').filter({ hasText: /Pick worker/ }).click();
    await page.getByRole('option', { name: 'Pierce' }).click();
    await page.getByTestId('hours-input').fill('3');
    await page.getByTestId('task-input').fill('Second coat touch-ups');
    await page.getByRole('button', { name: 'Add time' }).click();
    await expect(page.getByText('Time entry added')).toBeVisible();

    // Navigate client-side — the demo store lives in memory, so a full page
    // load would discard the entry we just made.
    await page.keyboard.press('Escape');
    await page.getByRole('link', { name: 'Projects' }).click();
    await page.locator('a[href="/projects/p-northcote"]').click();
    // Variation total moved 12.5 → 15.5; the quoted-hours figure did NOT move.
    await expect(page.getByText('39.5h / 320h · +20.5h variations')).toBeVisible();
    await page.getByTestId('variation-toggle-var-sickbay').click();
    await expect(page.getByTestId('variation-ledger-var-sickbay')).toContainText(
      'Second coat touch-ups',
    );
  });
});

test.describe('Pricing and approval', () => {
  test('pricing shows the work logged, and approving clears the unbilled callout', async ({
    page,
  }) => {
    await asAdmin(page);

    await page.getByRole('button', { name: /^Price$/ }).click();
    // Alex prices off what was actually spent, not off memory.
    await expect(page.getByText(/12\.5h labour · \$128\.40 materials logged so far/)).toBeVisible();
    await page.getByPlaceholder('2500').fill('1600');
    await page.getByRole('button', { name: 'Save' }).click();

    // Priced but not yet signed off — still unbilled, different instruction.
    await expect(page.getByTestId('unbilled-variation-callout')).toContainText(
      'Chase the sign-off.',
    );

    await page.getByRole('button', { name: /^Approve$/ }).click();
    await expect(page.getByTestId('unbilled-variation-callout')).toHaveCount(0);
    // Base 48000 + corridor 1450 + sick bay 1600.
    await expect(page.getByText('$48,000 base + $3,050 variations')).toBeVisible();
  });
});
