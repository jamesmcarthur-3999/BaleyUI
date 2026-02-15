import { describe, expect, it } from 'vitest';
import {
  balGeneratorOutputSchema,
  normalizeOutputCandidate,
} from '../runner';

describe('normalizeOutputCandidate', () => {
  it('passes through plain objects', () => {
    const obj = { foo: 'bar' };
    expect(normalizeOutputCandidate(obj)).toEqual(obj);
  });

  it('parses JSON strings', () => {
    expect(normalizeOutputCandidate('{"a":1}')).toEqual({ a: 1 });
  });

  it('unwraps markdown-fenced JSON', () => {
    const fenced = '```json\n{"x":"y"}\n```';
    expect(normalizeOutputCandidate(fenced)).toEqual({ x: 'y' });
  });

  it('passes through non-parsable values unchanged', () => {
    expect(normalizeOutputCandidate(42)).toBe(42);
    expect(normalizeOutputCandidate(null)).toBeNull();
    expect(normalizeOutputCandidate('not json')).toBe('not json');
  });
});

describe('balGeneratorOutputSchema', () => {
  const baseOutput = {
    balCode: 'test_bot { "goal": "Test bot" }',
    explanation: 'Test explanation',
    entities: [
      {
        name: 'test_bot',
        goal: 'Test bot',
        tools: [],
      },
    ],
    suggestedName: 'Test Bot',
    suggestedIcon: '🤖',
  };

  it('accepts object toolRationale', () => {
    const result = balGeneratorOutputSchema.safeParse({
      ...baseOutput,
      toolRationale: {
        web_search: 'Required for current information retrieval.',
      },
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.toolRationale).toEqual({
        web_search: 'Required for current information retrieval.',
      });
    }
  });

  it('parses stringified toolRationale JSON', () => {
    const result = balGeneratorOutputSchema.safeParse({
      ...baseOutput,
      toolRationale: JSON.stringify({
        fetch_url: 'Used to inspect source pages directly.',
      }),
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.toolRationale).toEqual({
        fetch_url: 'Used to inspect source pages directly.',
      });
    }
  });

  it('falls back to empty object for malformed toolRationale strings', () => {
    const result = balGeneratorOutputSchema.safeParse({
      ...baseOutput,
      toolRationale: '{not-json',
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.toolRationale).toEqual({});
    }
  });
});
