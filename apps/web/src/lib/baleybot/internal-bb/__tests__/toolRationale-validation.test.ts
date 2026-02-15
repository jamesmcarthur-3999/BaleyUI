/**
 * Test to verify bal_generator's toolRationale field parses correctly
 * after the contract schema fix.
 *
 * Issue: The toolRationale field was defined as a nested object with
 * specific fields in contracts.json, which produced invalid BAL syntax.
 * The BAL parser expects type names (like "object"), not nested JSON objects.
 *
 * Fix: Changed toolRationale from a nested object schema to "object" type
 * in contracts.json. The Zod schema in runner.ts handles the validation
 * and normalization at runtime.
 */

import { describe, it, expect } from 'vitest';
import { balGeneratorOutputSchema } from '../runner';
import { parseBalCode } from '@/lib/baleybot/bal-parser-pure';

describe('bal_generator toolRationale validation', () => {
  it('should accept an object for toolRationale', () => {
    const output = {
      balCode: 'test_bot { "goal": "Test bot", "model": "anthropic:claude-sonnet-4-20250514" }',
      explanation: 'This is a test',
      entities: [{ name: 'test_bot', goal: 'Test bot', model: 'anthropic:claude-sonnet-4-20250514', tools: [] }],
      toolRationale: {
        web_search: 'Used for searching',
        fetch_url: 'Used for fetching',
      },
      suggestedName: 'Test Bot',
      suggestedIcon: '🤖',
    };

    const result = balGeneratorOutputSchema.safeParse(output);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.toolRationale).toEqual({
        web_search: 'Used for searching',
        fetch_url: 'Used for fetching',
      });
    }
  });

  it('should accept a stringified JSON object for toolRationale', () => {
    const output = {
      balCode: 'test_bot { "goal": "Test bot", "model": "anthropic:claude-sonnet-4-20250514" }',
      explanation: 'This is a test',
      entities: [{ name: 'test_bot', goal: 'Test bot', model: 'anthropic:claude-sonnet-4-20250514', tools: [] }],
      toolRationale: JSON.stringify({
        web_search: 'Used for searching',
        fetch_url: 'Used for fetching',
      }),
      suggestedName: 'Test Bot',
      suggestedIcon: '🤖',
    };

    const result = balGeneratorOutputSchema.safeParse(output);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.toolRationale).toEqual({
        web_search: 'Used for searching',
        fetch_url: 'Used for fetching',
      });
    }
  });

  it('should default to empty object if toolRationale is malformed', () => {
    const output = {
      balCode: 'test_bot { "goal": "Test bot", "model": "anthropic:claude-sonnet-4-20250514" }',
      explanation: 'This is a test',
      entities: [{ name: 'test_bot', goal: 'Test bot', model: 'anthropic:claude-sonnet-4-20250514', tools: [] }],
      toolRationale: 'invalid json',
      suggestedName: 'Test Bot',
      suggestedIcon: '🤖',
    };

    const result = balGeneratorOutputSchema.safeParse(output);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.toolRationale).toEqual({});
    }
  });

  it('should parse generated BAL code with object type for output fields', () => {
    const balCode = `
bal_generator {
  "goal": "Converts natural language descriptions into BAL code",
  "model": "anthropic:claude-sonnet-4-20250514",
  "maxTokens": 32768,
  "output": {
    "balCode": "string",
    "explanation": "string",
    "entities": "array<object>",
    "toolRationale": "object",
    "suggestedName": "string",
    "suggestedIcon": "string"
  }
}
`;

    const result = parseBalCode(balCode);

    // Should parse without errors
    expect(result.errors).toHaveLength(0);
    expect(result.entities).toHaveLength(1);

    const entity = result.entities[0];
    if (entity) {
      expect(entity.name).toBe('bal_generator');
      // The parser normalizes array<object> to array in the loose parsing mode
      expect(entity.config.output).toHaveProperty('balCode', 'string');
      expect(entity.config.output).toHaveProperty('explanation', 'string');
      expect(entity.config.output).toHaveProperty('toolRationale', 'object');
      expect(entity.config.output).toHaveProperty('suggestedName', 'string');
      expect(entity.config.output).toHaveProperty('suggestedIcon', 'string');
    }
  });
});
