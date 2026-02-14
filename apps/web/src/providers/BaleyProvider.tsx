'use client';

import { createContext, useContext, useState, type ReactNode } from 'react';
import type { ChatMessage } from '@/components/chat';

interface WorkspaceHealth {
  status: string;
  summary?: string;
  pendingActions?: number;
  criticalActions?: number;
}

interface BaleyContextValue {
  messages: ChatMessage[];
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  clearMessages: () => void;
  health: WorkspaceHealth;
  setHealth: React.Dispatch<React.SetStateAction<WorkspaceHealth>>;
}

const BaleyContext = createContext<BaleyContextValue | null>(null);

export function BaleyProvider({ children }: { children: ReactNode }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [health, setHealth] = useState<WorkspaceHealth>({ status: 'unknown' });

  const clearMessages = () => setMessages([]);

  return (
    <BaleyContext.Provider value={{ messages, setMessages, clearMessages, health, setHealth }}>
      {children}
    </BaleyContext.Provider>
  );
}

export function useBaleyContext() {
  const ctx = useContext(BaleyContext);
  if (!ctx) throw new Error('useBaleyContext must be used within BaleyProvider');
  return ctx;
}
