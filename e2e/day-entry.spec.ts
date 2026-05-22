import { expect, test, type Page } from '@playwright/test';

async function openTodayEntry(page: Page) {
  await page.goto('/calendar');
  await page.getByRole('button', { name: /Add today/i }).click();
  await expect(page.getByText(/Log hours per worker/i)).toBeVisible();
}

test.describe('Day entry — time and materials', () => {
  test('add a time entry, it shows up in the day', async ({ page }) => {
    await openTodayEntry(page);
    const addTime = page.locator('fieldset', { has: page.locator('legend', { hasText: /Add time/i }) });

    await addTime.getByRole('combobox').first().click(); // Worker
    await page.getByRole('option', { name: 'Alex' }).click();
    await addTime.getByRole('combobox').nth(1).click(); // Project
    await page.getByRole('option', { name: 'Northcote High School' }).click();
    await addTime.getByPlaceholder('What was done').waitFor();
    await addTime.locator('input[type="number"]').fill('5');
    await addTime.getByPlaceholder('What was done').fill('e2e-notes-time');

    await addTime.getByRole('button', { name: /Add time/i }).click();
    await expect(page.getByText('Time entry added')).toBeVisible();
    await expect(page.getByText('e2e-notes-time')).toBeVisible();
  });

  test('hours over the hard cap (14) are rejected with a toast', async ({ page }) => {
    await openTodayEntry(page);
    const addTime = page.locator('fieldset', { has: page.locator('legend', { hasText: /Add time/i }) });
    await addTime.getByRole('combobox').first().click();
    await page.getByRole('option', { name: 'Jerry' }).click();
    await addTime.getByRole('combobox').nth(1).click();
    await page.getByRole('option', { name: 'Preston High School' }).click();
    await addTime.locator('input[type="number"]').first().fill('20');
    await addTime.getByRole('button', { name: /Add time/i }).click();
    await expect(page.getByText(/Hours cannot exceed 14/i)).toBeVisible();
  });

  test('add a material entry with cost + supplier', async ({ page }) => {
    await openTodayEntry(page);
    const addMat = page.locator('fieldset', { has: page.locator('legend', { hasText: /Add material/i }) });

    await addMat.getByRole('combobox').click(); // Project
    await page.getByRole('option', { name: 'Northcote High School' }).click();
    const desc = `e2e-paint-${Date.now()}`;
    await addMat.getByPlaceholder(/Haymes Low Sheen/).fill(desc);
    await addMat.locator('input[type="number"]').fill('123.45');
    // Supplier is the last text input in the materials fieldset (after desc)
    const textInputs = addMat.locator('input:not([type="number"]):not([type="date"])');
    await textInputs.last().fill('Bunnings');

    await addMat.getByRole('button', { name: /Add material/i }).click();
    await expect(page.getByText('Material added')).toBeVisible();
    // The new entry shows up in the day-dialog list and also in the
    // "Materials this week" section under the calendar.
    await expect(page.getByText(desc).first()).toBeVisible();
  });
});
