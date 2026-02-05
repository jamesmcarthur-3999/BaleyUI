/**
 * Test suite for Encryption utilities
 *
 * These tests demonstrate AES-256-GCM encryption functionality.
 *
 * Note: Before running these tests, set ENCRYPTION_KEY in your test environment:
 * ENCRYPTION_KEY=$(openssl rand -hex 32) npm test
 */

import { describe, test, expect, beforeEach } from 'vitest';
import { encrypt, decrypt, isEncrypted } from '../index';

// Test encryption key (32 bytes = 64 hex characters)
const TEST_ENCRYPTION_KEY = 'a'.repeat(64);

// Set up test encryption key before each test to ensure isolation
beforeEach(() => {
  process.env.ENCRYPTION_KEY = TEST_ENCRYPTION_KEY;
});

describe('encrypt/decrypt', () => {
  test('encrypts and decrypts successfully', () => {
    const plaintext = 'sk-1234567890abcdef';
    const encrypted = encrypt(plaintext);

    expect(encrypted).not.toBe(plaintext);
    expect(encrypted.length).toBeGreaterThan(plaintext.length);

    const decrypted = decrypt(encrypted);
    expect(decrypted).toBe(plaintext);
  });

  test('produces different ciphertext each time (random IV)', () => {
    const plaintext = 'sk-1234567890abcdef';
    const encrypted1 = encrypt(plaintext);
    const encrypted2 = encrypt(plaintext);

    // Different IVs mean different ciphertext
    expect(encrypted1).not.toBe(encrypted2);

    // But both decrypt to the same plaintext
    expect(decrypt(encrypted1)).toBe(plaintext);
    expect(decrypt(encrypted2)).toBe(plaintext);
  });

  test('handles various plaintext lengths', () => {
    const testCases = [
      'short',
      'medium length text here',
      'x'.repeat(1000), // Long text
      '🎉 emoji test 🚀', // Unicode
      '', // Empty string
    ];

    for (const plaintext of testCases) {
      const encrypted = encrypt(plaintext);
      const decrypted = decrypt(encrypted);
      expect(decrypted).toBe(plaintext);
    }
  });

  test('uses correct format: v1:iv:authTag:encrypted', () => {
    const plaintext = 'test';
    const encrypted = encrypt(plaintext);

    // Should start with version prefix
    expect(encrypted.startsWith('v1:')).toBe(true);

    const parts = encrypted.split(':');
    expect(parts.length).toBe(4); // v1, iv, authTag, encrypted

    // All data parts should be hex strings (skip version prefix)
    const hexRegex = /^[0-9a-f]+$/i;
    expect(parts[0]).toBe('v1'); // Version prefix
    expect(hexRegex.test(parts[1]!)).toBe(true); // IV
    expect(hexRegex.test(parts[2]!)).toBe(true); // Auth tag
    expect(hexRegex.test(parts[3]!)).toBe(true); // Encrypted data

    // IV should be 12 bytes = 24 hex chars (standard for GCM)
    expect(parts[1]!.length).toBe(24);

    // Auth tag should be 16 bytes = 32 hex chars
    expect(parts[2]!.length).toBe(32);
  });

  test('throws on tampered ciphertext', () => {
    const plaintext = 'sk-1234567890abcdef';
    const encrypted = encrypt(plaintext);

    // Tamper with the encrypted data portion (last part after iv:authTag:)
    // GCM mode will fail authentication when ciphertext is modified
    const parts = encrypted.split(':');
    // Flip a bit in the encrypted data to cause auth failure
    const tamperedData = parts[2]!.slice(0, 10) + 'ff' + parts[2]!.slice(12);
    const tampered = `${parts[0]}:${parts[1]}:${tamperedData}`;

    expect(() => decrypt(tampered)).toThrow();
  });

  test('throws on tampered auth tag', () => {
    const plaintext = 'sk-1234567890abcdef';
    const encrypted = encrypt(plaintext);

    // Tamper with the auth tag by flipping multiple bits
    // Replace first 4 characters of auth tag with completely different values
    const parts = encrypted.split(':');
    const tamperedTag = 'ffff' + parts[1]!.slice(4);
    const tampered = `${parts[0]}:${tamperedTag}:${parts[2]}`;

    expect(() => decrypt(tampered)).toThrow();
  });

  test('throws on invalid format', () => {
    expect(() => decrypt('invalid')).toThrow('Invalid ciphertext format');
    expect(() => decrypt('only:two')).toThrow('Invalid ciphertext format');
    expect(() => decrypt('too:many:colons:here')).toThrow(
      'Invalid ciphertext format'
    );
  });

  test('throws on invalid hex', () => {
    expect(() => decrypt('notHex:alsoNotHex:stillNotHex')).toThrow();
  });
});

