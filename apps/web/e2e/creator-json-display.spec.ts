import { test, expect } from '@playwright/test';

test.describe('Creator Bot JSON Display', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the app
    await page.goto('/');

    // Sign in via dev bypass (if available)
    // You may need to adjust this based on your auth setup
    await page.waitForTimeout(1000);
  });

  test('should NOT display raw JSON in creator chat', async ({ page }) => {
    // Navigate to create new baleybot page
    await page.goto('/dashboard/baleybots/new');

    // Wait for the creator chat to load
    await page.waitForSelector('[data-testid="creator-chat"]', { timeout: 10000 }).catch(() => {
      // Try alternative selectors
      return page.waitForSelector('textarea[placeholder*="describe"]', { timeout: 5000 });
    });

    // Find the input field (try multiple possible selectors)
    const input = await page.locator('textarea').first();

    // Type a message to create a bot
    await input.fill('Create a simple customer support bot that can answer common questions about our product using web search');

    // Submit the message
    await page.keyboard.press('Enter');

    // Wait for the response to appear
    await page.waitForTimeout(3000); // Give time for streaming to start

    // Wait for the "done" indicator or a reasonable timeout
    await page.waitForTimeout(15000); // Allow time for bot generation

    // Get all chat messages
    const messages = await page.locator('[role="article"], .message, p').allTextContents();

    // Log all messages for debugging
    console.log('\n=== CHAT MESSAGES ===');
    messages.forEach((msg, i) => {
      console.log(`Message ${i}:`, msg.substring(0, 200));
    });
    console.log('===================\n');

    // Check if any message contains JSON keys that should be stripped
    const problematicKeys = [
      '"balCode"',
      '"entities"',
      '"explanation"',
      '"toolRationale"',
      '"suggestedName"',
      '"suggestedIcon"',
    ];

    const allText = messages.join(' ');

    for (const key of problematicKeys) {
      if (allText.includes(key)) {
        console.error(`\n❌ FOUND PROBLEMATIC JSON KEY: ${key}`);
        console.error('Full text sample:', allText.substring(allText.indexOf(key) - 50, allText.indexOf(key) + 200));
      }
      expect(allText, `Should not contain ${key}`).not.toContain(key);
    }

    // Also check for large JSON object patterns
    const jsonPattern = /\{\s*"[a-zA-Z_]+"\s*:\s*"[^"]*"\s*,\s*"[a-zA-Z_]+"\s*:/;
    const hasLargeJson = jsonPattern.test(allText);

    if (hasLargeJson) {
      console.error('\n❌ FOUND JSON PATTERN IN TEXT');
      const match = allText.match(jsonPattern);
      if (match) {
        console.error('Match:', match[0]);
      }
    }

    expect(hasLargeJson, 'Should not contain JSON object patterns').toBe(false);
  });

  test('should display clean narrative text only', async ({ page }) => {
    await page.goto('/dashboard/baleybots/new');

    await page.waitForSelector('textarea', { timeout: 10000 });
    const input = await page.locator('textarea').first();

    await input.fill('Create a weather bot');
    await page.keyboard.press('Enter');

    // Wait for response
    await page.waitForTimeout(10000);

    // Take a screenshot for visual verification
    await page.screenshot({
      path: 'test-results/creator-chat-screenshot.png',
      fullPage: true
    });

    console.log('\n📸 Screenshot saved to test-results/creator-chat-screenshot.png');

    // Get the assistant messages
    const messages = await page.locator('[role="article"]').allTextContents();

    // Should have some response
    expect(messages.length).toBeGreaterThan(0);

    // Log what we got
    console.log('\n=== ASSISTANT RESPONSES ===');
    messages.forEach((msg, i) => {
      console.log(`\nMessage ${i}:`);
      console.log(msg.substring(0, 500));
      if (msg.length > 500) console.log('... (truncated)');
    });
    console.log('=========================\n');
  });
});
