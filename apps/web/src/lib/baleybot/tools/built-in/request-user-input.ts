/**
 * request_user_input Tool
 *
 * Allows a BaleyBot (e.g. the creator concierge) to pause execution,
 * ask the user a question, and wait for their response before continuing.
 *
 * Uses an in-memory channel with TTL to bridge the async gap between
 * the running BB execution and the user's HTTP response.
 */

import { createLogger } from '@/lib/logger';

const logger = createLogger('request-user-input');

// ============================================================================
// USER INPUT CHANNEL
// ============================================================================

export interface UserInputChannel {
  /** Wait for the user to respond. Resolves with their text. */
  waitForInput(question: string): Promise<string>;
  /** Resolve a pending wait with the user's response. */
  resolveInput(response: string): void;
  /** Abort a pending wait (e.g. on disconnect). */
  abort(reason?: string): void;
  /** Whether there is a pending question waiting for input. */
  readonly pending: boolean;
  /** The current pending question, if any. */
  readonly currentQuestion: string | null;
}

interface PendingRequest {
  question: string;
  resolve: (response: string) => void;
  reject: (error: Error) => void;
}

export function createUserInputChannel(): UserInputChannel {
  let pendingRequest: PendingRequest | null = null;

  return {
    waitForInput(question: string): Promise<string> {
      if (pendingRequest) {
        // Only one question at a time
        pendingRequest.reject(new Error('New question superseded previous pending question'));
      }

      return new Promise<string>((resolve, reject) => {
        pendingRequest = { question, resolve, reject };
      });
    },

    resolveInput(response: string): void {
      if (!pendingRequest) {
        logger.warn('resolveInput called with no pending request');
        return;
      }
      const req = pendingRequest;
      pendingRequest = null;
      req.resolve(response);
    },

    abort(reason?: string): void {
      if (!pendingRequest) return;
      const req = pendingRequest;
      pendingRequest = null;
      req.reject(new Error(reason ?? 'User input request aborted'));
    },

    get pending(): boolean {
      return pendingRequest !== null;
    },

    get currentQuestion(): string | null {
      return pendingRequest?.question ?? null;
    },
  };
}

// ============================================================================
// CHANNEL REGISTRY (in-memory, keyed by executionId)
// ============================================================================

const TTL_MS = 5 * 60 * 1000; // 5 minutes

interface ChannelEntry {
  channel: UserInputChannel;
  createdAt: number;
}

const channelRegistry = new Map<string, ChannelEntry>();

/** Register a channel for an execution. */
export function registerChannel(executionId: string, channel: UserInputChannel): void {
  // Clean up expired entries opportunistically
  pruneExpiredChannels();
  channelRegistry.set(executionId, { channel, createdAt: Date.now() });
}

/** Get a channel by execution ID (returns null if expired or missing). */
export function getChannel(executionId: string): UserInputChannel | null {
  const entry = channelRegistry.get(executionId);
  if (!entry) return null;

  if (Date.now() - entry.createdAt > TTL_MS) {
    entry.channel.abort('Channel expired');
    channelRegistry.delete(executionId);
    return null;
  }

  return entry.channel;
}

/** Remove a channel (call on execution completion). */
export function removeChannel(executionId: string): void {
  const entry = channelRegistry.get(executionId);
  if (entry) {
    entry.channel.abort('Execution completed');
    channelRegistry.delete(executionId);
  }
}

function pruneExpiredChannels(): void {
  const now = Date.now();
  for (const [id, entry] of channelRegistry) {
    if (now - entry.createdAt > TTL_MS) {
      entry.channel.abort('Channel expired');
      channelRegistry.delete(id);
    }
  }
}

// ============================================================================
// TOOL SCHEMA + METADATA
// ============================================================================

export const REQUEST_USER_INPUT_SCHEMA = {
  type: 'object',
  properties: {
    question: {
      type: 'string',
      description: 'The question to ask the user. Should be clear and specific.',
    },
  },
  required: ['question'],
} as const;

export interface RequestUserInputResult {
  response: string;
}