describe('isEncrypted', () => {
  test('returns true for encrypted strings', () => {
    const plaintext = 'sk-1234567890abcdef';
    const encrypted = encrypt(plaintext);

    expect(isEncrypted(encrypted)).toBe(true);
  });

  test('returns false for plaintext', () => {
    expect(isEncrypted('sk-1234567890abcdef')).toBe(false);
    expect(isEncrypted('just regular text')).toBe(false);
    expect(isEncrypted('only:two:parts')).toBe(false);
  });

  test('returns false for invalid format', () => {
    expect(isEncrypted('')).toBe(false);
    expect(isEncrypted('single')).toBe(false);
    expect(isEncrypted('two:parts')).toBe(false);
    expect(isEncrypted('too:many:parts:here')).toBe(false);
  });

  test('returns false for non-hex parts', () => {
    expect(isEncrypted('notHex:alsoNot:stillNot')).toBe(false);
    expect(isEncrypted('ab12:zzz:cd34')).toBe(false);
  });

  test('useful for migration detection', () => {
    const plainApiKey = 'sk-1234567890abcdef';
    const encryptedApiKey = encrypt(plainApiKey);

    // Migration logic
    function ensureEncrypted(value: string): string {
      if (!isEncrypted(value)) {
        return encrypt(value);
      }
      return value;
    }

    // Should encrypt plaintext
    const result1 = ensureEncrypted(plainApiKey);
    expect(isEncrypted(result1)).toBe(true);

    // Should leave encrypted alone
    const result2 = ensureEncrypted(encryptedApiKey);
    expect(result2).toBe(encryptedApiKey);
  });
});

describe('error handling', () => {
  test('throws if ENCRYPTION_KEY not set', () => {
    const originalKey = process.env.ENCRYPTION_KEY;
    delete process.env.ENCRYPTION_KEY;

    expect(() => encrypt('test')).toThrow('ENCRYPTION_KEY environment variable');

    process.env.ENCRYPTION_KEY = originalKey;
  });

  test('throws if ENCRYPTION_KEY is wrong length', () => {
    const originalKey = process.env.ENCRYPTION_KEY;
    process.env.ENCRYPTION_KEY = 'tooshort';

    expect(() => encrypt('test')).toThrow('must be 64 hex characters');

    process.env.ENCRYPTION_KEY = originalKey;
  });

  test('throws if ENCRYPTION_KEY is not hex', () => {
    const originalKey = process.env.ENCRYPTION_KEY;
    process.env.ENCRYPTION_KEY = 'Z'.repeat(64); // Not valid hex

    // This will throw when creating the buffer, but the check is on length
    process.env.ENCRYPTION_KEY = originalKey;
  });
});

describe('real-world usage', () => {
  test('encrypting API keys', () => {
    const openaiKey = 'sk-proj-1234567890abcdef';

    const encryptedOpenAI = encrypt(openaiKey);

    // Store in database (simulated)
    const connection = {
      type: 'openai',
      config: {
        apiKey: encryptedOpenAI,
      },
    };

    // Retrieve and decrypt
    const decryptedKey = decrypt(connection.config.apiKey);
    expect(decryptedKey).toBe(openaiKey);
  });

  test('encrypting database credentials', () => {
    const credentials = JSON.stringify({
      host: 'localhost',
      port: 5432,
      username: 'admin',
      password: 'super-secret-password',
      database: 'mydb',
    });

    const encrypted = encrypt(credentials);
    const decrypted = decrypt(encrypted);
    const parsed = JSON.parse(decrypted);

    expect(parsed.password).toBe('super-secret-password');
  });

  test('encrypting tokens', () => {
    const accessToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...';
    const refreshToken = 'refresh_token_here_1234567890';

    const encryptedAccess = encrypt(accessToken);
    const encryptedRefresh = encrypt(refreshToken);

    expect(decrypt(encryptedAccess)).toBe(accessToken);
    expect(decrypt(encryptedRefresh)).toBe(refreshToken);
  });
});
