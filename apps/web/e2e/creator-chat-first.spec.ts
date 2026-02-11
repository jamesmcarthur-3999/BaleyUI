import { expect, test } from '@playwright/test';

test.use({ storageState: 'e2e/.auth/user.json' });

test.describe('Creator chat-first flow', () => {
  test('asks focused clarification, hides noisy UI, and reaches build surface', async ({ page }) => {
    test.setTimeout(120_000);

    await page.goto('/dashboard/baleybots/new');
    await expect(
      page.getByRole('heading', { name: /what should your baleybot do/i })
    ).toBeVisible({ timeout: 15000 });

    const input = page.getByLabel(/message to baleybot creator/i);
    await input.fill('Build me a bot that monitors customer signup activity and alerts me.');
    await page.getByRole('button', { name: /send message/i }).click();

    await expect(
      page.getByText(/before i (generate|continue).*(one detail)/i)
    ).toBeVisible({ timeout: 30000 });

    await expect(page.getByText(/next action/i)).toHaveCount(0);
    await expect(page.getByText(/creator_discovery|connection_advisor|test_validator/i)).toHaveCount(0);

    await input.fill('Use webhook events for signups and send notifications in-app.');
    await page.getByRole('button', { name: /send message/i }).click();

    await expect(page.getByText('Start behavior', { exact: true })).toBeVisible({ timeout: 60000 });
    await expect(page.getByText(/save this baleybot/i)).toBeVisible({ timeout: 60000 });
    await expect(page.getByText(/next action/i)).toHaveCount(0);

    const saveButton = page.getByRole('button', { name: /^save$/i }).first();
    await expect(saveButton).toBeVisible({ timeout: 20000 });
    await saveButton.click();

    await expect(page).toHaveURL(/\/dashboard\/baleybots\/(?!new)[0-9a-f-]{8,}/i, {
      timeout: 60000,
    });
    await expect(page.getByText(/build health/i)).toBeVisible({ timeout: 20000 });
  });
});
