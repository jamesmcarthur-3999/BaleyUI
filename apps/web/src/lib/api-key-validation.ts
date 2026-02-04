import { randomBytes, createHash } from 'crypto';

export const API_KEY_PREFIX = 'bui_';
export const API_KEY_LENGTH = 32; // Excluding prefix

/**
 * Validate API key format.
 */
export function isValidApiKeyFormat(key: string): boolean {
  if (!key.startsWith(API_KEY_PREFIX)) {
    return false;
  }

  const keyPart = key.slice(API_KEY_PREFIX.length);

  // Must be correct length
  if (keyPart.length !== API_KEY_LENGTH) {
    return false;
  }

  // Must be alphanumeric
  if (!/^[a-zA-Z0-9]+$/.test(keyPart)) {
    return false;
  }

  return true;
}

/**
 * Generate a secure API key.
 */
export function generateApiKey(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const bytes = randomBytes(API_KEY_LENGTH);

  let key = API_KEY_PREFIX;
  for (let i = 0; i < API_KEY_LENGTH; i++) {
    key += chars[bytes[i] % chars.length];
  }

  return key;
}

/**
 * Hash API key for storage (never store plain text keys).
 */
export function hashApiKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

/**
 * Get the prefix portion of an API key for display.
 * Shows the prefix and first 4 chars of the key.
 */
export function getApiKeyDisplayPrefix(key: string): string {
  if (!key.startsWith(API_KEY_PREFIX)) {
    return key.slice(0, 8) + '...';
  }
  return key.slice(0, API_KEY_PREFIX.length + 4) + '...';
}
