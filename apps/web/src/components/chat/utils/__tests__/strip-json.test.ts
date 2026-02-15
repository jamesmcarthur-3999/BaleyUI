import { describe, expect, it } from 'vitest';
import { stripLargeJsonBlocks } from '../strip-json';

describe('stripLargeJsonBlocks', () => {
  it('strips internal bal_generator payload JSON from mixed narrative text', () => {
    const payload = {
      balCode: 'support_agent { "goal": "Help customers", "tools": { "web_search" } }',
      explanation: 'Assists with product questions.',
      entities: [{ name: 'support_agent', goal: 'Help customers', tools: ['web_search'] }],
      toolRationale: { web_search: 'Needed for fresh information.' },
      suggestedName: 'Support Bot',
      suggestedIcon: '🤖',
    };
    const input = `Built this for you.\n\n${JSON.stringify(payload)}\n\nReady to test?`;

    const result = stripLargeJsonBlocks(input);

    expect(result).toContain('Built this for you.');
    expect(result).toContain('Ready to test?');
    expect(result).not.toContain('"balCode"');
    expect(result).not.toContain('"toolRationale"');
  });

  it('strips small JSON blocks when they contain internal payload keys', () => {
    const input = `Output: {"balCode":"bot { \\"goal\\": \\"test\\" }","suggestedName":"Test"} done.`;
    const result = stripLargeJsonBlocks(input);

    expect(result).toContain('Output:');
    expect(result).toContain('done.');
    expect(result).not.toContain('"balCode"');
    expect(result).not.toContain('"suggestedName"');
  });

  it('preserves small generic JSON objects', () => {
    const input = 'Status: {"ok":true,"count":2}';
    const result = stripLargeJsonBlocks(input);

    expect(result).toContain('"ok":true');
    expect(result).toContain('"count":2');
  });

  it('preserves JSON inside markdown code fences', () => {
    const input = [
      'Here is the example:',
      '```json',
      '{"balCode":"example { \\"goal\\": \\"sample\\" }"}',
      '```',
      'Use it as reference.',
    ].join('\n');

    const result = stripLargeJsonBlocks(input);
    expect(result).toContain('```json');
    expect(result).toContain('"balCode"');
    expect(result).toContain('Use it as reference.');
  });

  it('returns empty string when the message is only internal payload JSON', () => {
    const input = '{"balCode":"x","entities":[],"toolRationale":{}}';
    const result = stripLargeJsonBlocks(input);

    expect(result.trim()).toBe('');
  });
});

