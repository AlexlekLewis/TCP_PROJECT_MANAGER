import { expect, test } from '@playwright/test';

/**
 * Parts: a job is a set of date blocks, not one continuous bar. The demo
 * fixtures split Northcote across a school term and the following holidays.
 */
test.describe('Schedule parts', () => {
  test('a split job draws one bar per part with the gap between them', async ({ page }) => {
    await page.goto('/timeline');
    const bars = page.getByRole('button', { name: /Northcote High School,/ });
    await expect(bars).toHaveCount(2);
    await expect(bars.first()).toHaveAccessibleName(/Term 3 — B & C blocks/);
    await expect(bars.last()).toHaveAccessibleName(/Term break — gym \+ hall/);
    // The row header says how many parts rather than repeating the client.
    await expect(page.getByText('2 parts').first()).toBeVisible();
  });

  test('the side list shows the next part, not the whole envelope', async ({ page }) => {
    await page.goto('/timeline');
    // Northcote runs 17 Aug – 12 Oct across two parts. Showing the envelope
    // would read as eight solid weeks, so the list names the next block and
    // its status has to agree with those dates.
    await expect(page.getByText(/17 Aug – 5 Sep · Term 3 — B & C blocks/)).toBeVisible();
    await expect(page.getByText(/12 Oct/).first()).toHaveCount(1);
  });

  test('clicking a bar opens the editor and dates can be typed in', async ({ page }) => {
    await page.goto('/timeline');
    await page.getByRole('button', { name: /Northcote High School, Term break/ }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText('Edit part')).toBeVisible();
    await expect(dialog.getByText(/part 2 of 2/)).toBeVisible();

    // Save is inert until something actually changes.
    await expect(dialog.getByRole('button', { name: 'Save' })).toBeDisabled();

    await dialog.getByLabel('Finishes').fill('2026-10-30');
    await expect(dialog.getByRole('button', { name: 'Save' })).toBeEnabled();
    await dialog.getByRole('button', { name: 'Save' }).click();

    await expect(
      page.getByRole('button', { name: /Northcote High School, Term break/ }),
    ).toHaveAccessibleName(/30 Oct 2026/);
  });

  test('the editor refuses a finish date before the start', async ({ page }) => {
    await page.goto('/timeline');
    await page.getByRole('button', { name: /Northcote High School, Term break/ }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Finishes').fill('2026-01-01');
    await expect(dialog.getByRole('alert')).toContainText(/before the start date/i);
    await expect(dialog.getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  test('renaming a part shows the new name on the bar', async ({ page }) => {
    await page.goto('/timeline');
    await page.getByRole('button', { name: /Northcote High School, Term break/ }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Name').fill('Gym only');
    await dialog.getByRole('button', { name: 'Save' }).click();
    await expect(
      page.getByRole('button', { name: /Northcote High School, Gym only/ }),
    ).toBeVisible();
  });

  test('splitting a part turns one job into three', async ({ page }) => {
    await page.goto('/timeline');
    await page.getByRole('button', { name: /Northcote High School, Term break/ }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: /^Split at/ }).click();
    await expect(page.getByText('3 parts').first()).toBeVisible();
    await expect(page.getByRole('button', { name: /Northcote High School,/ })).toHaveCount(3);
  });

  test('dragging one part leaves its sibling alone', async ({ page, isMobile }) => {
    test.skip(!!isMobile, 'pointer drag is a desktop affordance');
    await page.goto('/timeline');
    const partA = page.getByRole('button', { name: /Northcote High School, Term 3/ });
    const partB = page.getByRole('button', { name: /Northcote High School, Term break/ });
    const beforeA = await partA.getAttribute('aria-label');

    const box = await partB.boundingBox();
    if (!box) throw new Error('part B has no bounding box');
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 60, box.y + box.height / 2, { steps: 10 });
    await page.mouse.up();

    await expect(partB).not.toHaveAccessibleName(/21 Sep to 12 Oct/);
    // The part that wasn't touched must not have moved.
    await expect(partA).toHaveAttribute('aria-label', beforeA ?? '');
  });

  test('adding a part lands it after the job currently finishes', async ({ page }) => {
    await page.goto('/timeline');
    await expect(page.getByRole('button', { name: /Preston High School,/ })).toHaveCount(1);
    await page.getByRole('button', { name: 'Add another part to Preston High School' }).click();
    await expect(page.getByRole('button', { name: /Preston High School,/ })).toHaveCount(2);
    // Unnamed, so it falls back to its position.
    await expect(page.getByRole('button', { name: /Preston High School, Part B/ })).toBeVisible();
  });

  test('removing the only part takes the job off the calendar', async ({ page }) => {
    await page.goto('/timeline');
    await page.getByRole('button', { name: /Belmore School,/ }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: /Remove part/ }).click();
    await expect(dialog.getByText(/Takes the job off the calendar/)).toBeVisible();
    await dialog.getByRole('button', { name: 'Remove' }).click();

    await expect(page.getByRole('button', { name: /Belmore School,/ })).toHaveCount(0);
    // It reappears under "No dates yet", ready to be put back.
    const unscheduled = page
      .locator('h3', { hasText: /No dates yet/i })
      .locator('xpath=following-sibling::ul[1]');
    await expect(unscheduled.getByText('Belmore School')).toBeVisible();
  });

  test('the project form writes a single-part job through to its part', async ({ page }) => {
    await page.goto('/projects/p-preston');
    await page.getByRole('button', { name: 'Edit' }).first().click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Expected end').fill('2026-09-25');
    await dialog.getByRole('button', { name: 'Save' }).click();

    // Navigate in-app, not via goto: demo mode holds its data in memory and a
    // full page load would reset the fixtures before we could assert on them.
    await page.getByRole('link', { name: 'Schedule' }).first().click();
    await expect(page.getByRole('button', { name: /Preston High School,/ })).toHaveAccessibleName(
      /24 Aug to 25 Sep 2026/,
    );
  });

  test('the project form will not pretend a split job has one start and end', async ({ page }) => {
    await page.goto('/projects/p-northcote');
    await page.getByRole('button', { name: 'Edit' }).first().click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText(/This job runs in 2 parts/)).toBeVisible();
    await expect(dialog.getByLabel('Start date')).toHaveCount(0);
    await expect(dialog.getByLabel('Expected end')).toHaveCount(0);
  });

  test('manager cannot add, edit or remove parts', async ({ page }) => {
    await page.goto('/timeline');
    await page.getByTestId('role-manager').click();
    await expect(page.getByRole('button', { name: /Add another part to/ })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Add', exact: true })).toHaveCount(0);
    // Clicking a bar opens the job rather than the editor.
    await page.getByRole('button', { name: /Northcote High School, Term 3/ }).click();
    await expect(page).toHaveURL(/\/projects\/p-northcote/);
  });
});
