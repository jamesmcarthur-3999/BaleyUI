/**
 * Test Infrastructure
 *
 * Central export for all test utilities, mocks, and fixtures.
 *
 * Usage:
 * ```typescript
 * import { setupTestEnv, fixtures, mockScenarios, createMockBaleybotStream } from '@/test';
 *
 * describe('MyComponent', () => {
 *   beforeEach(() => {
 *     setupTestEnv();
 *   });
 *
 *   it('handles streaming', async () => {
 *     const stream = createMockBaleybotStream(mockScenarios.simpleText('Hello!'));
 *     // ... test with stream
 *   });
 * });
 * ```
 */

// Test setup utilities
export {
  setupTestEnv,
  setupTestEnvWith,
  teardownTestEnv,
  wait,
  waitFor,
  createMockStreamingFetch,
  createMockTRPCContext,
  expectItemsInOrder,
  expectKeys,
} from './utils';

// Database mocks
export {
  mockDb,
  resetMockStore,
  seedMockStore,
} from './mocks/database';

// BaleyBots mocks
export {
  createMockBaleybotStream,
  collectMockEvents,
  mockScenarios,
  eventsToSSE,
  createMockSSEStream,
  type MockBaleybotConfig,
  type MockToolCall,
} from './mocks/baleybots';

// Fixtures
export {
  fixtures,
  getAllFixtures,
  createFixture,
} from './fixtures';
