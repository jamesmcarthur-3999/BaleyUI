'use client';

import { useState, useCallback, useEffect } from 'react';

/**
 * State snapshot for history tracking
 */
export interface HistorySnapshot<T> {
  state: T;
  timestamp: number;
  description?: string;
}

/**
 * History hook configuration
 */
export interface UseHistoryOptions<T> {
  /** Maximum number of history states to keep */
  maxStates?: number;
  /** Whether to listen for keyboard shortcuts */
  enableKeyboardShortcuts?: boolean;
  /** Callback when state changes due to undo/redo */
  onStateChange?: (state: T) => void;
}

/**
 * History hook return type
 */
export interface UseHistoryReturn<T> {
  /** Current state */
  current: T | null;
  /** Push a new state onto the history */
  push: (state: T, description?: string) => void;
  /** Undo to previous state */
  undo: () => void;
  /** Redo to next state */
  redo: () => void;
  /** Clear all history */
  clear: () => void;
  /** Replace current state without adding to history */
  replace: (state: T) => void;
  /** Whether undo is available */
  canUndo: boolean;
  /** Whether redo is available */
  canRedo: boolean;
  /** Number of undo steps available */
  undoCount: number;
  /** Number of redo steps available */
  redoCount: number;
  /** Description of last action (for UI) */
  lastActionDescription?: string;
}

const MAX_HISTORY_SIZE = 50;

/**
 * Hook for managing undo/redo history for any state.
 *
 * Features:
 * - Configurable max history size
 * - Optional keyboard shortcuts (Cmd/Ctrl+Z, Cmd/Ctrl+Shift+Z)
 * - Push, undo, redo, clear, and replace operations
 * - Descriptive labels for each state change
 *
 * @example
 * ```tsx
 * const { current, push, undo, redo, canUndo, canRedo } = useHistory<MyState>({
 *   maxStates: 20,
 *   enableKeyboardShortcuts: true,
 * });
 *
 * // Push new state when AI responds
 * push(newState, 'Added new entity');
 *
 * // Undo/redo buttons
 * <button onClick={undo} disabled={!canUndo}>Undo</button>
 * <button onClick={redo} disabled={!canRedo}>Redo</button>
 * ```
 */
export function useHistory<T>(options: UseHistoryOptions<T> = {}): UseHistoryReturn<T> {
  const { maxStates = MAX_HISTORY_SIZE, enableKeyboardShortcuts = false, onStateChange } = options;

  // Past states (for undo)
  const [past, setPast] = useState<HistorySnapshot<T>[]>([]);
  // Current state
  const [present, setPresent] = useState<HistorySnapshot<T> | null>(null);
  // Future states (for redo)
  const [future, setFuture] = useState<HistorySnapshot<T>[]>([]);

  /**
   * Push a new state onto the history
   */
  const push = useCallback(
    (state: T, description?: string) => {
      setFuture([]); // Clear redo stack

      if (present) {
        setPast((prev) => {
          const newPast = [...prev, present];
          // Limit history size
          if (newPast.length > maxStates) {
            return newPast.slice(newPast.length - maxStates);
          }
          return newPast;
        });
      }

      setPresent({
        state,
        timestamp: Date.now(),
        description,
      });
    },
    [present, maxStates]
  );

  /**
   * Replace current state without adding to history
   */
  const replace = useCallback((state: T) => {
    setPresent((prev) =>
      prev
        ? { ...prev, state, timestamp: Date.now() }
        : { state, timestamp: Date.now() }
    );
  }, []);

  /**
   * Undo to previous state
   */
  const undo = useCallback(() => {
    if (past.length === 0) return;

    const previous = past[past.length - 1]!; // Safe: checked length above
    const newPast = past.slice(0, -1);

    setPast(newPast);
    if (present) {
      setFuture((prev) => [present, ...prev]);
    }
    setPresent(previous);

    // Notify consumer of state change
    onStateChange?.(previous.state);
  }, [past, present, onStateChange]);

  /**
   * Redo to next state
   */
  const redo = useCallback(() => {
    if (future.length === 0) return;

    const next = future[0]!; // Safe: checked length above
    const newFuture = future.slice(1);

    if (present) {
      setPast((prev) => [...prev, present]);
    }
    setFuture(newFuture);
    setPresent(next);

    // Notify consumer of state change
    onStateChange?.(next.state);
  }, [future, present, onStateChange]);

  /**
   * Clear all history
   */
  const clear = useCallback(() => {
    setPast([]);
    setPresent(null);
    setFuture([]);
  }, []);

  /**
   * Handle keyboard shortcuts
   */
  useEffect(() => {
    if (!enableKeyboardShortcuts) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const isMod = e.metaKey || e.ctrlKey;

      if (isMod && e.key === 'z') {
        if (e.shiftKey) {
          // Cmd/Ctrl+Shift+Z = Redo
          e.preventDefault();
          redo();
        } else {
          // Cmd/Ctrl+Z = Undo
          e.preventDefault();
          undo();
        }
      }

      // Also support Cmd/Ctrl+Y for redo (Windows convention)
      if (isMod && e.key === 'y') {
        e.preventDefault();
        redo();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [enableKeyboardShortcuts, undo, redo]);

  return {
    current: present?.state ?? null,
    push,
    undo,
    redo,
    clear,
    replace,
    canUndo: past.length > 0,
    canRedo: future.length > 0,
    undoCount: past.length,
    redoCount: future.length,
    lastActionDescription: present?.description,
  };
}

export default useHistory;
