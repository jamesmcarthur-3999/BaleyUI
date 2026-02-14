'use client';

import { ChatThread, CREATOR_CONFIG, NavigationChipList } from '@/components/chat';
import type { ChatMessage, ChatAttachment } from '@/components/chat';
import type { PendingNavigation } from '@/hooks/useBaleyChat';
import { ChatInput } from './ChatInput';
import type { ChatQuickPrompt } from './ChatInput';
import { ExecutionHistory } from './ExecutionHistory';
import type { CreationStatus } from '@/lib/baleybot/creator-types';

interface Execution {
  id: string;
  status: string;
  input?: unknown;
  output?: unknown;
  error?: string | null;
  startedAt?: Date | string | null;
  completedAt?: Date | string | null;
  durationMs?: number | null;
  createdAt: Date | string;
}

interface LeftPanelProps {
  messages: ChatMessage[];
  status: CreationStatus;
  onSendMessage: (message: string, attachments?: ChatAttachment[]) => void;
  isCreatorDisabled: boolean;
  isStreaming: boolean;
  executions?: Execution[];
  onExecutionClick?: (id: string) => void;
  quickPrompts?: ChatQuickPrompt[];
  quickPromptContextLabel?: string;
  pendingNavigations?: PendingNavigation[];
  onApproveNavigation?: (id: string) => void;
  onDismissNavigation?: (id: string) => void;
}

/**
 * Left panel for the two-column BaleyBot detail layout.
 * Uses the unified ChatThread component from @/components/chat
 * for rendering messages with SDK-aligned segment rendering.
 */
export function LeftPanel({
  messages,
  status,
  onSendMessage,
  isCreatorDisabled,
  isStreaming,
  executions,
  onExecutionClick,
  quickPrompts = [],
  quickPromptContextLabel,
  pendingNavigations,
  onApproveNavigation,
  onDismissNavigation,
}: LeftPanelProps) {
  return (
    <div className="flex flex-col h-full">
      <ChatThread
        messages={messages}
        config={CREATOR_CONFIG}
        isTyping={isStreaming && messages.every(m => m.status !== 'streaming')}
        className="flex-1 min-h-0"
      />

      {executions && executions.length > 0 && (
        <div className="shrink-0 border-t border-border/30 px-3 py-2">
          <ExecutionHistory
            executions={executions}
            defaultCollapsed
            onExecutionClick={onExecutionClick}
          />
        </div>
      )}

      <div className="shrink-0 border-t border-border/30 px-4 py-3 space-y-2">
        {pendingNavigations && pendingNavigations.length > 0 && onApproveNavigation && onDismissNavigation && (
          <NavigationChipList
            navigations={pendingNavigations}
            onApprove={onApproveNavigation}
            onDismiss={onDismissNavigation}
          />
        )}
        <ChatInput
          status={status}
          onSend={onSendMessage}
          disabled={isCreatorDisabled}
          quickPrompts={quickPrompts}
          quickPromptContextLabel={quickPromptContextLabel}
        />
      </div>
    </div>
  );
}
