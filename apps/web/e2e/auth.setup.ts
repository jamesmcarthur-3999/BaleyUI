import { test as setup, expect } from '@playwright/test';

const authFile = 'e2e/.auth/user.json';

/**
 * Clerk authentication setup for E2E tests.
 *
 * This setup project authenticates once and saves the session
 * to a storage state file, which subsequent test projects reuse.
 *
 * Requires environment variables:
 *   E2E_CLERK_EMAIL - Test account email
 *   E2E_CLERK_PASSWORD - Test account password
 */
setup('authenticate', async ({ page }) => {
  const email = process.env.E2E_CLERK_EMAIL;
  const password = process.env.E2E_CLERK_PASSWORD;

  if (!email || !password) {
    setup.skip(!email || !password, 'E2E_CLERK_EMAIL and E2E_CLERK_PASSWORD required');
    return;
  }

  // Navigate to sign-in page
  await page.goto('/sign-in');

  // Clerk's sign-in form
  await page.getByLabel('Email address').fill(email);
  await page.getByRole('button', { name: /continue/i }).click();

  // Enter password
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: /continue/i }).click();

  // Wait for redirect to dashboard
  await page.waitForURL('/dashboard**', { timeout: 15000 });
  await expect(page).toHaveURL(/\/dashboard/);

  // Save signed-in state
  await page.context().storageState({ path: authFile });
});
