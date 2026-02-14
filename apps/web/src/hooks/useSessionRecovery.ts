/**
 * useSessionRecovery Hook
 *
 * Manages sessionStorage-based session recovery for new BaleyBots.
 * - Persists state on change (for new bots only, until first save)
 * - Restores on mount if < 24h old and no ?fresh=1 param
 * - Clears after first save (when savedBaleybotId is set)
 */

import { useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import type { VisualEntity } from '@/lib/baleybot/creator-types';
import type { ChatMessage } from '@/components/chat';

// ============================================================================
// TYPES
// ============================================================================

export interface UseSessionRecoveryArgs {
  id: string;
  isNew: boolean;
  savedBaleybotId: string | null;
  /** State to persist */
  state: {
    messages: ChatMessage[];
    entities: VisualEntity[];
    balCode: string;
    name: string;
    description: string;
    icon: string;
  };
  /** State setters for restore */
  restore: {
    setMessages: (updater: (prev: ChatMessage[]) => ChatMessage[]) => void;
    setEntities: (entities: VisualEntity[]) => void;
    setBalCode: (code: string) => void;
    setName: (name: string) => void;
    setDescription: (desc: string) => void;
    setIcon: (icon: string) => void;
  };
}

// ============================================================================
// CONSTANTS
// ============================================================================

const SESSION_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours

// ============================================================================
// IMPLEMENTATION
// ============================================================================

export function useSessionRecovery(args: UseSessionRecoveryArgs): void {
  const { id, isNew, savedBaleybotId, state, restore } = args;
  const searchParams = useSearchParams();

  const sessionKey = `creator-session:${id}`;

  // -------------------------------------------------------------------------
  // Persist state to sessionStorage after each meaningful change
  // Stop persisting once the BB has been saved (savedBaleybotId is set)
  // -------------------------------------------------------------------------

  useEffect(() => {
    if (!isNew || state.messages.length === 0 || savedBaleybotId) return;
    try {
      const snapshot = {
        ts: Date.now(),
        messages: state.messages.map((m) => ({
          id: m.id,
          role: m.role,
          content: m.content,
          timestamp: m.timestamp instanceof Date ? m.timestamp.toISOString() : m.timestamp,
        })),
        entities: state.entities,
        balCode: state.balCode,
        name: state.name,
        description: state.description,
        icon: state.icon,
      };
      sessionStorage.setItem(sessionKey, JSON.stringify(snapshot));
    } catch {
      // sessionStorage full or unavailable — non-critical
    }
  }, [isNew, state.messages, state.entities, state.balCode, state.name, state.description, state.icon, sessionKey, savedBaleybotId]);

  // -------------------------------------------------------------------------
  // Restore session on mount (new BBs only, < 24h old, unless ?fresh=1)
  // -------------------------------------------------------------------------

  useEffect(() => {
    if (!isNew) return;
    // Skip restore if fresh flag is set (user clicked "Start Fresh")
    if (searchParams.get('fresh')) {
      try { sessionStorage.removeItem(sessionKey); } catch { /* noop */ }
      return;
    }
    try {
      const raw = sessionStorage.getItem(sessionKey);
      if (!raw) return;
      const snapshot = JSON.parse(raw) as {
        ts: number;
        messages: Array<{ id: string; role: string; content: string; timestamp: string }>;
        entities: VisualEntity[];
        balCode: string;
        name: string;
        description: string;
        icon: string;
      };
      // Only restore if < 24 hours old
      if (Date.now() - snapshot.ts > SESSION_EXPIRY_MS) {
        sessionStorage.removeItem(sessionKey);
        return;
      }
      if (snapshot.messages.length > 0) {
        restore.setMessages(() =>
          snapshot.messages.map((m): ChatMessage => ({
            id: m.id,
            role: m.role as 'user' | 'assistant' | 'system',
            content: m.content,
            timestamp: new Date(m.timestamp),
            status: 'complete',
          }))
        );
      }
      if (snapshot.entities.length > 0) restore.setEntities(snapshot.entities);
      if (snapshot.balCode) restore.setBalCode(snapshot.balCode);
      if (snapshot.name) restore.setName(snapshot.name);
      if (snapshot.description) restore.setDescription(snapshot.description);
      if (snapshot.icon) restore.setIcon(snapshot.icon);
    } catch {
      // Corrupted session data — ignore
    }
    // Only run on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // -------------------------------------------------------------------------
  // Clear session storage after successful save
  // Note: isNew (from params.id) stays 'new' after replaceState, so we cannot
  // rely on !isNew. Instead, clear whenever savedBaleybotId is set.
  // -------------------------------------------------------------------------

  useEffect(() => {
    if (savedBaleybotId) {
      try { sessionStorage.removeItem(`creator-session:new`); } catch { /* noop */ }
    }
  }, [savedBaleybotId]);
}
