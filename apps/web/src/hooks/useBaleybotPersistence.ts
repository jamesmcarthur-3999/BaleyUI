/**
 * useBaleybotPersistence Hook
 *
 * Encapsulates all save/auto-save/conflict logic for the BaleyBot editor.
 * Owns: saveMutation, isSaving, showConflictDialog, isResolvingConflict,
 * auto-save timer with exponential backoff, debounced save.
 */

import { useState, useRef, useEffect } from 'react';
import { trpc } from '@/lib/trpc/client';
import { useDebouncedCallback } from '@/hooks/useDebounce';
import { isSaveConflictError } from '@/components/creator';
import { buildCreatorHistoryPayload } from '@/lib/baleybot/creator-helpers';
import { formatErrorWithAction } from '@/lib/errors/creator-errors';
import type { CreatorMessage } from '@/lib/baleybot/creator-types';
import type { ConflictAction } from '@/components/creator';

// ============================================================================
// TYPES
// ============================================================================

export interface UseBaleybotPersistenceArgs {
  savedBaleybotId: string | null;
  setSavedBaleybotId: (id: string) => void;
  balCode: string;
  name: string;
  description: string;
  icon: string;
  messages: CreatorMessage[];
  isDirty: boolean;
  isStreaming: boolean;
  markClean: () => void;
  /** Called after successful save for side-effects (invalidate queries, inject advisor, etc.) */
  onSaveSuccess: (id: string, isFirstSave: boolean) => void;
  /** Called on save error (non-conflict) */
  onError: (message: string) => void;
  /** Toast function for user notifications */
  toast: (opts: { title: string; description: string; variant?: 'default' | 'destructive' }) => void;
}

export interface UseBaleybotPersistenceResult {
  handleSave: () => Promise<string | null>;
  debouncedSave: () => void;
  isSaving: boolean;
  isSavePending: boolean;
  showConflictDialog: boolean;
  setShowConflictDialog: (show: boolean) => void;
  handleConflictAction: (action: ConflictAction) => Promise<void>;
  isResolvingConflict: boolean;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const AUTO_SAVE_MAX_FAILURES = 4;
const AUTO_SAVE_BASE_DELAY = 2000;
const AUTO_SAVE_MAX_DELAY = 30000;
const DEBOUNCE_DELAY = 500;

// ============================================================================
// IMPLEMENTATION
// ============================================================================

export function useBaleybotPersistence(args: UseBaleybotPersistenceArgs): UseBaleybotPersistenceResult {
  const {
    savedBaleybotId,
    setSavedBaleybotId,
    balCode,
    name,
    description,
    icon,
    messages,
    isDirty,
    isStreaming,
    markClean,
    onSaveSuccess,
    onError,
    toast,
  } = args;

  // -- State --
  const [isSaving, setIsSaving] = useState(false);
  const [showConflictDialog, setShowConflictDialog] = useState(false);
  const [isResolvingConflict, setIsResolvingConflict] = useState(false);

  // -- Mutation --
  const saveMutation = trpc.baleybots.saveFromSession.useMutation();

  // -- Auto-save refs --
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoSaveFailCountRef = useRef(0);

  // -------------------------------------------------------------------------
  // handleSave
  // -------------------------------------------------------------------------

  const handleSave = async (): Promise<string | null> => {
    if (!balCode || !name) return null;

    setIsSaving(true);

    try {
      const result = await saveMutation.mutateAsync({
        baleybotId: savedBaleybotId ?? undefined,
        name,
        description: description || undefined,
        icon: icon || undefined,
        balCode,
        conversationHistory: buildCreatorHistoryPayload(messages),
      });

      const isFirstSave = !savedBaleybotId;

      // If new, update savedBaleybotId
      if (isFirstSave) {
        setSavedBaleybotId(result.id);
      }

      // Mark state as clean after successful save
      markClean();

      // Notify caller for side effects (query invalidation, advisor injection, URL rewrite)
      onSaveSuccess(result.id, isFirstSave);

      return result.id;
    } catch (error) {
      console.error('Save failed:', error);

      // Check for save conflict
      if (isSaveConflictError(error)) {
        setShowConflictDialog(true);
        return null;
      }

      const errorContent = formatErrorWithAction(error);
      toast({ title: 'Save failed', description: errorContent, variant: 'destructive' });
      onError(errorContent);

      return null;
    } finally {
      setIsSaving(false);
    }
  };

  // -------------------------------------------------------------------------
  // handleConflictAction
  // -------------------------------------------------------------------------

  const handleConflictAction = async (action: ConflictAction) => {
    setIsResolvingConflict(true);

    try {
      switch (action) {
        case 'reload':
          // Force refetch will trigger the effect to update local state
          window.location.reload();
          break;

        case 'force-save':
          // Retry save uses optimistic locking (updateWithLock) — safer than force-overwrite
          setShowConflictDialog(false);
          await handleSave();
          break;

        case 'cancel':
        default:
          setShowConflictDialog(false);
          break;
      }
    } finally {
      setIsResolvingConflict(false);
      if (action !== 'force-save') {
        setShowConflictDialog(false);
      }
    }
  };

  // -------------------------------------------------------------------------
  // Debounced save (prevents rapid clicks)
  // -------------------------------------------------------------------------

  const { debouncedFn: debouncedSave, isPending: isSavePending } = useDebouncedCallback(
    handleSave,
    DEBOUNCE_DELAY
  );

  // -------------------------------------------------------------------------
  // Auto-save effect with exponential backoff
  // -------------------------------------------------------------------------

  useEffect(() => {
    // Only auto-save when: dirty, has content, not mid-stream, not already saving
    if (!isDirty || !balCode || !name || isStreaming || isSaving) {
      return;
    }

    // Stop auto-saving after too many consecutive failures
    if (autoSaveFailCountRef.current >= AUTO_SAVE_MAX_FAILURES) {
      return;
    }

    // Clear any existing auto-save timer
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
    }

    // Exponential backoff: 2s → 4s → 8s → 16s, capped at 30s
    const delay = Math.min(
      AUTO_SAVE_BASE_DELAY * Math.pow(2, autoSaveFailCountRef.current),
      AUTO_SAVE_MAX_DELAY,
    );

    autoSaveTimerRef.current = setTimeout(async () => {
      autoSaveTimerRef.current = null;
      const result = await handleSave();
      if (result) {
        autoSaveFailCountRef.current = 0;
      } else {
        autoSaveFailCountRef.current += 1;
      }
    }, delay);

    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
        autoSaveTimerRef.current = null;
      }
    };
    // handleSave is stable across renders (reads from args closure)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDirty, balCode, name, isStreaming, isSaving]);

  return {
    handleSave,
    debouncedSave,
    isSaving,
    isSavePending,
    showConflictDialog,
    setShowConflictDialog,
    handleConflictAction,
    isResolvingConflict,
  };
}
