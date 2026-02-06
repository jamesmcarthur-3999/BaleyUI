/**
 * BAL Parser WebWorker
 *
 * Moves CPU-intensive BAL parsing off the main thread.
 * Uses the pure parser module that has no server-side dependencies.
 *
 * Note: This worker imports from @baleybots/tools which has "sideEffects": false.
 * Webpack tree-shaking should only pull in the tokenize/parse functions (pure lexer/parser).
 * If the bundle fails due to @baleybots/core being resolved, the useBalWorker hook
 * automatically falls back to server actions.
 */

import {
  parseBalCode,
  balToVisual,
} from '@/lib/baleybot/bal-parser-pure';

// ============================================================================
// MESSAGE TYPES
// ============================================================================

type WorkerRequest =
  | { type: 'parse'; id: number; payload: string }
  | { type: 'validate'; id: number; payload: string };

// ============================================================================
// MESSAGE HANDLER
// ============================================================================

self.onmessage = (e: MessageEvent<WorkerRequest>) => {
  const { type, id, payload } = e.data;

  switch (type) {
    case 'parse': {
      try {
        const parsed = parseBalCode(payload);
        const result = balToVisual(payload);
        self.postMessage({
          type: 'parsed',
          id,
          entities: parsed.entities,
          graph: result.graph,
          errors: [...parsed.errors, ...result.errors],
        });
      } catch (error) {
        self.postMessage({
          type: 'parsed',
          id,
          entities: [],
          graph: { nodes: [], edges: [] },
          errors: [error instanceof Error ? error.message : String(error)],
        });
      }
      break;
    }
    case 'validate': {
      try {
        const { errors } = parseBalCode(payload);
        self.postMessage({ type: 'validated', id, errors });
      } catch (error) {
        self.postMessage({
          type: 'validated',
          id,
          errors: [error instanceof Error ? error.message : String(error)],
        });
      }
      break;
    }
  }
};
