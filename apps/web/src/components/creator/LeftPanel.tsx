'use client';

import { useMemo } from 'react';
import { ArrowRight, ListChecks } from 'lucide-react';
import { ConversationThread } from './ConversationThread';
import type { ViewAction } from './ConversationThread';
import { ChatInput } from './ChatInput';
import type { ChatQuickPrompt } from './ChatInput';
import { ExecutionHistory } from './ExecutionHistory';
import type { DiscoveryIntakeSubmission } from './DiscoveryIntakeForm';
import type { CreatorMessage, CreationStatus, CreationProgress } from '@/lib/baleybot/creator-types';
import { trpc } from '@/lib/trpc/client';
import { cn } from '@/lib/utils';

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
  onSendMessage: (message: string | DiscoveryIntakeSubmission) => void;
  isCreatorDisabled: boolean;
  executions?: Execution[];
  onExecutionClick?: (id: string) => void;
  onViewAction?: (action: ViewAction) => void;
  onOptionSelect?: (optionId: string) => void;
  creationProgress?: CreationProgress | null;
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

function getStageLabel(stage: CreatorLifecycle['stage']): string {
  switch (stage) {
    case 'discovery':
      return 'Discovery';
    case 'design':
      return 'Design';
    case 'connections':
      return 'Connections';
    case 'testing':
      return 'Testing';
    case 'launch':
      return 'Launch';
    case 'review':
      return 'Review';
    default:
      return 'Workflow';
  }
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
  const showDiscoveryForm = hasDiscoveryQuestions && status !== 'running';
  const requiredDiscoveryCount = latestDiscoveryQuestions.filter((question) => question.requiredNow).length;
  const optionalDiscoveryCount = latestDiscoveryQuestions.length - requiredDiscoveryCount;
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
      !isCreatorDisabled &&
      messages.length > 0,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    retry: false,
  });
  const quickPrompts = useMemo(() => {
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
  }, [creatorActionSuggestions, isCreatorActionSuggestionError, messages, status]);

  const hasAdvisorSuggestions =
    (creatorActionSuggestions?.actions?.length ?? 0) > 0;
  const shouldShowFallbackSuggestionHint =
    !hasAdvisorSuggestions && isCreatorActionSuggestionError;

  const quickPromptContextLabel = useMemo(() => {
    if (hasAdvisorSuggestions) return 'Context-aware next actions';
    if (shouldShowFallbackSuggestionHint) return 'Fallback actions';
    return undefined;
  }, [hasAdvisorSuggestions, shouldShowFallbackSuggestionHint]);

  return (
    <div className="flex flex-col h-full">
      {latestLifecycle && (
        <div className="shrink-0 border-b border-border/30 px-4 py-3 bg-muted/[0.16]">
          <div className="rounded-xl border border-border/60 bg-background/60 p-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-muted-foreground">Current stage</span>
              <span
                className={cn(
                  'text-[10px] px-1.5 py-0.5 rounded-full border',
                  latestLifecycle.stage === 'discovery'
                    ? 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300'
                    : 'border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-300'
                )}
              >
                {getStageLabel(latestLifecycle.stage)}
              </span>
            </div>

            {latestLifecycle.whatIDid && (
              <p className="text-xs text-foreground/90">{latestLifecycle.whatIDid}</p>
            )}

            {latestLifecycle.nextAction && (
              <div className="rounded-md border border-primary/20 bg-primary/5 px-2.5 py-2">
                <p className="text-[11px] font-medium text-foreground flex items-center gap-1.5">
                  <ArrowRight className="h-3.5 w-3.5 text-primary" />
                  Next action
                </p>
                <p className="text-[11px] text-muted-foreground mt-1">
                  {latestLifecycle.nextAction}
                </p>
              </div>
            )}

            {latestLifecycle.stage === 'discovery' && latestDiscoveryQuestions.length > 0 && (
              <p className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                <ListChecks className="h-3.5 w-3.5" />
                {requiredDiscoveryCount} needed-now detail{requiredDiscoveryCount === 1 ? '' : 's'}
                {optionalDiscoveryCount > 0 ? `, ${optionalDiscoveryCount} optional.` : '.'}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Conversation thread - scrollable, takes remaining space */}
      <ConversationThread
        messages={messages}
        embedded
        isBuilding={status === 'building'}
        creationProgress={creationProgress}
        className="flex-1 min-h-0"
        onViewAction={onViewAction}
        onOptionSelect={onOptionSelect}
        onDiscoverySubmit={onSendMessage}
        disableDiscoverySubmit={isCreatorDisabled}
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
          discoveryPending={showDiscoveryForm}
          onSend={onSendMessage}
          disabled={isCreatorDisabled}
          quickPrompts={quickPrompts}
          quickPromptContextLabel={quickPromptContextLabel}
        />
      </div>
    </div>
  );
}
