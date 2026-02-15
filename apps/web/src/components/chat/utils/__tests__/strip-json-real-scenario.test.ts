import { describe, it, expect } from 'vitest';
import { stripLargeJsonBlocks } from '../strip-json';

describe('stripLargeJsonBlocks - Real Scenario', () => {
  it('should strip actual bal_generator output as it appears in production', () => {
    // This is the EXACT format that bal_generator outputs
    const realBalGeneratorOutput = `{"balCode":"support_agent {\\n  \\"goal\\": \\"Help customers with common product questions using web search\\",\\n  \\"model\\": \\"anthropic:claude-sonnet-4-20250514\\",\\n  \\"tools\\": { \\"web_search\\" }\\n}","explanation":"This BaleyBot will help customers with common product questions by searching the web for up-to-date information.","entities":[{"id":"support_agent","name":"support_agent","icon":"🤝","purpose":"Help customers with common product questions using web search","tools":["web_search"]}],"toolRationale":{"web_search":"Essential for finding current product information, pricing, and troubleshooting steps"},"suggestedName":"Product Support Bot","suggestedIcon":"headset"}`;

    // This is how it might appear in Baley's response
    const baleyResponse = `I've created a customer support bot for you.

${realBalGeneratorOutput}

The bot is ready to use. Would you like to test it?`;

    console.log('\n=== TESTING REAL SCENARIO ===');
    console.log('Input length:', baleyResponse.length);
    console.log('Contains balCode:', baleyResponse.includes('"balCode"'));

    const result = stripLargeJsonBlocks(baleyResponse);

    console.log('\nResult length:', result.length);
    console.log('Still contains balCode:', result.includes('"balCode"'));
    console.log('Result preview:', result.substring(0, 200));
    console.log('============================\n');

    // Verify JSON was stripped
    expect(result).toContain("I've created a customer support bot");
    expect(result).toContain("The bot is ready to use");
    expect(result).not.toContain('"balCode"');
    expect(result).not.toContain('"entities"');
    expect(result).not.toContain('"toolRationale"');
  });

  it('should handle JSON with unescaped newlines', () => {
    // Sometimes the model outputs JSON without proper escaping
    const messyJson = `{"balCode":"bot { \\"goal\\": \\"test\\" }","explanation":"A test bot"}`;
    const text = `Here's your bot: ${messyJson} Done!`;

    const result = stripLargeJsonBlocks(text);

    expect(result).toContain("Here's your bot:");
    expect(result).toContain('Done!');
    expect(result).not.toContain('"balCode"');
  });

  it('should work with text that is ONLY JSON', () => {
    const onlyJson = `{"balCode":"test { \\"goal\\": \\"x\\" }","suggestedName":"Test"}`;

    const result = stripLargeJsonBlocks(onlyJson);

    // Should return empty string since entire text was JSON
    expect(result.trim()).toBe('');
  });
});
