import { describe, expect, it } from 'vitest';
import { creatorDiscoveryOutputSchema } from '../runner';

describe('creatorDiscoveryOutputSchema', () => {
  it('accepts missing delta.summary and applies a default', () => {
    const parsed = creatorDiscoveryOutputSchema.parse({
      needsMoreInfo: true,
      message: 'Need one more required detail.',
      questions: [],
      contextNotes: [],
      delta: {
        stage: 'discovery',
      },
    });

    expect(parsed.delta?.summary).toBe('Discovery state updated.');
    expect(parsed.delta?.stage).toBe('discovery');
  });

  it('accepts empty delta.summary and normalizes it to a default', () => {
    const parsed = creatorDiscoveryOutputSchema.parse({
      needsMoreInfo: false,
      questions: [],
      contextNotes: [],
      delta: {
        summary: '   ',
      },
    });

    expect(parsed.delta?.summary).toBe('Discovery state updated.');
  });

  it('accepts invalid delta.summary values and normalizes them to a default', () => {
    const parsedFromUndefined = creatorDiscoveryOutputSchema.parse({
      needsMoreInfo: false,
      questions: [],
      contextNotes: [],
      delta: {
        summary: undefined,
      },
    });

    const parsedFromNull = creatorDiscoveryOutputSchema.parse({
      needsMoreInfo: false,
      questions: [],
      contextNotes: [],
      delta: {
        summary: null,
      },
    });

    expect(parsedFromUndefined.delta?.summary).toBe('Discovery state updated.');
    expect(parsedFromNull.delta?.summary).toBe('Discovery state updated.');
  });
});
