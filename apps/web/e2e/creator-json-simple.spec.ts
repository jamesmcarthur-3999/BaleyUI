import { test, expect } from '@playwright/test';

// Simple test without auth requirements
test('Creator chat should not display raw JSON', async ({ page }) => {
  // Navigate directly to the app
  await page.goto('/');

  // Wait for page to load
  await page.waitForLoadState('domcontentloaded');

  console.log('\n=== Page loaded ===');
  console.log('URL:', page.url());

  // Try to navigate to the new bot page (may redirect to login)
  await page.goto('/dashboard/baleybots/new');

  // Wait for navigation/redirects to complete
  await page.waitForLoadState('networkidle');

  console.log('After navigation URL:', page.url());

  // Take screenshot of current state
  await page.screenshot({ path: 'test-results/page-state.png', fullPage: true });
  console.log('📸 Screenshot saved');

  // Try to find the chat input with multiple possible selectors
  const possibleSelectors = [
    'textarea[placeholder*="describe"]',
    'textarea[placeholder*="Create"]',
    'textarea',
    'input[type="text"]',
    '[contenteditable="true"]',
  ];

  let input = null;
  for (const selector of possibleSelectors) {
    const elem = page.locator(selector).first();
    if (await elem.count() > 0) {
      console.log(`Found input with selector: ${selector}`);
      input = elem;
      break;
    }
  }

  if (!input) {
    console.log('❌ Could not find input field');
    console.log('Page content:', await page.content());
    return;
  }

  // Type a test message
  await input.fill('Create a simple weather bot');
  await page.keyboard.press('Enter');

  console.log('✅ Message sent, waiting for response...');

  // Wait for response message to appear
  await page.locator('[role="article"]').last().waitFor({ state: 'visible', timeout: 30000 });

  // Get all text content from the page
  const pageText = await page.textContent('body');

  console.log('\n=== PAGE TEXT SAMPLE ===');
  console.log(pageText?.substring(0, 1000));
  console.log('=======================\n');

  // Check for problematic JSON keys
  const jsonKeys = ['"balCode"', '"entities"', '"explanation"', '"toolRationale"'];

  for (const key of jsonKeys) {
    if (pageText?.includes(key)) {
      console.error(`\n❌ FOUND JSON KEY IN PAGE: ${key}`);
      const index = pageText.indexOf(key);
      console.error('Context:', pageText.substring(index - 100, index + 200));

      // Take screenshot of the issue
      await page.screenshot({
        path: `test-results/json-found-${key.replace(/"/g, '')}.png`,
        fullPage: true
      });

      throw new Error(`Raw JSON key ${key} found in page text`);
    }
  }

  console.log('\n✅ No raw JSON keys found in page');
});
