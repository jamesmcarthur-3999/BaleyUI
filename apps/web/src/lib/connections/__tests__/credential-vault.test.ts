/**
 * Credential Vault Tests
 *
 * Tests for AES-256-GCM encryption of credentials.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { CredentialVault } from '../credential-vault';

describe('CredentialVault', () => {
  let vault: CredentialVault;

  beforeEach(() => {
    // Use a 32-character test key for AES-256
    vault = new CredentialVault('test-key-32-chars-long-exactly!!');
  });

  describe('encrypt', () => {
    it('should encrypt credentials before storage', () => {
      const plainCredential = 'super-secret-api-key';
      const encrypted = vault.encrypt(plainCredential);

      expect(encrypted).not.toBe(plainCredential);
      expect(encrypted).toMatch(/^[a-f0-9]+:[a-f0-9]+:[a-f0-9]+$/); // iv:authTag:ciphertext format
    });

    it('should produce different ciphertext for same input (IV randomization)', () => {
      const credential = 'same-credential';
      const encrypted1 = vault.encrypt(credential);
      const encrypted2 = vault.encrypt(credential);

      expect(encrypted1).not.toBe(encrypted2);
      // But both should decrypt to same value
      expect(vault.decrypt(encrypted1)).toBe(credential);
      expect(vault.decrypt(encrypted2)).toBe(credential);
    });

    it('should handle empty strings', () => {
      const encrypted = vault.encrypt('');
      expect(encrypted).toMatch(/^[a-f0-9]+:[a-f0-9]+:[a-f0-9]*$/);
      expect(vault.decrypt(encrypted)).toBe('');
    });

    it('should handle unicode characters', () => {
      const unicodeCredential = 'пароль-密码-🔐';
      const encrypted = vault.encrypt(unicodeCredential);
      expect(vault.decrypt(encrypted)).toBe(unicodeCredential);
    });
  });

  describe('decrypt', () => {
    it('should decrypt credentials correctly', () => {
      const plainCredential = 'super-secret-api-key';
      const encrypted = vault.encrypt(plainCredential);
      const decrypted = vault.decrypt(encrypted);

      expect(decrypted).toBe(plainCredential);
    });

    it('should throw on invalid format', () => {
      expect(() => vault.decrypt('not-valid-format')).toThrow(/invalid/i);
      expect(() => vault.decrypt('only:two')).toThrow(/invalid/i);
      expect(() => vault.decrypt('')).toThrow(/invalid/i);
    });

    it('should throw on tampered ciphertext', () => {
      const encrypted = vault.encrypt('secret');
      const [iv, authTag, ciphertext] = encrypted.split(':');
      const tampered = `${iv}:${authTag}:${ciphertext}ff`; // Add extra bytes

      expect(() => vault.decrypt(tampered)).toThrow();
    });

    it('should throw on tampered auth tag', () => {
      const encrypted = vault.encrypt('secret');
      const [iv, authTag, ciphertext] = encrypted.split(':');
      if (!authTag) throw new Error('Test setup error: authTag missing');
      // Modify auth tag
      const tamperedTag = authTag.slice(0, -2) + 'ff';
      const tampered = `${iv}:${tamperedTag}:${ciphertext}`;

      expect(() => vault.decrypt(tampered)).toThrow();
    });
  });

  describe('mask', () => {
    it('should mask credentials in logs (show first 3 and last 4 chars)', () => {
      const apiKey = 'sk-1234567890abcdef';
      const masked = vault.mask(apiKey);

      expect(masked).toBe('sk-****cdef');
      expect(masked).not.toContain('1234567890');
    });

    it('should fully mask short credentials', () => {
      expect(vault.mask('short')).toBe('****');
      expect(vault.mask('12345678')).toBe('****');
      expect(vault.mask('123456789')).toBe('123****6789');
    });

    it('should handle empty string', () => {
      expect(vault.mask('')).toBe('****');
    });
  });

  describe('isEncrypted', () => {
    it('should detect encrypted values', () => {
      const encrypted = vault.encrypt('secret');
      expect(vault.isEncrypted(encrypted)).toBe(true);
    });

    it('should detect plain text values', () => {
      expect(vault.isEncrypted('plain-text-value')).toBe(false);
      expect(vault.isEncrypted('sk-12345')).toBe(false);
      expect(vault.isEncrypted('')).toBe(false);
    });
  });

  describe('different keys', () => {
    it('should fail to decrypt with wrong key', () => {
      const vault1 = new CredentialVault('key-1-32-characters-exactly!!!!');
      const vault2 = new CredentialVault('key-2-32-characters-exactly!!!!');

      const encrypted = vault1.encrypt('secret');

      expect(() => vault2.decrypt(encrypted)).toThrow();
    });
  });
});
