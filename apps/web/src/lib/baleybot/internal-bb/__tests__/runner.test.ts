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

  it('normalizes malformed discovery payload fields without throwing', () => {
    const parsed = creatorDiscoveryOutputSchema.parse({
      needsMoreInfo: 'true',
      message: null,
      questions: [
        'What should this bot focus on first?',
        { id: '', label: '', description: '' },
        42,
      ],
      contextNotes: ['  keep this note  ', { summary: 'derived from object note' }, null],
      delta: {
        summary: undefined,
        resolvedDecisions: ['Business objective selected'],
        openDecisions: [{ question: 'Which data source should be connected?' }],
        assumptions: [{ label: null, value: null, confidence: 'HIGH' }, 'invalid'],
        nextQuestion: { prompt: 'How often should it run?' },
        runnableConfidence: '0.75',
      },
    });

    expect(parsed.needsMoreInfo).toBe(true);
    expect(parsed.message).toBeUndefined();
    expect(parsed.questions.length).toBe(2);
    expect(parsed.questions[0]?.label).toBe('What should this bot focus on first?');
    expect(parsed.questions[1]?.label).toBe('Need one more setup detail');
    expect(parsed.questions[1]?.description).toBe(
      'Share one detail so I can keep building this bot.'
    );
    expect(parsed.contextNotes).toEqual([
      'keep this note',
      'derived from object note',
    ]);
    expect(parsed.delta?.summary).toBe('Discovery state updated.');
    expect(parsed.delta?.resolvedDecisions?.[0]?.label).toBe(
      'Business objective selected'
    );
    expect(parsed.delta?.openDecisions?.[0]?.label).toBe(
      'Which data source should be connected?'
    );
    expect(parsed.delta?.assumptions?.length).toBe(1);
    expect(parsed.delta?.assumptions?.[0]?.label).toBe('Assumption');
    expect(parsed.delta?.assumptions?.[0]?.value).toBe('Use safe defaults');
    expect(parsed.delta?.nextQuestion?.label).toBe('How often should it run?');
    expect(parsed.delta?.runnableConfidence).toBe(0.75);
  });
});
