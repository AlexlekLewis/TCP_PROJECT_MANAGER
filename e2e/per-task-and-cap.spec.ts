import { expect, test } from '@playwright/test';
import { format, startOfWeek } from 'date-fns';

// Seeded Monday-of-current-week ISO — that's where Jerry's 10h-on-Northcote
// pair of entries lives. Using ?log=<iso> opens that exact day's drawer.
const SEEDED_MONDAY = format(startOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd');

test.describe('Per-task time + daily soft cap', () => {
  test('time entry captures an optional task label', async ({ page }) => {
    await page.goto(`/calendar?log=${SEEDED_MONDAY}`);
    await expect(page.getByText(/Log hours per worker/i)).toBeVisible();

    const addTime = page.locator('fieldset', {
      has: page.locator('legend', { hasText: /Add time/i }),
    });
    await addTime.getByRole('combobox').first().click();
    await page.getByRole('option', { name: 'Alex' }).click();
    await addTime.getByRole('combobox').nth(1).click();
    await page.getByRole('option', { name: 'Northcote High School' }).click();
    await page.getByTestId('task-input').fill('Skirtings');
    await page.getByTestId('hours-input').fill('3');
    await addTime.getByRole('button', { name: /Add time/i }).click();

    // The task appears as a chip badge next to the worker
    await expect(page.getByText('SKIRTINGS')).toBeVisible();
  });

  test('day tally panel shows per-worker totals + per-project breakdown', async ({ page }) => {
    await page.goto(`/calendar?log=${SEEDED_MONDAY}`);
    await expect(page.getByTestId('daily-tally')).toBeVisible();
    // Jerry's seeded Monday has 4+6 = 10h on Northcote
    const tally = page.getByTestId('daily-tally');
    await expect(tally.getByText('Jerry')).toBeVisible();
    // The Northcote sub-total appears
    await expect(tally.getByText(/Northcote High School 10\.0h/)).toBeVisible();
  });

  test('soft cap flag: Jerry over 8h cap on Northcote shows the warning', async ({ page }) => {
    // Jerry's seeded entries on Monday = 10h on Northcote (4 trims + 6 ceilings).
    // Northcote's daily_hours_warning = 8h (from demo seed). So we expect a flag.
    await page.goto(`/calendar?log=${SEEDED_MONDAY}`);
    const tally = page.getByTestId('daily-tally');
    await expect(tally).toBeVisible();
    await expect(tally.getByText(/One or more soft caps exceeded/i)).toBeVisible();
    // Inline per-project mention of the cap
    await expect(tally.getByText(/\(8h cap\)/)).toBeVisible();
  });

  test('over-cap entries get an "Over cap" badge inline in the time list', async ({ page }) => {
    await page.goto(`/calendar?log=${SEEDED_MONDAY}`);
    await expect(page.getByText(/Over cap/i).first()).toBeVisible();
  });

  test('preview warning appears in the Add Time form when total would exceed cap', async ({ page }) => {
    await page.goto(`/calendar?log=${SEEDED_MONDAY}`);
    const addTime = page.locator('fieldset', {
      has: page.locator('legend', { hasText: /Add time/i }),
    });
    await addTime.getByRole('combobox').first().click();
    await page.getByRole('option', { name: 'Jerry' }).click();
    await addTime.getByRole('combobox').nth(1).click();
    await page.getByRole('option', { name: 'Northcote High School' }).click();
    // Jerry already has 10h on Northcote today (over the 8h cap). Adding any
    // more should immediately show the preview warning.
    await page.getByTestId('hours-input').fill('1');
    await expect(
      page.getByText(/over the 8h soft cap/i),
    ).toBeVisible();
  });
});
