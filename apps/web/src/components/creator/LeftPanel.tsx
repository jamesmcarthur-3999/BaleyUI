'use client';

import { useMemo } from 'react';
import { ConversationThread } from './ConversationThread';
import type { ViewAction } from './ConversationThread';
import { ChatInput } from './ChatInput';
import type { ChatQuickPrompt } from './ChatInput';
import { ExecutionHistory } from './ExecutionHistory';
import type { CreatorMessage, CreationStatus, CreationProgress } from '@/lib/baleybot/creator-types';
import { trpc } from '@/lib/trpc/client';
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
}

interface DiscoveryQuestionSummary {
  id: string;
  label: string;
  description: string;
  requiredNow: boolean;
}

type CreatorLifecycle = NonNullable<
  NonNullable<CreatorMessage['metadata']>['creatorLifecycle']
>;

function extractLatestDiscoveryQuestions(
  messages: CreatorMessage[]
): DiscoveryQuestionSummary[] {
  const latestLifecycleMessage = [...messages]
    .reverse()
    .find(
      (message) => message.role === 'assistant' && message.metadata?.creatorLifecycle
    );

  const lifecycle = latestLifecycleMessage?.metadata?.creatorLifecycle;
  if (!lifecycle) return [];
  if (lifecycle.stage !== 'discovery') return [];

  const questions: DiscoveryQuestionSummary[] = [];
  const seen = new Set<string>();

  const append = (
    entries:
      | Array<{
          id: string;
          label: string;
          description: string;
          requiredNow?: boolean;
        }>
      | undefined,
    requiredNowFallback: boolean
  ) => {
    if (!entries) return;
    for (const entry of entries) {
      const key = `${entry.id}::${entry.label}`.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      questions.push({
        id: entry.id,
        label: entry.label,
        description: entry.description,
        requiredNow: entry.requiredNow ?? requiredNowFallback,
      });
    }
  };

  append(lifecycle.requiredQuestions, true);
  append(lifecycle.optionalQuestions, false);

  return questions;
}

function extractRequiredDiscoveryLabels(messages: CreatorMessage[]): string[] {
  return extractLatestDiscoveryQuestions(messages)
    .filter((question) => question.requiredNow)
    .map((question) => question.label);
}

function extractLatestCreatorLifecycle(messages: CreatorMessage[]): CreatorLifecycle | null {
  const latestLifecycleMessage = [...messages]
    .reverse()
    .find(
      (message) => message.role === 'assistant' && message.metadata?.creatorLifecycle
    );
  return latestLifecycleMessage?.metadata?.creatorLifecycle ?? null;
}

function buildFallbackQuickPrompts(
  messages: CreatorMessage[],
  status: CreationStatus
): ChatQuickPrompt[] {
  const requiredLabels = extractRequiredDiscoveryLabels(messages);
  const hasDiscoveryRequirements = requiredLabels.length > 0;

  if (hasDiscoveryRequirements) {
    return [
      {
        id: 'answer-required-discovery',
        label: 'Answer Needed',
        prompt: `${requiredLabels.map((label) => `${label}: `).join('\n')}`.trim(),
        mode: 'insert',
      },
    ];
  }

  if (status === 'error') {
    return [
      {
        id: 'debug-error-fallback',
        label: 'Fix Current Error',
        prompt:
          'Diagnose the current failure, explain root cause, and apply the minimal fix needed to continue.',
        mode: 'send',
      },
    ];
  }

  if (status === 'building') {
    return [
      {
        id: 'continue-fallback',
        label: 'Continue Build',
        prompt:
          'Continue to the best next step and explain what you changed and what comes next.',
        mode: 'send',
      },
    ];
  }

  return [];
}

