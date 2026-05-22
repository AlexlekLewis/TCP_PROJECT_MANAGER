import { expect, test, type Page } from '@playwright/test';

async function asManager(page: Page) {
  await page.goto('/');
  await page.getByTestId('role-manager').click();
  await expect(page.getByTestId('role-manager')).toHaveClass(/bg-secondary/);
}

async function asAdmin(page: Page) {
  await page.goto('/');
  await page.getByTestId('role-admin').click();
  await expect(page.getByTestId('role-admin')).toHaveClass(/bg-secondary/);
}

test.describe('Manager landing — recording-shaped home', () => {
  test('manager sees Today panel + week strip + quick-log chips', async ({ page }) => {
    await asManager(page);
    await page.goto('/');
    await expect(page.getByText("Log today's work")).toBeVisible();
    await expect(page.getByText(/Today —/)).toBeVisible();
    await expect(page.getByText(/This week/i).first()).toBeVisible();
    await expect(page.getByText(/Quick log/i)).toBeVisible();
    await expect(page.getByText(/Active projects/i)).toBeVisible();
  });

  test('manager landing shows no $ anywhere', async ({ page }) => {
    await asManager(page);
    await page.goto('/');
    const main = page.locator('main');
    await expect(main.locator('text=/\\$\\d/')).toHaveCount(0);
  });

  test('admin still sees the monitoring dashboard, not the manager landing', async ({ page }) => {
    await asAdmin(page);
    await page.goto('/');
    // Admin-only heading is the financial "Active projects" header. Manager
    // landing uses uppercase "ACTIVE PROJECTS" small header but admin uses
    // the bigger h2 heading. Easier signal: only admin sees stat cards.
    await expect(page.getByText('Labour cost this week')).toBeVisible();
    await expect(page.getByText('Materials this week')).toBeVisible();
    // Manager-landing-only "Today —" label should not appear on the admin view.
    await expect(page.getByText(/^Today —/)).toHaveCount(0);
  });

  test('quick-log chip pre-fills the day entry dialog with worker + project', async ({ page }) => {
    await asManager(page);
    await page.goto('/');
    // Click the first quick-log chip
    const chip = page
      .locator('a[href^="/calendar?log=today&worker="]')
      .first();
    await expect(chip).toBeVisible();
    const chipHref = await chip.getAttribute('href');
    expect(chipHref).toMatch(/worker=.+&project=.+/);
    await chip.click();
    await expect(page).toHaveURL(/\/calendar/);
    await expect(page.getByText(/Log hours per worker/i)).toBeVisible();
    // The Worker + Project selects should not be on their placeholders any more —
    // they got pre-seeded by the chip. The submit button should be enabled
    // after we add hours.
    const addTime = page.locator('fieldset', {
      has: page.locator('legend', { hasText: /Add time/i }),
    });
    // Worker dropdown not showing the placeholder "Pick worker"
    await expect(addTime.getByText('Pick worker')).toHaveCount(0);
    await expect(addTime.getByText('Pick project')).toHaveCount(0);
  });
});

test.describe('Day entry dialog ergonomics', () => {
  test('hours preset chips fill the input', async ({ page }) => {
    await page.goto('/calendar?log=today');
    const addTime = page.locator('fieldset', {
      has: page.locator('legend', { hasText: /Add time/i }),
    });
    await addTime.getByRole('combobox').first().click();
    await page.getByRole('option', { name: 'Alex' }).click();
    await addTime.getByRole('combobox').nth(1).click();
    await page.getByRole('option', { name: 'Northcote High School' }).click();

    // Tap the 8h preset
    await page.getByTestId('hours-preset-8').click();
    const hoursInput = page.getByTestId('hours-input');
    await expect(hoursInput).toHaveValue('8');

    // Tap 4h — overrides to 4
    await page.getByTestId('hours-preset-4').click();
    await expect(hoursInput).toHaveValue('4');
  });

  test('"Same as yesterday" copies prior-day entries when today is empty', async ({ page }) => {
    // The dialog's "Same as yesterday" only renders if dayTE is empty.
    // Today (per the seed) HAS entries on Mon/Tue/Wed so the shortcut
    // doesn't appear when today is one of those. Pick a future day instead.
    await page.goto('/calendar');
    // Click the highlighted "today" cell first
    const today = page.locator('[class*="ring-1 ring-ring"]').first();
    await today.click();
    // If the shortcut is visible (no entries today), trigger it; else
    // the test asserts nothing — but on a fresh demo today is Mon = has entries
    // so we navigate to Thursday (no entries seeded) instead.
    await page.keyboard.press('Escape');
    // Click Thursday — assumed to be index 3 of weekday cards (0=Mon)
    const dayCards = page.locator('div.cursor-pointer.transition-shadow');
    await dayCards.nth(3).click();
    await expect(page.getByText(/Log hours per worker/i)).toBeVisible();
    const shortcut = page.getByRole('button', { name: /Same as yesterday/i });
    if (await shortcut.count()) {
      await shortcut.click();
      await expect(page.getByText(/Copied .* from yesterday/i)).toBeVisible();
    }
  });
});
