'use client';

import { ConversationThread } from './ConversationThread';
import type { StreamingProgress } from './ConversationThread';
import { ChatInput } from './ChatInput';
import type { ChatQuickPrompt } from './ChatInput';
import { ExecutionHistory } from './ExecutionHistory';
import type {
  CreatorMessage,
  CreationStatus,
} from '@/lib/baleybot/creator-types';

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

interface AgentActivityEvent {
  event: Record<string, unknown>;
  entityName?: string;
  timestamp: number;
}

interface LeftPanelProps {
  messages: CreatorMessage[];
  status: CreationStatus;
  onSendMessage: (message: string) => void;
  isCreatorDisabled: boolean;
  executions?: Execution[];
  onExecutionClick?: (id: string) => void;
  onOptionSelect?: (optionId: string) => void;
  /** Streaming progress info for the building indicator */
  streamingProgress?: StreamingProgress | null;
  quickPrompts?: ChatQuickPrompt[];
  quickPromptContextLabel?: string;
  /** Agent activity events for the expandable activity panel */
  agentEvents?: AgentActivityEvent[];
  /** Real-time streaming text from creator_bot conversation */
  streamingText?: string;
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
  onOptionSelect,
  streamingProgress,
  quickPrompts = [],
  quickPromptContextLabel,
  agentEvents,
  streamingText,
}: LeftPanelProps) {
  return (
    <div className="flex flex-col h-full">
      <ConversationThread
        messages={messages}
        embedded
        isBuilding={status === 'building'}
        streamingProgress={streamingProgress}
        className="flex-1 min-h-0"
        onOptionSelect={onOptionSelect}
        agentEvents={agentEvents}
        streamingText={streamingText}
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
          onSend={onSendMessage}
          disabled={isCreatorDisabled}
          quickPrompts={quickPrompts}
          quickPromptContextLabel={quickPromptContextLabel}
        />
      </div>
    </div>
  );
}