function buildDiscoveryQuickPrompts(
  questions: DiscoveryQuestionSummary[]
): ChatQuickPrompt[] {
  if (questions.length === 0) return [];

  const nextQuestion =
    questions.find((question) => question.requiredNow) ?? questions[0];
  const hasRequiredQuestion = questions.some((question) => question.requiredNow);

  const prompts: ChatQuickPrompt[] = [];

  if (nextQuestion) {
    prompts.push({
      id: `discovery-next-${nextQuestion.id}`,
      label: `Answer: ${nextQuestion.label}`,
      prompt: `${nextQuestion.label}: `,
      mode: 'insert',
    });
  }

  if (!hasRequiredQuestion) {
    prompts.push({
      id: 'discovery-defaults',
      label: 'Continue with defaults',
      prompt:
        'Continue with safe defaults for unresolved discovery fields and generate the first runnable design.',
      mode: 'send',
    });
  }

  return prompts;
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
  creationProgress,
  streamingProgress,
}: LeftPanelProps) {
  const latestDiscoveryQuestions = useMemo(
    () => extractLatestDiscoveryQuestions(messages),
    [messages]
  );
  const latestLifecycle = useMemo(
    () => extractLatestCreatorLifecycle(messages),
    [messages]
  );
  const hasDiscoveryQuestions = latestDiscoveryQuestions.length > 0;
  const isDiscoveryStage =
    hasDiscoveryQuestions &&
    status !== 'running' &&
    latestLifecycle?.stage === 'discovery';
  const creatorActionInput = useMemo(
    () => ({
      status,
      messages: messages.slice(-30).map((message) => {
        const metadata: Record<string, unknown> = {};
        if (message.metadata?.creatorLifecycle) {
          metadata.creatorLifecycle = message.metadata.creatorLifecycle;
        }
        if (message.metadata?.diagnostic) {
          metadata.diagnostic = message.metadata.diagnostic;
        }
        return {
          role: message.role,
          content: message.content.slice(0, 4000),
          metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
        };
      }),
    }),
    [messages, status]
  );
  const {
    data: creatorActionSuggestions,
    isError: isCreatorActionSuggestionError,
  } = trpc.baleybots.getCreatorSuggestedActions.useQuery(creatorActionInput, {
    enabled:
      status !== 'running' &&
      status !== 'building' &&
      !isDiscoveryStage &&
      !isCreatorDisabled &&
      messages.length > 0,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    retry: false,
  });
  const quickPrompts = useMemo(() => {
    if (isDiscoveryStage) {
      return buildDiscoveryQuickPrompts(latestDiscoveryQuestions);
    }

    if (creatorActionSuggestions) {
      return (creatorActionSuggestions.actions ?? []).map((action, index) => ({
        id: `bb-action-${index}-${action.label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
        label: action.label,
        prompt: action.prompt,
        mode: action.mode ?? 'send',
      })) as ChatQuickPrompt[];
    }

    if (isCreatorActionSuggestionError) {
      return buildFallbackQuickPrompts(messages, status);
    }

    return [];
  }, [
    creatorActionSuggestions,
    isCreatorActionSuggestionError,
    isDiscoveryStage,
    latestDiscoveryQuestions,
    messages,
    status,
  ]);

  const hasAdvisorSuggestions =
    (creatorActionSuggestions?.actions?.length ?? 0) > 0;
  const shouldShowFallbackSuggestionHint =
    !hasAdvisorSuggestions && isCreatorActionSuggestionError;

  const quickPromptContextLabel = useMemo(() => {
    if (isDiscoveryStage) return 'Helpful starters';
    if (hasAdvisorSuggestions) return 'Suggested next actions';
    if (shouldShowFallbackSuggestionHint) return 'Quick actions';
    return undefined;
  }, [hasAdvisorSuggestions, isDiscoveryStage, shouldShowFallbackSuggestionHint]);

  return (
    <div className="flex flex-col h-full">
      {/* Conversation thread - scrollable, takes remaining space */}
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
          discoveryPending={isDiscoveryStage}
          onSend={onSendMessage}
          disabled={isCreatorDisabled}
          quickPrompts={quickPrompts}
          quickPromptContextLabel={quickPromptContextLabel}
        />
      </div>
    </div>
  );
}
