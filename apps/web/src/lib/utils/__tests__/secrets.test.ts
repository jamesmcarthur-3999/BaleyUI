import { describe, it, expect } from 'vitest';
import { maskSecret, hashSecret, redactSecrets } from '../secrets';

describe('maskSecret', () => {
  it('masks middle of long secrets', () => {
    expect(maskSecret('abcd1234efgh5678')).toBe('abcd****5678');
  });

  it('fully masks short secrets', () => {
    expect(maskSecret('short')).toBe('****');
    expect(maskSecret('12345678')).toBe('****');
  });
});

describe('hashSecret', () => {
  it('returns consistent 12-char hash', () => {
    const hash1 = hashSecret('mysecret');
    const hash2 = hashSecret('mysecret');
    expect(hash1).toBe(hash2);
    expect(hash1.length).toBe(12);
  });

  it('produces different hashes for different secrets', () => {
    expect(hashSecret('secret1')).not.toBe(hashSecret('secret2'));
  });
});

describe('redactSecrets', () => {
  it('redacts specified keys', () => {
    const obj = { apiKey: 'sk-1234567890abcdef', name: 'test' };
    const redacted = redactSecrets(obj, ['apiKey']);
    expect(redacted.apiKey).toBe('sk-1****cdef');
    expect(redacted.name).toBe('test');
  });

  it('leaves non-secret keys unchanged', () => {
    const obj = { id: '123', status: 'active' };
    const redacted = redactSecrets(obj, ['apiKey']);
    expect(redacted).toEqual(obj);
  });
});
