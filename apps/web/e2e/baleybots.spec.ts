import { test, expect } from '@playwright/test';

test.use({ storageState: 'e2e/.auth/user.json' });

test.describe('BaleyBots', () => {
  test('baleybots list page loads', async ({ page }) => {
    await page.goto('/dashboard/baleybots');
    await expect(page).toHaveURL(/\/dashboard\/baleybots/);
  });

  test('new baleybot page shows example prompts', async ({ page }) => {
    await page.goto('/dashboard/baleybots/new');
    // Should show the "What should your BaleyBot do?" heading
    await expect(
      page.getByText(/what should your baleybot do/i)
    ).toBeVisible({ timeout: 10000 });
  });

  test('new baleybot page shows example prompt pills', async ({ page }) => {
    await page.goto('/dashboard/baleybots/new');
    // Check for example prompt buttons
    await expect(page.getByText('Summarize articles')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Research assistant')).toBeVisible();
    await expect(page.getByText('Data analyzer')).toBeVisible();
    await expect(page.getByText('Email drafter')).toBeVisible();
  });

  test('new baleybot page has chat input', async ({ page }) => {
    await page.goto('/dashboard/baleybots/new');
    // Should have a text input or textarea for chat
    const input = page.locator('textarea, input[type="text"]');
    await expect(input.first()).toBeVisible({ timeout: 10000 });
  });

  test('non-existent baleybot shows not found', async ({ page }) => {
    await page.goto('/dashboard/baleybots/00000000-0000-0000-0000-000000000000');
    // Should eventually show not-found or loading state
    await expect(
      page.getByText(/not found/i).or(page.locator('.animate-pulse'))
    ).toBeVisible({ timeout: 15000 });
  });
});
