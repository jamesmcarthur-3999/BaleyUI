'use client';

import { useEffect, useRef, useState } from 'react';
import { ChevronUp, ChevronDown, User, Bot, Brain, Loader2, Eye, Code2, Play, Copy, Check, AlertCircle, CheckCircle2, Circle, Info, ArrowRight, CircleDashed, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { CreatorMessage, CreationProgress } from '@/lib/baleybot/creator-types';
import { getBalSkillDescriptor } from '@/lib/baleybot/bal-skills';
import {
  StreamingProgressCard,
  type StreamingProgressSnapshot,
} from './StreamingProgressCard';

// Swipe threshold for gesture detection (Phase 4.7)
const SWIPE_THRESHOLD = 50;
// Minimum swipe velocity (pixels/ms)
const SWIPE_VELOCITY_THRESHOLD = 0.3;

/** Quick action types emitted by assistant messages */
export type ViewAction = 'visual' | 'code' | 'run';

interface ConversationThreadProps {
  messages: CreatorMessage[];
  className?: string;
  /** Default collapsed state */
  defaultCollapsed?: boolean;
  /** Maximum height when expanded (CSS value) */
  maxHeight?: string;
  /** Embedded mode: no border/chrome, fills parent */
  embedded?: boolean;
  /** Show thinking/building indicator */
  isBuilding?: boolean;
  /** Real-time creation progress (replaces fake phase cycling) */
  creationProgress?: CreationProgress | null;
  /** Quick action callback */
  onViewAction?: (action: ViewAction) => void;
  /** Callback when user selects an option card */
  onOptionSelect?: (optionId: string) => void;
  /** Optional stream-driven progress snapshot */
  streamingProgress?: StreamingProgressSnapshot | null;
}

/**
 * ConversationThread displays the chat history as a live activity feed.
 *
 * Features:
 * - User messages: compact right-aligned bubbles
 * - Assistant messages: full-width activity cards with left accent border
 * - Entity mini-cards with staggered animation
 * - Simple inline markdown rendering (bold, code, line breaks)
 * - Multi-phase building indicator
 * - Quick action buttons (View Visual, Edit Code, Run)
 * - Expandable thinking/reasoning
 * - Auto-scroll to bottom on new messages
 */
export function ConversationThread({
  messages,
  className,
  defaultCollapsed = false,
  maxHeight = '300px',
  embedded = false,
  isBuilding = false,
  creationProgress,
  onViewAction,
  onOptionSelect,
  streamingProgress,
}: ConversationThreadProps) {
  const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed);
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastMessageCountRef = useRef(messages.length);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (messages.length > lastMessageCountRef.current && scrollRef.current && !isCollapsed) {
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: 'smooth',
      });
    }
    lastMessageCountRef.current = messages.length;
  }, [messages.length, isCollapsed]);

  // Also scroll when building starts (to show the indicator)
  useEffect(() => {
    if (isBuilding && scrollRef.current) {
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: 'smooth',
      });
    }
  }, [isBuilding]);

  // Auto-expand when first message arrives
  useEffect(() => {
    if (messages.length > 0 && isCollapsed && lastMessageCountRef.current === 0) {
      setIsCollapsed(false);
    }
  }, [messages.length, isCollapsed]);

  // Touch gesture handling refs (Phase 4.7)
  const touchStartRef = useRef<{ y: number; time: number } | null>(null);

  // Swipe gesture handling (Phase 4.7)
  const handleSwipe = (direction: 'up' | 'down') => {
    if (direction === 'down' && !isCollapsed) {
      setIsCollapsed(true);
    } else if (direction === 'up' && isCollapsed) {
      setIsCollapsed(false);
    }
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    if (!touch) return;
    touchStartRef.current = { y: touch.clientY, time: Date.now() };
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (!touchStartRef.current) return;

    const touch = e.changedTouches[0];
    if (!touch) return;

    const deltaY = touch.clientY - touchStartRef.current.y;
    const deltaTime = Date.now() - touchStartRef.current.time;
    const velocity = Math.abs(deltaY) / deltaTime;

    // Detect swipe based on velocity and offset
    if (Math.abs(deltaY) > SWIPE_THRESHOLD || velocity > SWIPE_VELOCITY_THRESHOLD) {
      if (deltaY > 0) {
        handleSwipe('down');
      } else {
        handleSwipe('up');
      }
    }

    touchStartRef.current = null;
  };

  if (messages.length === 0 && !isBuilding) {
    return null;
  }

  // Embedded mode: simple scrollable list, no chrome
  if (embedded) {
    return (
      <div className={cn('flex-1 overflow-hidden flex flex-col', className)}>
        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto px-4 py-3 space-y-4"
        >
          {messages.map((message, index) =>
            message.role === 'user' ? (
              <UserMessage
                key={message.id}
                message={message}
                isLatest={index === messages.length - 1}
              />
            ) : (
                <AssistantMessage
                  key={message.id}
                  message={message}
                  isLatest={index === messages.length - 1}
                  onViewAction={onViewAction}
                  onOptionSelect={onOptionSelect}
                />
              )
          )}
          {isBuilding &&
            (streamingProgress ? (
              <StreamingProgressCard progress={streamingProgress} />
            ) : (
              <BuildingIndicator progress={creationProgress} />
            ))}
        </div>
      </div>
    );
  }

  // Standard mode with collapse/expand
  return (
    <div className={cn('rounded-xl border bg-background/50 touch-pan-x', className)}>
      {/* Header with collapse toggle and swipe gesture (Phase 4.7) */}
      <button
        onClick={() => setIsCollapsed(!isCollapsed)}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        className={cn(
          'w-full flex items-center justify-between px-4 py-2.5',
          'text-sm font-medium text-muted-foreground',
          'hover:bg-muted/50 transition-colors',
          'focus:outline-none focus:ring-2 focus:ring-primary/20 focus:ring-inset',
          'cursor-grab active:cursor-grabbing',
          !isCollapsed && 'border-b'
        )}
        aria-expanded={!isCollapsed}
        aria-controls="conversation-thread"
      >
        <span className="flex items-center gap-2">
          <Bot className="h-4 w-4" aria-hidden="true" />
          Conversation
          <span className="text-xs bg-muted px-1.5 py-0.5 rounded-full">
            {messages.length} {messages.length === 1 ? 'message' : 'messages'}
          </span>
        </span>
        <span className="flex items-center gap-1">
          {/* Swipe hint on mobile (Phase 4.7) */}
          <span className="text-[10px] text-muted-foreground/50 sm:hidden">
            {isCollapsed ? 'swipe up' : 'swipe down'}
          </span>
          {isCollapsed ? (
            <ChevronDown className="h-4 w-4" aria-hidden="true" />
          ) : (
            <ChevronUp className="h-4 w-4" aria-hidden="true" />
          )}
        </span>
      </button>

      {/* Messages container */}
      <div
        id="conversation-thread"
        className={cn(
          'grid transition-[grid-template-rows,opacity] duration-200 ease-in-out',
          isCollapsed ? 'grid-rows-[0fr] opacity-0' : 'grid-rows-[1fr] opacity-100'
        )}
      >
        <div className="overflow-hidden">
          <div
            ref={scrollRef}
            className="overflow-y-auto px-4 py-3 space-y-4"
            style={{ maxHeight }}
          >
            {messages.map((message, index) =>
              message.role === 'user' ? (
                <UserMessage
                  key={message.id}
                  message={message}
                  isLatest={index === messages.length - 1}
                />
              ) : (
                <AssistantMessage
                  key={message.id}
                  message={message}
                  isLatest={index === messages.length - 1}
                  onViewAction={onViewAction}
                  onOptionSelect={onOptionSelect}
                />
              )
          )}
            {isBuilding &&
              (streamingProgress ? (
                <StreamingProgressCard progress={streamingProgress} />
              ) : (
                <BuildingIndicator progress={creationProgress} />
              ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// SIMPLE MARKDOWN RENDERER
// ============================================================================

/**
 * Render simple inline markdown: **bold**, `code`, and newlines.
 * Not a full parser — just handles the common cases.
 */
function renderSimpleMarkdown(text: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  // Split by bold and code patterns
  const pattern = /(\*\*(.+?)\*\*|`([^`]+)`)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    // Add text before the match (with line breaks)
    if (match.index > lastIndex) {
      nodes.push(...renderLineBreaks(text.slice(lastIndex, match.index), `pre-${match.index}`));
    }

    if (match[2]) {
      // Bold: **text**
      nodes.push(<strong key={`b-${match.index}`}>{match[2]}</strong>);
    } else if (match[3]) {
      // Code: `text`
      nodes.push(
        <code
          key={`c-${match.index}`}
          className="bg-muted px-1 py-0.5 rounded text-xs font-mono"
        >
          {match[3]}
        </code>
      );
    }
    lastIndex = match.index + match[0].length;
  }

  // Add remaining text
  if (lastIndex < text.length) {
    nodes.push(...renderLineBreaks(text.slice(lastIndex), `end-${lastIndex}`));
  }

  return nodes;
}

/** Convert newlines in plain text segments to <br /> */
function renderLineBreaks(text: string, keyPrefix: string): React.ReactNode[] {
  const lines = text.split('\n');
  const nodes: React.ReactNode[] = [];
  lines.forEach((line, i) => {
    if (i > 0) nodes.push(<br key={`br-${keyPrefix}-${i}`} />);
    if (line) nodes.push(<span key={`ln-${keyPrefix}-${i}`}>{line}</span>);
  });
  return nodes;
}

type CreatorLifecycle = NonNullable<
  NonNullable<CreatorMessage['metadata']>['creatorLifecycle']
>;

function getLifecycleStageLabel(
  stage: CreatorLifecycle['stage']
): string {
  switch (stage) {
    case 'discovery':
      return 'Ideation';
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

// ============================================================================
// USER MESSAGE
// ============================================================================

interface UserMessageProps {
  message: CreatorMessage;
  isLatest: boolean;
}

function UserMessage({ message, isLatest }: UserMessageProps) {
  const discoveryIntake = message.metadata?.discoveryIntake;

  if (discoveryIntake) {
    return (
      <div
        className={cn(
          'flex items-start gap-2 flex-row-reverse',
          isLatest && 'animate-fade-in-up'
        )}
      >
        <div
          className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center bg-primary text-primary-foreground"
          aria-hidden="true"
        >
          <User className="h-4 w-4" />
        </div>

        <div className="max-w-[88%] rounded-xl border border-primary/20 bg-primary/5 p-3 text-sm">
          <p className="font-medium text-foreground">Discovery intake submitted</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Required outcomes: {discoveryIntake.requiredProvided}/{discoveryIntake.requiredTotal} provided
            {discoveryIntake.optionalProvided > 0
              ? `, optional provided: ${discoveryIntake.optionalProvided}.`
              : '.'}
          </p>

          {discoveryIntake.answers.length > 0 && (
            <div className="mt-2 space-y-1.5">
              {discoveryIntake.answers.map((answer) => (
                <p key={answer.id} className="text-xs text-foreground/90 flex items-center gap-1.5">
                  {answer.requiredNow ? (
                    <CheckCircle2 className="h-3.5 w-3.5 text-green-600 dark:text-green-400" />
                  ) : (
                    <Circle className="h-3.5 w-3.5 text-muted-foreground/70" />
                  )}
                  <span className="font-medium">{answer.label}:</span> {answer.valuePreview}
                </p>
              ))}
            </div>
          )}

          {discoveryIntake.additionalContext && (
            <p className="mt-2 text-xs text-muted-foreground">
              Context: {discoveryIntake.additionalContext}
            </p>
          )}

          <time
            className="text-[10px] mt-2 block text-muted-foreground/70"
            dateTime={message.timestamp.toISOString()}
          >
            {formatTime(message.timestamp)}
          </time>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'flex items-start gap-2 flex-row-reverse',
        isLatest && 'animate-fade-in-up'
      )}
    >
      {/* Avatar */}
      <div
        className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center bg-primary text-primary-foreground"
        aria-hidden="true"
      >
        <User className="h-4 w-4" />
      </div>

      {/* Message bubble */}
      <div className="max-w-[90%] rounded-2xl rounded-tr-md bg-primary px-4 py-3 text-[15px] leading-7 text-primary-foreground shadow-[0_12px_30px_-24px_hsl(var(--primary)/0.9)]">
        <p className="whitespace-pre-wrap break-words">{message.content}</p>
        <time
          className="mt-1.5 block text-[11px] text-primary-foreground/70"
          dateTime={message.timestamp.toISOString()}
        >
          {formatTime(message.timestamp)}
        </time>
      </div>
    </div>
  );
}

// ============================================================================
// ASSISTANT MESSAGE
// ============================================================================

interface AssistantMessageProps {
  message: CreatorMessage;
  isLatest: boolean;
  onViewAction?: (action: ViewAction) => void;
  onOptionSelect?: (optionId: string) => void;
}

function AssistantMessage({
  message,
  isLatest,
  onViewAction,
  onOptionSelect,
}: AssistantMessageProps) {
  const [showThinking, setShowThinking] = useState(false);
  const [didCopyMessage, setDidCopyMessage] = useState(false);
  const [didCopyCode, setDidCopyCode] = useState(false);
  const isError = message.metadata?.isError;
  const entities = message.metadata?.entities;
  const hasEntities = entities && entities.length > 0;
  const balSkills = message.metadata?.balSkills ?? [];
  const diagnosticLevel = message.metadata?.diagnostic?.level;
  const lifecycle = message.metadata?.creatorLifecycle;
  const isIdeationMessage = lifecycle?.stage === 'discovery';
  const ideationQuestion =
    lifecycle?.requiredQuestions?.[0] ?? lifecycle?.optionalQuestions?.[0];
  const hasLifecycleSummary = Boolean(
    lifecycle &&
      lifecycle.stage !== 'discovery' &&
      (lifecycle.whatIDid ||
        lifecycle.nextAction ||
        lifecycle.nextStage ||
        (lifecycle.requiredQuestions && lifecycle.requiredQuestions.length > 0))
  );

  const handleCopy = async (text: string, target: 'message' | 'code') => {
    if (!text.trim()) return;
    try {
      await navigator.clipboard.writeText(text);
      if (target === 'message') {
        setDidCopyMessage(true);
        setTimeout(() => setDidCopyMessage(false), 1200);
      } else {
        setDidCopyCode(true);
        setTimeout(() => setDidCopyCode(false), 1200);
      }
    } catch {
      // Clipboard can fail in restricted browsers; ignore silently.
    }
  };

  const diagnosticBadge = diagnosticLevel
    ? {
        level: diagnosticLevel,
        label:
          diagnosticLevel === 'success'
            ? 'Success'
            : diagnosticLevel === 'error'
              ? 'Issue'
              : diagnosticLevel === 'warning'
                ? 'Warning'
                : 'Info',
      }
    : null;

  return (
    <div className={cn(isLatest && 'animate-fade-in-up')}>
      {/* Content */}
      <div className="space-y-3">
        <div
          className={cn(
            'rounded-[1.1rem] border p-4 shadow-[0_12px_35px_-28px_rgba(0,0,0,0.8)]',
            isError
              ? 'border-red-500/35 bg-red-500/5'
              : 'border-border/60 bg-card/70'
          )}
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="inline-flex items-center gap-1 text-[12px] font-medium text-muted-foreground">
                <Bot className="h-3.5 w-3.5" />
                BaleyBot
              </span>
              {diagnosticBadge && (
                <span
                  className={cn(
                    'text-[10px] px-1.5 py-0.5 rounded-full border',
                    diagnosticBadge.level === 'success' &&
                      'border-green-500/30 bg-green-500/10 text-green-700 dark:text-green-400',
                    diagnosticBadge.level === 'warning' &&
                      'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400',
                    diagnosticBadge.level === 'error' &&
                      'border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-400',
                    diagnosticBadge.level === 'info' &&
                      'border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-400'
                  )}
                >
                  {diagnosticBadge.label}
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={() => handleCopy(message.content, 'message')}
              className="inline-flex items-center gap-1 rounded-full border border-border/50 px-2 py-0.5 text-[11px] text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors"
              aria-label="Copy assistant message"
            >
              {didCopyMessage ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
              {didCopyMessage ? 'Copied' : 'Copy'}
            </button>
          </div>

          {/* Message text with simple markdown */}
          <div className="mt-2 text-[15px] text-foreground/95 leading-7">
            {renderSimpleMarkdown(message.content)}
          </div>

          {message.metadata?.streamSummary && (
            <div className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-muted/30 px-2.5 py-1 text-[11px] text-muted-foreground">
              <Sparkles className="h-3 w-3" />
              {message.metadata.streamSummary}
            </div>
          )}

          {isIdeationMessage && ideationQuestion && (
            <div className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-primary/25 bg-primary/5 px-2.5 py-1 text-[11px] text-primary">
              <CircleDashed className="h-3 w-3" />
              Focus: {ideationQuestion.label}
            </div>
          )}

          {hasLifecycleSummary && lifecycle && (
            <details className="mt-2 rounded-lg border border-border/50 bg-background/60 px-3 py-2">
              <summary className="cursor-pointer text-xs font-medium text-muted-foreground hover:text-foreground transition-colors">
                Build details
              </summary>
              <div className="space-y-2 pt-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full border border-border/60 bg-muted/30 text-muted-foreground">
                    {getLifecycleStageLabel(lifecycle.stage)}
                  </span>
                  {typeof lifecycle.iteration === 'number' && lifecycle.iteration > 0 && (
                    <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full border border-border/60 bg-muted/30 text-muted-foreground">
                      <CircleDashed className="h-3 w-3" />
                      Iteration {lifecycle.iteration}
                    </span>
                  )}
                  {lifecycle.requiredQuestions && lifecycle.requiredQuestions.length > 0 && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full border border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300">
                      {lifecycle.requiredQuestions.length} blocking detail
                      {lifecycle.requiredQuestions.length === 1 ? '' : 's'}
                    </span>
                  )}
                  {typeof lifecycle.runnableConfidence === 'number' && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full border border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-300">
                      {Math.round(lifecycle.runnableConfidence * 100)}% runnable
                    </span>
                  )}
                  {lifecycle.assumptions && lifecycle.assumptions.length > 0 && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full border border-violet-500/30 bg-violet-500/10 text-violet-700 dark:text-violet-300">
                      {lifecycle.assumptions.length} assumption
                      {lifecycle.assumptions.length === 1 ? '' : 's'}
                    </span>
                  )}
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <div className="rounded-md border border-border/40 bg-muted/20 px-2 py-1.5">
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">What changed</p>
                    <p className="text-[11px] mt-1 text-foreground/90">
                      {lifecycle.whatIDid ?? 'Creator progressed the workflow.'}
                    </p>
                  </div>
                  <div className="rounded-md border border-border/40 bg-muted/20 px-2 py-1.5">
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Next</p>
                    <p className="text-[11px] mt-1 text-foreground/90">
                      {lifecycle.nextAction ?? lifecycle.nextStage ?? 'Continue to the next stage.'}
                    </p>
                  </div>
                </div>
              </div>
            </details>
          )}
        </div>

        {balSkills.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {balSkills.map((skillId) => {
              const descriptor = getBalSkillDescriptor(skillId);
              return (
                <span
                  key={skillId}
                  className={cn(
                    'inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium',
                    skillId === 'loop'
                      ? 'border-orange-500/30 bg-orange-500/10 text-orange-700 dark:text-orange-300'
                      : 'border-border/60 bg-muted/30 text-muted-foreground'
                  )}
                  title={descriptor.description}
                >
                  {descriptor.label}
                </span>
              );
            })}
          </div>
        )}

        {/* Entity mini-cards */}
        {hasEntities && (
          <div className="flex flex-wrap gap-2">
            {entities.map((entity, i) => (
              <div
                key={entity.id}
                className="animate-stagger-fade-in inline-flex items-center gap-2 bg-secondary/50 border border-border/50 rounded-lg px-3 py-2"
                style={{ animationDelay: `${i * 100}ms` }}
              >
                <span className="text-base" aria-hidden="true">{entity.icon}</span>
                <div className="min-w-0">
                  <p className="text-xs font-medium truncate">{entity.name}</p>
                  {entity.tools.length > 0 && (
                    <p className="text-[10px] text-muted-foreground">
                      {entity.tools.length} {entity.tools.length === 1 ? 'tool' : 'tools'}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Rich chat components */}
        {message.metadata?.options && (
          <OptionCards options={message.metadata.options} onSelect={onOptionSelect} />
        )}
        {message.metadata?.testPlan && (
          <TestPlanCard testPlan={message.metadata.testPlan} />
        )}
        {message.metadata?.connectionStatus && (
          <ConnectionStatusCard connectionStatus={message.metadata.connectionStatus} />
        )}
        {message.metadata?.diagnostic && (
          <DiagnosticCard diagnostic={message.metadata.diagnostic} />
        )}
        {message.metadata?.progress && (
          <ProgressCard progress={message.metadata.progress} />
        )}
        {message.metadata?.codeBlock && (
          <div className="rounded-lg border border-border/50 bg-muted/50 overflow-hidden">
            <div className="flex items-center justify-between gap-2 px-3 py-1 border-b border-border/30 bg-muted/30">
              <div className="text-[10px] text-muted-foreground truncate">
                {message.metadata.codeBlock.filename ?? 'Generated code'}
              </div>
              <button
                type="button"
                onClick={() => handleCopy(message.metadata?.codeBlock?.code ?? '', 'code')}
                className="inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                aria-label="Copy code block"
              >
                {didCopyCode ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                {didCopyCode ? 'Copied' : 'Copy code'}
              </button>
            </div>
            <pre className="p-3 text-xs font-mono overflow-x-auto">
              <code>{message.metadata.codeBlock.code}</code>
            </pre>
          </div>
        )}

        {/* Thinking/reasoning expandable */}
        {message.thinking && !isIdeationMessage && (
          <div>
            <button
              onClick={() => setShowThinking(!showThinking)}
              className="flex items-center gap-1.5 text-xs text-muted-foreground/70 hover:text-muted-foreground transition-colors"
            >
              <Brain className="h-3 w-3" />
              {showThinking ? 'Hide reasoning' : 'Show reasoning'}
            </button>
            {showThinking && (
              <div className="mt-1.5 pl-3 border-l-2 border-muted-foreground/20 text-xs text-muted-foreground whitespace-pre-wrap">
                {message.thinking}
              </div>
            )}
          </div>
        )}

        {/* Quick actions — only for non-error messages with entities */}
        {!isError && hasEntities && onViewAction && (
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              onClick={() => onViewAction('visual')}
              className="inline-flex items-center gap-1.5 rounded-md border border-border/60 bg-background/70 px-2.5 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-background transition-colors"
            >
              <Eye className="h-3 w-3" />
              View Visual
            </button>
            <button
              onClick={() => onViewAction('code')}
              className="inline-flex items-center gap-1.5 rounded-md border border-border/60 bg-background/70 px-2.5 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-background transition-colors"
            >
              <Code2 className="h-3 w-3" />
              Edit Code
            </button>
            <button
              onClick={() => onViewAction('run')}
              className="inline-flex items-center gap-1.5 rounded-md border border-primary/30 bg-primary/5 px-2.5 py-1.5 text-xs text-primary hover:bg-primary/10 transition-colors"
            >
              <Play className="h-3 w-3" />
              Run
            </button>
            {lifecycle?.nextAction && (
              <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                <ArrowRight className="h-3 w-3" />
                {lifecycle.nextAction}
              </span>
            )}
          </div>
        )}

        {/* Timestamp */}
        <time
          className="block text-[11px] text-muted-foreground"
          dateTime={message.timestamp.toISOString()}
        >
          {formatTime(message.timestamp)}
        </time>
      </div>
    </div>
  );
}

// ============================================================================
// BUILDING INDICATOR
// ============================================================================

const PROGRESS_PHASES: Array<{ key: CreationProgress['phase']; label: string }> = [
  { key: 'understanding', label: 'Understanding' },
  { key: 'designing', label: 'Designing' },
  { key: 'connecting', label: 'Connecting' },
  { key: 'generating', label: 'Generating code' },
  { key: 'complete', label: 'Done' },
];

const FALLBACK_PHASES = ['Analyzing', 'Designing', 'Generating code', 'Assembling'] as const;

/**
 * Multi-phase building indicator shown when AI is processing.
 * Uses real CreationProgress when available, falls back to cycling.
 */
function BuildingIndicator({ progress }: { progress?: CreationProgress | null }) {
  const [fallbackPhase, setFallbackPhase] = useState(0);

  useEffect(() => {
    if (progress) return; // Don't cycle when we have real progress
    const interval = setInterval(() => {
      setFallbackPhase(prev => (prev + 1) % FALLBACK_PHASES.length);
    }, 2500);
    return () => clearInterval(interval);
  }, [progress]);

  // Real progress mode
  if (progress) {
    const currentIndex = PROGRESS_PHASES.findIndex(p => p.key === progress.phase);
    return (
      <div className="relative pl-3 animate-fade-in">
        <div className="absolute left-0 top-0 bottom-0 w-0.5 rounded-full bg-primary/30" />
        <div className="flex items-start gap-3 py-1">
          <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
            <Loader2 className="h-4 w-4 text-primary animate-spin" />
          </div>
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">{progress.message}</p>
            <div className="flex items-center gap-1.5">
              {PROGRESS_PHASES.slice(0, -1).map((phase, i) => (
                <span
                  key={phase.key}
                  className={cn(
                    'h-1.5 rounded-full transition-all duration-300',
                    i === currentIndex
                      ? 'w-4 bg-primary animate-phase-pulse'
                      : i < currentIndex
                        ? 'w-1.5 bg-primary/40'
                        : 'w-1.5 bg-muted-foreground/20'
                  )}
                  title={phase.label}
                />
              ))}
            </div>
            {(progress.entitiesCreated ?? 0) > 0 && (
              <p className="text-[10px] text-muted-foreground">
                {progress.entitiesCreated} entit{progress.entitiesCreated === 1 ? 'y' : 'ies'}
                {(progress.connectionsCreated ?? 0) > 0 && `, ${progress.connectionsCreated} connection${progress.connectionsCreated === 1 ? '' : 's'}`}
              </p>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Fallback cycling mode
  return (
    <div className="relative pl-3 animate-fade-in">
      <div className="absolute left-0 top-0 bottom-0 w-0.5 rounded-full bg-primary/30" />
      <div className="flex items-start gap-3 py-1">
        <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
          <Loader2 className="h-4 w-4 text-primary animate-spin" />
        </div>
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">
            {FALLBACK_PHASES[fallbackPhase]}...
          </p>
          <div className="flex items-center gap-1.5">
            {FALLBACK_PHASES.map((_, i) => (
              <span
                key={i}
                className={cn(
                  'h-1.5 rounded-full transition-all duration-300',
                  i === fallbackPhase
                    ? 'w-4 bg-primary animate-phase-pulse'
                    : i < fallbackPhase
                      ? 'w-1.5 bg-primary/40'
                      : 'w-1.5 bg-muted-foreground/20'
                )}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// RICH CHAT COMPONENTS
// ============================================================================

/** Interactive option cards — user picks one */
function OptionCards({
  options,
  onSelect,
}: {
  options: NonNullable<CreatorMessage['metadata']>['options'];
  onSelect?: (id: string) => void;
}) {
  if (!options || options.length === 0) return null;
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {options.map((opt) => (
        <button
          key={opt.id}
          onClick={() => onSelect?.(opt.id)}
          className="text-left rounded-lg border border-border/50 bg-secondary/30 p-3 hover:bg-secondary/50 hover:border-primary/30 transition-all group"
        >
          <div className="flex items-start gap-2">
            {opt.icon && <span className="text-base shrink-0">{opt.icon}</span>}
            <div className="min-w-0">
              <p className="text-sm font-medium group-hover:text-primary transition-colors">{opt.label}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{opt.description}</p>
            </div>
          </div>
        </button>
      ))}
    </div>
  );
}

/** Test plan card — shows test cases with status badges */
function TestPlanCard({
  testPlan,
}: {
  testPlan: NonNullable<CreatorMessage['metadata']>['testPlan'];
}) {
  if (!testPlan) return null;
  const statusIcon = (s: string) => {
    switch (s) {
      case 'passed': return '\u2705';
      case 'failed': return '\u274C';
      case 'running': return '\u23F3';
      default: return '\u25CB';
    }
  };
  const levelColor = (l: string) => {
    switch (l) {
      case 'unit': return 'bg-blue-500/10 text-blue-600 dark:text-blue-400';
      case 'integration': return 'bg-amber-500/10 text-amber-600 dark:text-amber-400';
      case 'e2e': return 'bg-purple-500/10 text-purple-600 dark:text-purple-400';
      default: return 'bg-muted text-muted-foreground';
    }
  };
  return (
    <div className="rounded-lg border border-border/50 bg-secondary/20 p-3 space-y-2">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Test Plan</p>
      {testPlan.tests.map((test) => (
        <div key={test.id} className="flex items-center gap-2 text-sm">
          <span className="shrink-0">{statusIcon(test.status)}</span>
          <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full font-medium', levelColor(test.level))}>{test.level}</span>
          <span className="truncate">{test.name}</span>
        </div>
      ))}
      {testPlan.summary && (
        <p className="text-xs text-muted-foreground pt-1 border-t border-border/30">{testPlan.summary}</p>
      )}
    </div>
  );
}

/** Connection status card — shows which connections are needed/met */
function ConnectionStatusCard({
  connectionStatus,
}: {
  connectionStatus: NonNullable<CreatorMessage['metadata']>['connectionStatus'];
}) {
  if (!connectionStatus) return null;
  const statusColor = (s: string) => {
    switch (s) {
      case 'connected': return 'text-green-600 dark:text-green-400';
      case 'missing': return 'text-amber-600 dark:text-amber-400';
      case 'error': return 'text-red-600 dark:text-red-400';
      default: return 'text-muted-foreground';
    }
  };
  const statusDot = (s: string) => {
    switch (s) {
      case 'connected': return 'bg-green-500';
      case 'missing': return 'bg-amber-500';
      case 'error': return 'bg-red-500';
      default: return 'bg-muted';
    }
  };
  return (
    <div className="rounded-lg border border-border/50 bg-secondary/20 p-3 space-y-2">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Connections</p>
      {connectionStatus.connections.map((conn) => (
        <div key={conn.name} className="flex items-center gap-2 text-sm">
          <span className={cn('w-2 h-2 rounded-full shrink-0', statusDot(conn.status))} />
          <span className={cn('font-medium', statusColor(conn.status))}>{conn.name}</span>
          <span className="text-xs text-muted-foreground">({conn.type})</span>
          {conn.requiredBy && conn.requiredBy.length > 0 && (
            <span className="text-[10px] text-muted-foreground ml-auto">for {conn.requiredBy.join(', ')}</span>
          )}
        </div>
      ))}
    </div>
  );
}

/** Diagnostic card — info, warning, error, or success banner */
function DiagnosticCard({
  diagnostic,
}: {
  diagnostic: NonNullable<CreatorMessage['metadata']>['diagnostic'];
}) {
  if (!diagnostic) return null;
  const styles: Record<string, string> = {
    info: 'border-blue-500/30 bg-blue-500/5',
    warning: 'border-amber-500/30 bg-amber-500/5',
    error: 'border-red-500/30 bg-red-500/5',
    success: 'border-green-500/30 bg-green-500/5',
  };
  const Icon =
    diagnostic.level === 'success'
      ? CheckCircle2
      : diagnostic.level === 'warning'
        ? AlertCircle
        : diagnostic.level === 'error'
          ? AlertCircle
          : Info;

  const parsedSuggestions = (diagnostic.suggestions ?? []).map((suggestion) => {
    const match = suggestion.match(/^\[(required|later)\]\s*(.*)$/i);
    if (!match) {
      return {
        urgency: null as null | 'required' | 'later',
        text: suggestion,
      };
    }
    return {
      urgency: match[1]?.toLowerCase() === 'required' ? 'required' : 'later',
      text: match[2] || suggestion,
    };
  });

  return (
    <div className={cn('rounded-lg border p-3', styles[diagnostic.level])}>
      <div className="flex items-start gap-2">
        <Icon className="h-4 w-4 shrink-0 mt-0.5" />
        <div className="min-w-0 space-y-1">
          <p className="text-sm font-medium">{diagnostic.title}</p>
          {diagnostic.details && <p className="text-xs text-muted-foreground">{diagnostic.details}</p>}
          {parsedSuggestions.length > 0 && (
            <ul className="text-xs text-muted-foreground space-y-0.5 mt-1">
              {parsedSuggestions.map((suggestion, i) => (
                <li key={i} className="flex gap-1.5">
                  <span className="shrink-0">&rarr;</span>
                  {suggestion.urgency && (
                    <span
                      className={cn(
                        'text-[10px] px-1 py-0.5 rounded-full border capitalize',
                        suggestion.urgency === 'required'
                          ? 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400'
                          : 'border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-400'
                      )}
                    >
                      {suggestion.urgency}
                    </span>
                  )}
                  <span>{suggestion.text}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

/** Progress card — multi-step operation tracker */
function ProgressCard({
  progress,
}: {
  progress: NonNullable<CreatorMessage['metadata']>['progress'];
}) {
  if (!progress) return null;
  const pct = progress.total > 0 ? (progress.current / progress.total) * 100 : 0;
  return (
    <div className="rounded-lg border border-border/50 bg-secondary/20 p-3 space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium">{progress.label}</p>
        <span className="text-xs text-muted-foreground">{progress.current}/{progress.total}</span>
      </div>
      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
        <div
          className="h-full bg-primary rounded-full transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
      {progress.steps && (
        <div className="space-y-1">
          {progress.steps.map((step, i) => (
            <div key={i} className="flex items-center gap-2 text-xs">
              <span className="shrink-0">
                {step.status === 'complete' ? '\u2705' : step.status === 'running' ? '\u23F3' : step.status === 'error' ? '\u274C' : '\u25CB'}
              </span>
              <span className={cn(
                step.status === 'complete' && 'text-muted-foreground line-through',
                step.status === 'running' && 'font-medium',
              )}>{step.name}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Format timestamp for display
 */
function formatTime(date: Date): string {
  return date.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });
}
