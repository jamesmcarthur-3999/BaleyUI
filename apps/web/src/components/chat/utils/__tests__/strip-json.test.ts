import { describe, it, expect } from 'vitest';
import { stripLargeJsonBlocks } from '../strip-json';

describe('stripLargeJsonBlocks', () => {
  it('should strip bal_generator output JSON from text', () => {
    const jsonOutput = {
      balCode: 'support_agent { "goal": "Help users with common questions", "tools": { "web_search" } }',
      explanation: 'This bot is designed to help customers with common product questions by searching the web for relevant information.',
      entities: [
        { type: 'bot', name: 'support_agent', role: 'main' },
      ],
      toolRationale: {
        web_search: 'Needed to find current information about products',
      },
      suggestedName: 'Product Support Bot',
      suggestedIcon: 'headset',
    };

    const textWithJson = `I've created a support bot for you.\n\n${JSON.stringify(jsonOutput)}\n\nLet me know if you'd like any changes!`;

    const result = stripLargeJsonBlocks(textWithJson);

    expect(result).not.toContain('balCode');
    expect(result).not.toContain('entities');
    expect(result).toContain("I've created a support bot for you.");
    expect(result).toContain("Let me know if you'd like any changes!");
  });

  it('should strip JSON that appears without surrounding text', () => {
    const jsonOutput = {
      balCode: 'support_agent { "goal": "Help users with common questions", "tools": { "web_search" } }',
      explanation: 'This bot is designed to help customers with common product questions.',
      entities: [{ type: 'bot', name: 'support_agent', role: 'main' }],
      toolRationale: { web_search: 'Needed to find information' },
      suggestedName: 'Support Bot',
      suggestedIcon: 'headset',
    };

    const textWithJson = JSON.stringify(jsonOutput);

    const result = stripLargeJsonBlocks(textWithJson);

    // When the entire text is JSON, it should be stripped and return empty (or minimal text)
    expect(result.trim()).toBe('');
  });

  it('should preserve JSON in code fences', () => {
    const jsonOutput = {
      balCode: 'test_bot { "goal": "Test" }',
      explanation: 'A test bot',
      entities: [],
      toolRationale: {},
      suggestedName: 'Test',
      suggestedIcon: 'test',
    };

    const textWithCodeFence = `Here's the configuration:\n\n\`\`\`json\n${JSON.stringify(jsonOutput, null, 2)}\n\`\`\`\n\nLooks good!`;

    const result = stripLargeJsonBlocks(textWithCodeFence);

    expect(result).toContain('```json');
    expect(result).toContain('balCode');
  });

  it('should strip multiple JSON blocks', () => {
    const json1 = {
      balCode: 'bot1 { "goal": "First bot" }',
      explanation: 'First',
      entities: [],
      toolRationale: {},
      suggestedName: 'Bot1',
      suggestedIcon: 'icon1',
    };

    const json2 = {
      balCode: 'bot2 { "goal": "Second bot" }',
      explanation: 'Second',
      entities: [],
      toolRationale: {},
      suggestedName: 'Bot2',
      suggestedIcon: 'icon2',
    };

    const text = `First result: ${JSON.stringify(json1)}\n\nSecond result: ${JSON.stringify(json2)}\n\nAll done!`;

    const result = stripLargeJsonBlocks(text);

    expect(result).not.toContain('balCode');
    expect(result).toContain('First result:');
    expect(result).toContain('Second result:');
    expect(result).toContain('All done!');
  });

  it('should preserve small JSON objects', () => {
    const smallJson = { status: 'ok', count: 5 };
    const text = `Status: ${JSON.stringify(smallJson)}`;

    const result = stripLargeJsonBlocks(text);

    // Small JSON should be preserved
    expect(result).toContain('status');
    expect(result).toContain('ok');
  });

  it('should handle JSON with escaped quotes', () => {
    const jsonWithEscapes = {
      balCode: 'bot { "goal": "Handle \\"quoted\\" text" }',
      explanation: 'A bot that handles "quotes" in its description.',
      entities: [],
      toolRationale: {},
      suggestedName: 'Quote Handler',
      suggestedIcon: 'quote',
    };

    const text = `Here you go: ${JSON.stringify(jsonWithEscapes)}`;

    const result = stripLargeJsonBlocks(text);

    expect(result).not.toContain('balCode');
    expect(result).toContain('Here you go:');
  });
});
