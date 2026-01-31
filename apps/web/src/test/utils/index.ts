/**
 * Test Utilities
 *
 * Helper functions for writing tests.
 */

import { vi } from 'vitest';
import { mockDb, resetMockStore, seedMockStore } from '../mocks/database';
import { getAllFixtures, fixtures } from '../fixtures';

// ============================================================================
// Test Setup Helpers
// ============================================================================

/**
 * Set up a clean test environment with seeded data
 */
export function setupTestEnv() {
  resetMockStore();
  seedMockStore(getAllFixtures());
}

/**
 * Set up test environment with custom data
 */
export function setupTestEnvWith(data: Parameters<typeof seedMockStore>[0]) {
  resetMockStore();
  seedMockStore(data);
}

/**
 * Clean up test environment
 */
export function teardownTestEnv() {
  resetMockStore();
  vi.clearAllMocks();
}

// ============================================================================
// Timing Helpers
// ============================================================================

/**
 * Wait for a specified number of milliseconds
 */
export function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Wait for a condition to be true
 */
export async function waitFor(
  condition: () => boolean | Promise<boolean>,
  options: { timeout?: number; interval?: number } = {}
): Promise<void> {
  const { timeout = 5000, interval = 50 } = options;
  const start = Date.now();

  while (!(await condition())) {
    if (Date.now() - start > timeout) {
      throw new Error('waitFor timed out');
    }
    await wait(interval);
  }
}

// ============================================================================
// Mock Helpers
// ============================================================================

/**
 * Create a mock fetch that returns a streaming response
 */
export function createMockStreamingFetch(
  events: Array<{ type: string; [key: string]: unknown }>
) {
  const encoder = new TextEncoder();

  return vi.fn().mockResolvedValue({
    ok: true,
    body: new ReadableStream({
      start(controller) {
        for (const event of events) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        }
        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        controller.close();
      },
    }),
  });
}

/**
 * Create a mock tRPC context
 */
export function createMockTRPCContext(overrides: {
  userId?: string;
  workspaceId?: string;
} = {}) {
  return {
    db: mockDb,
    userId: overrides.userId ?? fixtures.workspaces.default.ownerId,
    workspace: fixtures.workspaces.default,
  };
}

// ============================================================================
// Assertion Helpers
// ============================================================================

/**
 * Assert that an array contains items in order (not necessarily contiguous)
 */
export function expectItemsInOrder<T>(
  array: T[],
  expectedOrder: T[],
  compareFn: (a: T, b: T) => boolean = (a, b) => a === b
): void {
  let lastIndex = -1;
  for (const expected of expectedOrder) {
    const index = array.findIndex((item, i) => i > lastIndex && compareFn(item, expected));
    if (index === -1) {
      throw new Error(`Expected item not found in array: ${JSON.stringify(expected)}`);
    }
    lastIndex = index;
  }
}

/**
 * Assert that an object has specific keys
 */
export function expectKeys(obj: object, keys: string[]): void {
  const objKeys = Object.keys(obj);
  for (const key of keys) {
    if (!objKeys.includes(key)) {
      throw new Error(`Expected key "${key}" not found in object`);
    }
  }
}

// ============================================================================
// Re-exports
// ============================================================================

export { mockDb, resetMockStore, seedMockStore } from '../mocks/database';
export { fixtures, getAllFixtures, createFixture } from '../fixtures';
export * from '../mocks/baleybots';
