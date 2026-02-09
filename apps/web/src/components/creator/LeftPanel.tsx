'use client';

import { ConversationThread } from './ConversationThread';
import type { ViewAction } from './ConversationThread';
import { ChatInput } from './ChatInput';
import type { ChatQuickPrompt } from './ChatInput';
import { ExecutionHistory } from './ExecutionHistory';
import type {
  CreatorMessage,
  CreationStatus,
  CreationProgress,
} from '@/lib/baleybot/creator-types';
import type { StreamingProgressSnapshot } from './StreamingProgressCard';

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
  creationProgress?: CreationProgress | null;
  streamingProgress?: StreamingProgressSnapshot | null;
  quickPrompts?: ChatQuickPrompt[];
  quickPromptContextLabel?: string;
  discoveryPending?: boolean;
}

/**
 * Left panel for the two-column BaleyBot detail layout.
 * It intentionally remains dumb/presentational so guidance logic is centralized
 * in the page-level orchestrator state.
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
  creationProgress,
  streamingProgress,
  quickPrompts = [],
  quickPromptContextLabel,
  discoveryPending = false,
}: LeftPanelProps) {
  return (
    <div className="flex flex-col h-full">
      <ConversationThread
        messages={messages}
        embedded
        isBuilding={status === 'building'}
        creationProgress={creationProgress}
        streamingProgress={streamingProgress}
        className="flex-1 min-h-0"
        onViewAction={onViewAction}
        onOptionSelect={onOptionSelect}
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

      <div className="shrink-0 border-t border-border/30 px-4 py-3">
        <ChatInput
          status={status}
          discoveryPending={discoveryPending}
          onSend={onSendMessage}
          disabled={isCreatorDisabled}
          quickPrompts={quickPrompts}
          quickPromptContextLabel={quickPromptContextLabel}
        />
      </div>
    </div>
  );
}
