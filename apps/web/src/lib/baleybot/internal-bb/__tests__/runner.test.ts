import { describe, expect, it } from 'vitest';
import { normalizeOutputCandidate } from '../runner';

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
