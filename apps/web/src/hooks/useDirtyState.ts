/**
 * useDirtyState Hook
 *
 * Tracks unsaved changes by comparing current state to last-saved state.
 * Used to warn users before losing unsaved work.
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { deepEqual } from '@/lib/utils/deep-equal';

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
  // Suppress the next dirty check after markClean() to prevent false-positive
  // that occurs between data load and the first state comparison
  const suppressNextCheckRef = useRef(false);

  // Keep currentStateRef in sync with the latest state
  currentStateRef.current = currentState;

  // Check for changes when currentState updates
  useEffect(() => {
    // If markClean() was just called, skip this cycle to prevent false-positive
    if (suppressNextCheckRef.current) {
      suppressNextCheckRef.current = false;
      return;
    }

    // Track if we've ever had content
    if (currentState.balCode || currentState.entities.length > 0) {
      hasHadContentRef.current = true;
    }

    // Only mark dirty if we've had content before (don't mark dirty on initial load)
    if (!hasHadContentRef.current) {
      setIsDirty(false);
      return;
    }

    const saved = savedStateRef.current;
    const basicDiff =
      currentState.name !== saved.name ||
      currentState.description !== saved.description ||
      currentState.icon !== saved.icon ||
      currentState.balCode !== saved.balCode;

    const entitiesChanged =
      currentState.entities !== saved.entities ||
      currentState.entities.length !== saved.entities.length;

    const connectionsChanged =
      currentState.connections !== saved.connections ||
      currentState.connections.length !== saved.connections.length;

    setIsDirty(basicDiff || entitiesChanged || connectionsChanged);
  }, [currentState]);

  // Mark current state as clean (after save)
  // useCallback is required here because markClean is used in useEffect dependency
  // arrays by consumers - without stable identity it causes infinite render loops
  const markClean = useCallback(() => {
    savedStateRef.current = { ...currentStateRef.current };
    suppressNextCheckRef.current = true;
    setIsDirty(false);
  }, []);

  // Mark state as dirty manually (e.g., after AI modifies entities)
  const markDirty = useCallback(() => {
    setIsDirty(true);
  }, []);

  // Get human-readable list of what changed
  const getChanges = (): string[] => {
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
  };

  return {
    isDirty,
    markClean,
    markDirty,
    getChanges,
  };
}
