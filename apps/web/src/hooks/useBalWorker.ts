/**
 * useBalWorker Hook
 *
 * Provides off-main-thread BAL parsing via a WebWorker.
 * Falls back to server actions if the worker fails to initialize
 * (e.g., during SSR or if the worker bundle has unresolvable deps).
 */

import { useRef, useEffect } from 'react';
import type { VisualGraph } from '@/lib/baleybot/visual/types';

// ============================================================================
// TYPES
// ============================================================================

export interface WorkerParseResult {
  entities: Array<{ name: string; config: Record<string, unknown> }>;
  graph: VisualGraph;
  errors: string[];
}

export interface WorkerValidationResult {
  errors: string[];
}

interface WorkerResponse {
  type: 'parsed' | 'validated';
  id: number;
  entities?: Array<{ name: string; config: Record<string, unknown> }>;
  graph?: VisualGraph;
  errors: string[];
}

// ============================================================================
// HOOK
// ============================================================================

export function useBalWorker() {
  const workerRef = useRef<Worker | null>(null);
  const messageIdRef = useRef(0);
  const workerFailedRef = useRef(false);

  /**
   * Lazily initialize the worker. Returns null if the worker can't be created
   * (SSR, worker bundle failure, etc.).
   */
  const getWorker = (): Worker | null => {
    if (workerFailedRef.current) {
      return null;
    }

    if (!workerRef.current) {
      // Guard against SSR
      if (typeof window === 'undefined' || typeof Worker === 'undefined') {
        workerFailedRef.current = true;
        return null;
      }

      try {
        workerRef.current = new Worker(
          new URL('../workers/bal-parser.worker.ts', import.meta.url)
        );

        // Listen for worker errors to trigger fallback
        workerRef.current.onerror = () => {
          workerFailedRef.current = true;
          workerRef.current?.terminate();
          workerRef.current = null;
        };
      } catch {
        workerFailedRef.current = true;
        return null;
      }
    }

    return workerRef.current;
  };

  /**
   * Parse BAL code off the main thread.
   * Returns parsed entities and visual graph, or null if the worker is unavailable.
   */
  const parseBalCode = (code: string): Promise<WorkerParseResult | null> => {
    const worker = getWorker();
    if (!worker) {
      return Promise.resolve(null);
    }

    const id = ++messageIdRef.current;

    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        worker.removeEventListener('message', handler);
        resolve(null);
      }, 5000);

      const handler = (e: MessageEvent<WorkerResponse>) => {
        if (e.data.type === 'parsed' && e.data.id === id) {
          clearTimeout(timeout);
          worker.removeEventListener('message', handler);
          resolve({
            entities: e.data.entities || [],
            graph: e.data.graph || { nodes: [], edges: [] },
            errors: e.data.errors,
          });
        }
      };

      worker.addEventListener('message', handler);
      worker.postMessage({ type: 'parse', id, payload: code });
    });
  };

  /**
   * Validate BAL code off the main thread.
   * Returns validation errors, or null if the worker is unavailable.
   */
  const validateBal = (code: string): Promise<WorkerValidationResult | null> => {
    const worker = getWorker();
    if (!worker) {
      return Promise.resolve(null);
    }

    const id = ++messageIdRef.current;

    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        worker.removeEventListener('message', handler);
        resolve(null);
      }, 5000);

      const handler = (e: MessageEvent<WorkerResponse>) => {
        if (e.data.type === 'validated' && e.data.id === id) {
          clearTimeout(timeout);
          worker.removeEventListener('message', handler);
          resolve({ errors: e.data.errors });
        }
      };

      worker.addEventListener('message', handler);
      worker.postMessage({ type: 'validate', id, payload: code });
    });
  };

  /**
   * Check if the worker is available for use.
   */
  const isAvailable = (): boolean => {
    return !workerFailedRef.current && typeof window !== 'undefined' && typeof Worker !== 'undefined';
  };

  useEffect(() => {
    return () => {
      workerRef.current?.terminate();
      workerRef.current = null;
    };
  }, []);

  return { parseBalCode, validateBal, isAvailable };
}
