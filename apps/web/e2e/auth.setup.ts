import { test as setup, expect } from '@playwright/test';

const authFile = 'e2e/.auth/user.json';

/**
 * Better Auth authentication setup for E2E tests.
 *
 * This setup project authenticates once and saves the session
 * to a storage state file, which subsequent test projects reuse.
 *
 * Requires environment variables:
 *   E2E_AUTH_EMAIL - Test account email
 *   E2E_AUTH_PASSWORD - Test account password
 */
setup('authenticate', async ({ page }) => {
  const email = process.env.E2E_AUTH_EMAIL;
  const password = process.env.E2E_AUTH_PASSWORD;

  if (!email || !password) {
    setup.skip(!email || !password, 'E2E_AUTH_EMAIL and E2E_AUTH_PASSWORD required');
    return;
  }

  // Navigate to sign-in page
  await page.goto('/sign-in');

  // Better Auth sign-in form
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: /sign in/i }).click();

  // Wait for redirect to dashboard
  await page.waitForURL('/dashboard**', { timeout: 15000 });
  await expect(page).toHaveURL(/\/dashboard/);

  // Save signed-in state
  await page.context().storageState({ path: authFile });
});
