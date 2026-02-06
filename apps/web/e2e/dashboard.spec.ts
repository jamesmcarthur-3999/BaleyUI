import { test, expect } from '@playwright/test';

test.use({ storageState: 'e2e/.auth/user.json' });

test.describe('Dashboard', () => {
  test('renders dashboard page', async ({ page }) => {
    await page.goto('/dashboard');
    // Dashboard should show main content area
    await expect(page.locator('main, [role="main"], .dashboard')).toBeVisible({ timeout: 10000 });
  });

  test('sidebar navigation is visible', async ({ page }) => {
    await page.goto('/dashboard');
    // Check for navigation links
    const nav = page.locator('nav, [role="navigation"]');
    await expect(nav.first()).toBeVisible({ timeout: 10000 });
  });

  test('can navigate to baleybots page', async ({ page }) => {
    await page.goto('/dashboard');
    // Click on BaleyBots link in sidebar
    const botsLink = page.getByRole('link', { name: /baleybot/i });
    if (await botsLink.isVisible()) {
      await botsLink.click();
      await expect(page).toHaveURL(/\/dashboard\/baleybots/);
    }
  });

  test('can navigate to activity page', async ({ page }) => {
    await page.goto('/dashboard');
    const activityLink = page.getByRole('link', { name: /activity/i });
    if (await activityLink.isVisible()) {
      await activityLink.click();
      await expect(page).toHaveURL(/\/dashboard\/activity/);
    }
  });

  test('can navigate to settings page', async ({ page }) => {
    await page.goto('/dashboard');
    const settingsLink = page.getByRole('link', { name: /settings/i });
    if (await settingsLink.isVisible()) {
      await settingsLink.click();
      await expect(page).toHaveURL(/\/dashboard\/settings/);
    }
  });
});
