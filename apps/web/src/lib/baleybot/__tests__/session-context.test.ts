// apps/web/src/lib/baleybot/__tests__/session-context.test.ts
import { describe, it, expect } from 'vitest';
import { formatSessionContext, type SessionContext } from '../session-context';

describe('formatSessionContext', () => {
  const baseCtx: SessionContext = {
    botName: 'Test Bot',
    balCode: 'test_bot {\n  "goal": "Test"\n}',
    entities: [
      { name: 'test_bot', tools: ['web_search'], purpose: 'Testing' },
    ],
    readiness: {
      designed: 'complete',
      connected: 'incomplete',
      tested: 'incomplete',
      activated: 'not-applicable',
      monitored: 'not-applicable',
    },
    connectedProviders: ['anthropic'],
    connectedDatabases: [],
  };

  it('includes bot name', () => {
    const result = formatSessionContext(baseCtx);
    expect(result).toContain('Bot: Test Bot');
  });

  it('includes entity details', () => {
    const result = formatSessionContext(baseCtx);
    expect(result).toContain('test_bot (web_search)');
  });

  it('includes readiness state', () => {
    const result = formatSessionContext(baseCtx);
    expect(result).toContain('designed=complete');
    expect(result).toContain('connected=incomplete');
  });

  it('includes AI providers when present', () => {
    const result = formatSessionContext(baseCtx);
    expect(result).toContain('AI Providers: anthropic');
  });

  it('omits AI providers when empty', () => {
    const result = formatSessionContext({ ...baseCtx, connectedProviders: [] });
    expect(result).not.toContain('AI Providers:');
  });

  it('includes databases when present', () => {
    const result = formatSessionContext({ ...baseCtx, connectedDatabases: ['postgres'] });
    expect(result).toContain('Databases: postgres');
  });

  it('includes test summary when present', () => {
    const result = formatSessionContext({
      ...baseCtx,
      testSummary: { total: 5, passed: 3, failed: 2 },
    });
    expect(result).toContain('Tests: 3/5 passed, 2 failed');
  });

  it('includes BAL code', () => {
    const result = formatSessionContext(baseCtx);
    expect(result).toContain('BAL Code:');
    expect(result).toContain('test_bot {');
  });
});
