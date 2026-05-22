import { expect, test } from '@playwright/test';

// Serialise everything in this file. Multiple specs create / archive / delete
// the same demo projects and the demoStore writes are async — running them in
// parallel produces flaky cross-test races.
test.describe.configure({ mode: 'serial' });

test.describe('Project CRUD — admin (serial, share state)', () => {
  test('create a new project, it appears in the list', async ({ page }) => {
    await page.goto('/projects');
    await page.getByRole('button', { name: 'New project' }).click();
    await expect(page.getByRole('heading', { name: 'New project' })).toBeVisible();

    const uniqueName = `E2E Spec House ${Date.now()}`;
    await page.getByPlaceholder('e.g. Northcote High School').fill(uniqueName);
    await page.getByRole('button', { name: 'Create project' }).click();
    await expect(page.getByText(uniqueName)).toBeVisible();
  });

  test('archive Belmore, then restore — full round-trip in one test', async ({ page }) => {
    await page.goto('/projects');

    // Archive
    const belmoreCard = page.getByTestId('project-card-p-belmore');
    await belmoreCard.getByRole('button', { name: 'Project actions' }).click();
    await page.getByRole('menuitem', { name: 'Archive' }).click();
    await page.getByRole('button', { name: 'Archive' }).click();
    await expect(page.getByText(/Archived Belmore School/i)).toBeVisible();
    await expect(page.getByText('Belmore School')).toHaveCount(0);

    // Switch filter to Archived and restore
    await page.locator('[role="combobox"]').first().click();
    await page.getByRole('option', { name: 'Archived' }).click();
    await expect(belmoreCard).toBeVisible();

    await belmoreCard.getByRole('button', { name: 'Project actions' }).click();
    await page.getByRole('menuitem', { name: /Restore to active/i }).click();
    await page.getByRole('button', { name: 'Restore' }).click();
    await expect(page.getByText(/Restored Belmore School/i)).toBeVisible();
  });

  test('delete option is disabled for a project with entries', async ({ page }) => {
    await page.goto('/projects');
    const card = page.getByTestId('project-card-p-northcote');
    await card.getByRole('button', { name: 'Project actions' }).click();
    const deleteItem = page.getByRole('menuitem', { name: /Delete \(has entries\)/i });
    await expect(deleteItem).toBeVisible();
    await expect(deleteItem).toHaveAttribute('data-disabled', '');
  });
});

test.describe('Project delete — fresh empty project', () => {
  test('delete works on a brand-new project with no entries', async ({ page }) => {
    await page.goto('/projects');
    await page.getByRole('button', { name: 'New project' }).click();
    const name = `Throwaway ${Date.now()}`;
    await page.getByPlaceholder('e.g. Northcote High School').fill(name);
    await page.getByRole('button', { name: 'Create project' }).click();
    await expect(page.getByText(name)).toBeVisible();

    // Find the newly-created card and open its three-dot menu via its dynamic id
    const card = page.locator('[data-testid^="project-card-"]', { hasText: name }).first();
    await card.getByRole('button', { name: 'Project actions' }).click();
    await page.getByRole('menuitem', { name: 'Delete permanently' }).click();
    await page.getByRole('button', { name: 'Delete permanently' }).click();
    await expect(page.getByText(/Deleted .*Throwaway/i)).toBeVisible();
    await expect(page.getByText(name)).toHaveCount(0);
  });
});
