import { describe, it, expect } from 'vitest';
import { verifyOwnership, verifyNestedOwnership, exists } from '../helpers';

describe('verifyOwnership', () => {
  it('passes for matching workspace', () => {
    const resource = { id: '1', workspaceId: 'ws-1' };
    expect(() => verifyOwnership(resource, 'ws-1', 'Test')).not.toThrow();
  });

  it('throws for null resource', () => {
    expect(() => verifyOwnership(null, 'ws-1', 'Test')).toThrow('Test not found');
  });

  it('throws for wrong workspace', () => {
    const resource = { id: '1', workspaceId: 'ws-2' };
    expect(() => verifyOwnership(resource, 'ws-1', 'Test')).toThrow('Test not found');
  });
});

describe('verifyNestedOwnership', () => {
  it('passes for matching workspace', () => {
    const parent = { workspaceId: 'ws-1' };
    expect(() => verifyNestedOwnership(parent, 'ws-1')).not.toThrow();
  });

  it('passes when workspaceId is undefined', () => {
    const parent = { id: '1', workspaceId: undefined };
    expect(() => verifyNestedOwnership(parent, 'ws-1')).not.toThrow();
  });
});

describe('exists', () => {
  it('returns true for defined values', () => {
    expect(exists({ id: '1' })).toBe(true);
    expect(exists('')).toBe(true);
    expect(exists(0)).toBe(true);
  });

  it('returns false for null/undefined', () => {
    expect(exists(null)).toBe(false);
    expect(exists(undefined)).toBe(false);
  });
});
