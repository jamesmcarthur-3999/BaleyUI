/**
 * useDirtyState Hook
 *
 * Tracks unsaved changes by comparing current state to last-saved state.
 * Used to warn users before losing unsaved work.
 */

import { useState, useRef, useCallback, useEffect } from 'react';

/**
 * Deep equality check for objects with cycle detection
 */
function deepEqual(a: unknown, b: unknown, seen = new WeakSet<object>()): boolean {
  // Same reference or primitives
  if (a === b) return true;

  // Different types
  if (typeof a !== typeof b) return false;

  // Handle null
  if (a === null || b === null) return a === b;

  // Primitives
  if (typeof a !== 'object') return a === b;

  // Cycle detection
  if (seen.has(a as object)) return true; // Assume equal for cycles
  seen.add(a as object);

  // Arrays
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((item, i) => deepEqual(item, b[i], seen));
  }

  // Objects
  if (Array.isArray(a) !== Array.isArray(b)) return false;

  const keysA = Object.keys(a as object);
  const keysB = Object.keys(b as object);

  if (keysA.length !== keysB.length) return false;

  return keysA.every(key =>
    key in (b as object) &&
    deepEqual(
      (a as Record<string, unknown>)[key],
      (b as Record<string, unknown>)[key],
      seen
    )
  );
}

/**
 * State shape for tracking dirty state in the creator
 */
export interface CreatorDirtyState {
  entities: unknown[];
  connections: unknown[];
  balCode: string;
  name: string;
  description: string;
  icon: string;
}

/**
 * Hook return type
 */
export interface UseDirtyStateReturn {
  /** Whether there are unsaved changes */
  isDirty: boolean;
  /** Mark current state as saved (clean) */
  markClean: () => void;
  /** Mark state as dirty manually */
  markDirty: () => void;
  /** Get summary of what changed */
  getChanges: () => string[];
}

/**
 * Track unsaved changes in the BaleyBot creator
 *
 * @param currentState - Current state to compare against saved state
 * @returns Object with isDirty flag and control functions
 *
 * @example
 * ```tsx
 * const { isDirty, markClean } = useDirtyState({
 *   entities,
 *   connections,
 *   balCode,
 *   name,
 *   icon,
 * });
 *
 * // After successful save:
 * markClean();
 * ```
 */
export function useDirtyState(currentState: CreatorDirtyState): UseDirtyStateReturn {
  // Store the last saved state in a ref to avoid re-renders
  const savedStateRef = useRef<CreatorDirtyState>(currentState);
  const [isDirty, setIsDirty] = useState(false);
  // Track if we've ever had meaningful content (not just initial empty state)
  const hasHadContentRef = useRef(false);
  // Ref to current state for stable callbacks (avoids infinite re-renders)
  const currentStateRef = useRef<CreatorDirtyState>(currentState);

  // Keep currentStateRef in sync with the latest state
  currentStateRef.current = currentState;

  // Check for changes when currentState updates
  useEffect(() => {
    // Track if we've ever had content
    if (currentState.balCode || currentState.entities.length > 0) {
      hasHadContentRef.current = true;
    }

    // Only mark dirty if we've had content before (don't mark dirty on initial load)
    if (!hasHadContentRef.current) {
      setIsDirty(false);
      return;
    }

    const dirty = !deepEqual(currentState, savedStateRef.current);
    setIsDirty(dirty);
  }, [currentState]);

  // Mark current state as clean (after save)
  // Uses ref for stable identity - prevents infinite loops when used in effects
  const markClean = useCallback(() => {
    savedStateRef.current = { ...currentStateRef.current };
    setIsDirty(false);
  }, []);

  // Mark state as dirty manually (e.g., after AI modifies entities)
  const markDirty = useCallback(() => {
    setIsDirty(true);
  }, []);

  // Get human-readable list of what changed
  // Uses ref for stable identity - prevents infinite loops when used in effects
  const getChanges = useCallback((): string[] => {
    const changes: string[] = [];
    const saved = savedStateRef.current;
    const current = currentStateRef.current;

    if (current.name !== saved.name) {
      changes.push('Name');
    }
    if (current.description !== saved.description) {
      changes.push('Description');
    }
    if (current.icon !== saved.icon) {
      changes.push('Icon');
    }
    if (current.balCode !== saved.balCode) {
      changes.push('Code');
    }
    if (!deepEqual(current.entities, saved.entities)) {
      changes.push('Entities');
    }
    if (!deepEqual(current.connections, saved.connections)) {
      changes.push('Connections');
    }

    return changes;
  }, []);

  return {
    isDirty,
    markClean,
    markDirty,
    getChanges,
  };
}
