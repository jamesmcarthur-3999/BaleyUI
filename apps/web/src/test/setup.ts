/**
 * Vitest Setup
 *
 * Runs before each test file.
 */

import { afterEach, vi } from 'vitest';
import { teardownTestEnv } from './utils';

// Clean up after each test
afterEach(() => {
  teardownTestEnv();
});

// Mock crypto.randomUUID if not available
if (typeof crypto === 'undefined' || !crypto.randomUUID) {
  (globalThis as { crypto?: Crypto }).crypto = {
    randomUUID: (): `${string}-${string}-${string}-${string}-${string}` => {
      return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
      }) as `${string}-${string}-${string}-${string}-${string}`;
    },
  } as Crypto;
}

// Mock environment variables
vi.stubEnv('DATABASE_URL', 'postgresql://test:test@localhost:5432/test');
vi.stubEnv('ENCRYPTION_KEY', 'test-encryption-key-32-bytes-00');
vi.stubEnv('BETTER_AUTH_SECRET', 'test-secret');
vi.stubEnv('BETTER_AUTH_URL', 'http://localhost:3000');
vi.stubEnv('NEXT_PUBLIC_BETTER_AUTH_URL', 'http://localhost:3000');
