import { describe, it, expect } from 'vitest';
import { evaluateOutputMatch } from '../output-match';

describe('evaluateOutputMatch', () => {
  it('passes exact JSON match independent of key order', () => {
    const result = evaluateOutputMatch(
      '{"name":"Alice","age":30}',
      '{"age":30,"name":"Alice"}',
      'exact'
    );
    expect(result.passed).toBe(true);
  });

  it('passes contains on strong keyword overlap', () => {
    const result = evaluateOutputMatch(
      'The report includes signup counts, conversion trends, and anomaly highlights.',
      'signup conversion trends',
      'contains'
    );
    expect(result.passed).toBe(true);
  });

  it('fails schema when required key is missing', () => {
    const result = evaluateOutputMatch(
      '{"name":"Alice"}',
      '{"name":"string","age":"number"}',
      'schema'
    );
    expect(result.passed).toBe(false);
    expect(result.reason).toContain('missing key');
  });

  it('passes structured on subset shape', () => {
    const result = evaluateOutputMatch(
      '{"user":{"name":"Alice","age":30},"extra":true}',
      '{"user":{"name":"Alice"}}',
      'structured'
    );
    expect(result.passed).toBe(true);
  });
});
