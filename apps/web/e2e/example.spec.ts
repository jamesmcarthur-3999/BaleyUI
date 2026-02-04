import { test, expect } from '@playwright/test';

test.describe('Basic Navigation', () => {
  test('homepage loads', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/BaleyUI/);
  });

  test('dashboard requires authentication', async ({ page }) => {
    await page.goto('/dashboard');
    // Should redirect to sign-in or show auth required
    await expect(page.url()).toContain('/sign-in');
  });
});

test.describe('BaleyBots (Authenticated)', () => {
  // Note: These tests require authentication setup
  // For now, create placeholder tests

  test.skip('can view baleybots list', async ({ page }) => {
    await page.goto('/dashboard/baleybots');
    await expect(page.getByRole('heading', { name: /baleybots/i })).toBeVisible();
  });

  test.skip('can create new baleybot', async ({ page }) => {
    await page.goto('/dashboard/baleybots');
    await page.click('[data-testid="create-baleybot"]');
    // Complete creation flow
  });
});
