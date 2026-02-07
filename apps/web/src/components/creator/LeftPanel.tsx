'use client';

import { ConversationThread } from './ConversationThread';
import type { ViewAction } from './ConversationThread';
import { ChatInput } from './ChatInput';
import { ExecutionHistory } from './ExecutionHistory';
import type { CreatorMessage, CreationStatus } from '@/lib/baleybot/creator-types';

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
  messages: CreatorMessage[];
  status: CreationStatus;
  onSendMessage: (message: string) => void;
  isCreatorDisabled: boolean;
  executions?: Execution[];
  onExecutionClick?: (id: string) => void;
  onViewAction?: (action: ViewAction) => void;
  onOptionSelect?: (optionId: string) => void;
}

/**
 * Left panel for the two-column BaleyBot detail layout.
 * Contains conversation thread, execution history, and chat input.
 * Testing is handled by the Test tab in the right panel.
 */
export function LeftPanel({
  messages,
  status,
  onSendMessage,
  isCreatorDisabled,
  executions,
  onExecutionClick,
  onViewAction,
  onOptionSelect,
}: LeftPanelProps) {
  return (
    <div className="flex flex-col h-full">
      {/* Conversation thread - scrollable, takes remaining space */}
      <ConversationThread
        messages={messages}
        embedded
        isBuilding={status === 'building'}
        className="flex-1 min-h-0"
        onViewAction={onViewAction}
        onOptionSelect={onOptionSelect}
      />

      {/* Execution history - collapsible */}
      {executions && executions.length > 0 && (
        <div className="shrink-0 border-t border-border/30 px-3 py-2">
          <ExecutionHistory
            executions={executions}
            defaultCollapsed
            onExecutionClick={onExecutionClick}
          />
        </div>
      )}

      {/* Chat input */}
      <div className="shrink-0 border-t border-border/30 px-4 py-3">
        <ChatInput
          status={status}
          onSend={onSendMessage}
          disabled={isCreatorDisabled}
        />
      </div>
    </div>
  );
}
