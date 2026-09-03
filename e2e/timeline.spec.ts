import { expect, test } from '@playwright/test';

test.describe('Schedule board', () => {
  test('renders the page header and a range badge', async ({ page }) => {
    await page.goto('/timeline');
    await expect(page.getByRole('heading', { name: /Schedule/i })).toBeVisible();
    await expect(page.getByText(/\d+ \w+ – \d+ \w+ \d{4}/).first()).toBeVisible();
  });

  test('shows the three demo projects', async ({ page }) => {
    await page.goto('/timeline');
    await expect(page.getByText('Northcote High School').first()).toBeVisible();
    await expect(page.getByText('Preston High School').first()).toBeVisible();
    await expect(page.getByText('Belmore School').first()).toBeVisible();
  });

  test('renders the "Who\'s on what" weekly schedule with all workers', async ({ page }) => {
    await page.goto('/timeline');
    // CardTitle renders as a div, not a heading — use getByText.
    await expect(page.getByText(/Who's on what — this week/i)).toBeVisible();
    await expect(page.getByRole('cell', { name: 'Jerry' })).toBeVisible();
    await expect(page.getByRole('cell', { name: 'Pierce' })).toBeVisible();
    await expect(page.getByRole('cell', { name: 'Gavin' })).toBeVisible();
    await expect(page.getByRole('cell', { name: 'Alex' })).toBeVisible();
  });

  test('clicking a project name navigates to the project detail', async ({ page }) => {
    await page.goto('/timeline');
    await page.getByRole('link', { name: /Northcote High School/i }).first().click();
    await expect(page).toHaveURL(/\/projects\/p-northcote/);
  });

  test('a bar click opens the part editor for the admin', async ({ page }) => {
    await page.goto('/timeline');
    await page.getByRole('button', { name: /Preston High School,/ }).click();
    await expect(page.getByRole('dialog').getByText('Edit part')).toBeVisible();
  });

  test('Later button advances the range, Today snaps back', async ({ page }) => {
    await page.goto('/timeline');
    const rangeBadge = page.locator('text=/\\d+ \\w+ – \\d+ \\w+ \\d{4}/').first();
    const initial = await rangeBadge.textContent();
    await page.getByRole('button', { name: 'Later' }).click();
    await expect(rangeBadge).not.toHaveText(initial ?? '');
    await page.getByRole('button', { name: 'Today' }).click();
    await expect(rangeBadge).toHaveText(initial ?? '');
  });

  test('zoom presets widen the underlay window', async ({ page }) => {
    await page.goto('/timeline');
    const rangeBadge = page.locator('text=/\\d+ \\w+ – \\d+ \\w+ \\d{4}/').first();
    const thirtyDays = await rangeBadge.textContent();

    await page.getByRole('button', { name: '12 months' }).click();
    await expect(page.getByRole('button', { name: '12 months' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(rangeBadge).not.toHaveText(thirtyDays ?? '');

    await page.getByRole('button', { name: '30 days' }).click();
    await expect(rangeBadge).toHaveText(thirtyDays ?? '');
  });

  test('shows the calendar and what\'s on together, on one screen', async ({ page }) => {
    await page.goto('/timeline');
    // Both the board and the side list must be present without navigating.
    await expect(page.getByRole('button', { name: /Northcote High School,/ }).first()).toBeVisible();
    const panel = page.getByTestId('whats-on');
    await expect(panel).toBeVisible();
    await expect(panel.getByText('Northcote High School')).toBeVisible();
    await expect(panel.getByText(/on site · finishes in/).first()).toBeVisible();
  });

  test('undated jobs sit under "No dates yet" with an Add button', async ({ page }) => {
    await page.goto('/timeline');
    await expect(page.getByRole('heading', { name: /No dates yet/i })).toBeVisible();
    await expect(page.getByText('Fitzroy Warehouse Fitout')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Add', exact: true })).toBeVisible();
  });

  test('dragging a bar reschedules the job', async ({ page, isMobile }) => {
    test.skip(!!isMobile, 'pointer drag is a desktop affordance');
    await page.goto('/timeline');
    // Preston runs as a single part, so this stays about the drag itself —
    // per-part dragging is covered in schedule-parts.spec.ts.
    const bar = page.getByRole('button', { name: /Preston High School,/ });
    const before = await bar.getAttribute('aria-label');

    const box = await bar.boundingBox();
    if (!box) throw new Error('schedule bar has no bounding box');
    // Grab the middle of the bar (away from the edge resize handles) and
    // push it a few days to the right.
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 60, box.y + box.height / 2, { steps: 10 });
    await page.mouse.up();

    await expect(bar).not.toHaveAttribute('aria-label', before ?? '');
  });

  test('arrow keys nudge a focused bar', async ({ page, isMobile }) => {
    test.skip(!!isMobile, 'no hardware keyboard on the mobile project');
    await page.goto('/timeline');
    const bar = page.getByRole('button', { name: /Preston High School,/ });
    await bar.focus();
    const before = await bar.getAttribute('aria-label');
    await bar.press('ArrowRight');
    await expect(page.getByRole('button', { name: /Preston High School,/ })).not.toHaveAttribute(
      'aria-label',
      before ?? '',
    );
  });

  test('manager sees the board read-only — no drag handles, no schedule buttons', async ({
    page,
  }) => {
    await page.goto('/timeline');
    await page.getByTestId('role-manager').click();
    await expect(page.getByRole('heading', { name: /Schedule/i })).toBeVisible();
    // The drag hint and the scheduling controls are admin-only.
    await expect(page.getByText(/Drag a bar to move it/i)).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Add', exact: true })).toHaveCount(0);
  });
});
