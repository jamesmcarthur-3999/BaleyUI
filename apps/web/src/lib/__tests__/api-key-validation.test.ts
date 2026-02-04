import { describe, it, expect } from 'vitest';
import {
  isValidApiKeyFormat,
  generateApiKey,
  hashApiKey,
  getApiKeyDisplayPrefix,
  API_KEY_PREFIX,
  API_KEY_LENGTH,
} from '../api-key-validation';

describe('isValidApiKeyFormat', () => {
  it('accepts valid API keys', () => {
    const key = API_KEY_PREFIX + 'a'.repeat(API_KEY_LENGTH);
    expect(isValidApiKeyFormat(key)).toBe(true);
  });

  it('rejects keys without prefix', () => {
    expect(isValidApiKeyFormat('sk_' + 'a'.repeat(API_KEY_LENGTH))).toBe(false);
  });

  it('rejects keys with wrong length', () => {
    expect(isValidApiKeyFormat(API_KEY_PREFIX + 'short')).toBe(false);
  });

  it('rejects keys with special characters', () => {
    const key = API_KEY_PREFIX + 'a'.repeat(API_KEY_LENGTH - 1) + '!';
    expect(isValidApiKeyFormat(key)).toBe(false);
  });
});

describe('generateApiKey', () => {
  it('generates key with correct prefix', () => {
    const key = generateApiKey();
    expect(key.startsWith(API_KEY_PREFIX)).toBe(true);
  });

  it('generates key with correct length', () => {
    const key = generateApiKey();
    expect(key.length).toBe(API_KEY_PREFIX.length + API_KEY_LENGTH);
  });

  it('generates unique keys', () => {
    const key1 = generateApiKey();
    const key2 = generateApiKey();
    expect(key1).not.toBe(key2);
  });

  it('generates valid format keys', () => {
    const key = generateApiKey();
    expect(isValidApiKeyFormat(key)).toBe(true);
  });
});

describe('hashApiKey', () => {
  it('returns consistent hash', () => {
    const key = 'test-key';
    expect(hashApiKey(key)).toBe(hashApiKey(key));
  });

  it('returns 64-char hex hash', () => {
    const hash = hashApiKey('test');
    expect(hash.length).toBe(64);
    expect(/^[a-f0-9]+$/.test(hash)).toBe(true);
  });
});

describe('getApiKeyDisplayPrefix', () => {
  it('shows prefix and first 4 chars', () => {
    const key = API_KEY_PREFIX + 'abcd' + 'x'.repeat(28);
    expect(getApiKeyDisplayPrefix(key)).toBe('bui_abcd...');
  });
});
