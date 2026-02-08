import { describe, expect, it } from 'vitest';
import type { ParsedEntities } from '../types';
import { applyNodeChangeFromParsed, applyNodeIntentFromParsed } from '../visual-to-bal';

const baseParsed: ParsedEntities = {
  entities: [
    {
      name: 'monitor',
      config: {
        goal: 'Monitor database for new signups',
        model: 'openai:gpt-4o-mini',
        tools: ['web_search'],
      },
    },
    {
      name: 'notify',
      config: {
        goal: 'Send notifications for new signups',
        model: 'openai:gpt-4o-mini',
        tools: ['send_notification'],
      },
    },
  ],
  chain: ['monitor', 'notify'],
  errors: [],
};

describe('applyNodeIntentFromParsed', () => {
  it('adds a node near the selected node', () => {
    const result = applyNodeIntentFromParsed(baseParsed, {
      nodeId: 'monitor',
      instruction: 'add a bot here that verifies output',
    });

    expect(result.applied).toBe(true);
    expect(result.balCode).toContain('output_verifier {');
    expect(result.balCode.indexOf('monitor')).toBeLessThan(
      result.balCode.indexOf('output_verifier')
    );
    expect(result.balCode.indexOf('output_verifier')).toBeLessThan(
      result.balCode.indexOf('notify')
    );
  });

  it('deletes the selected node', () => {
    const result = applyNodeIntentFromParsed(baseParsed, {
      nodeId: 'notify',
      instruction: 'delete this node',
    });

    expect(result.applied).toBe(true);
    expect(result.balCode).not.toContain('notify {');
    expect(result.summary.toLowerCase()).toContain('deleted');
  });

  it('renames the selected node', () => {
    const result = applyNodeIntentFromParsed(baseParsed, {
      nodeId: 'notify',
      instruction: 'rename this node to output_reviewer',
    });

    expect(result.applied).toBe(true);
    expect(result.balCode).toContain('output_reviewer {');
    expect(result.balCode).not.toContain('notify {');
  });

  it('updates goal text for the selected node', () => {
    const result = applyNodeIntentFromParsed(baseParsed, {
      nodeId: 'monitor',
      instruction: 'set this goal to verify signup quality before notifying',
    });

    expect(result.applied).toBe(true);
    expect(result.balCode).toContain('"goal": "Verify signup quality"');
  });

  it('adds tools to the selected node', () => {
    const result = applyNodeIntentFromParsed(baseParsed, {
      nodeId: 'monitor',
      instruction: 'add tool fetch_url',
    });

    expect(result.applied).toBe(true);
    expect(result.balCode).toContain('"fetch_url"');
    expect(result.balCode).toContain('"web_search"');
  });

  it('returns a clear error when delete is requested without a selected node', () => {
    const result = applyNodeIntentFromParsed(baseParsed, {
      instruction: 'delete this node',
    });

    expect(result.applied).toBe(false);
    expect(result.error).toContain('Select a node first');
  });

  it('preserves loop composition when updating a node goal', () => {
    const parsed: ParsedEntities = {
      entities: [
        {
          name: 'validator',
          config: {
            goal: 'Validate output quality',
            tools: ['web_search'],
          },
        },
      ],
      errors: [],
    };

    const originalBalCode = `
validator {
  "goal": "Validate output quality",
  "tools": { "web_search" }
}
loop ("until": "result.passed == true", "max": 3) {
  validator
}
`.trim();

    const result = applyNodeIntentFromParsed(
      parsed,
      {
        nodeId: 'validator',
        instruction: 'set this goal to validate, then retry until confidence is high',
      },
      originalBalCode
    );

    expect(result.applied).toBe(true);
    expect(result.balCode).toContain('loop ("until": "result.passed == true", "max": 3)');
    expect(result.balCode).toContain('"goal": "Validate, then retry until confidence is high"');
  });

  it('blocks structural add intent for advanced compositions', () => {
    const parsed: ParsedEntities = {
      entities: [
        {
          name: 'validator',
          config: {
            goal: 'Validate output quality',
            tools: ['web_search'],
          },
        },
      ],
      errors: [],
    };

    const originalBalCode = `
validator {
  "goal": "Validate output quality",
  "tools": { "web_search" }
}
loop ("until": "result.passed == true", "max": 3) {
  validator
}
`.trim();

    const result = applyNodeIntentFromParsed(
      parsed,
      {
        nodeId: 'validator',
        instruction: 'add a bot here that verifies final output',
      },
      originalBalCode
    );

    expect(result.applied).toBe(false);
    expect(result.error ?? '').toContain('advanced BAL compositions');
  });
});

describe('applyNodeChangeFromParsed', () => {
  it('preserves loop composition when patching node fields', () => {
    const parsed: ParsedEntities = {
      entities: [
        {
          name: 'validator',
          config: {
            goal: 'Validate output quality',
            tools: ['web_search'],
          },
        },
      ],
      errors: [],
    };

    const originalBalCode = `
validator {
  "goal": "Validate output quality",
  "tools": { "web_search" }
}
loop ("until": "result.passed == true", "max": 3) {
  validator
}
`.trim();

    const updated = applyNodeChangeFromParsed(
      parsed,
      {
        nodeId: 'validator',
        changes: { model: 'openai:gpt-4o-mini' },
      },
      originalBalCode
    );

    expect(updated).toContain('"model": "openai:gpt-4o-mini"');
    expect(updated).toContain('loop ("until": "result.passed == true", "max": 3)');
  });
});
