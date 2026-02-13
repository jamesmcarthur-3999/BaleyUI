'use client';

import { useState, useRef, useEffect } from 'react';
import {
  Loader2,
  CheckCircle2,
  XCircle,
  Circle,
  ChevronDown,
  ChevronUp,
  Sparkles,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { TestRowState } from '@/lib/baleybot/testing/test-stream-types';
import type { TestCase } from '@/lib/baleybot/creator-types';

// ============================================================================
// HELPERS
// ============================================================================

function levelBadge(level: TestCase['level']) {
  const styles: Record<TestCase['level'], string> = {
    unit: 'bg-blue-50 text-blue-600 dark:bg-blue-950/30 dark:text-blue-400',
    integration: 'bg-purple-50 text-purple-600 dark:bg-purple-950/30 dark:text-purple-400',
    e2e: 'bg-amber-50 text-amber-600 dark:bg-amber-950/30 dark:text-amber-400',
  };
  return (
    <span className={cn('inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-medium', styles[level])}>
      {level}
    </span>
  );
}

function phaseIcon(phase: TestRowState['phase']) {
  switch (phase) {
    case 'queued':
      return <Circle className="h-4 w-4 text-muted-foreground/50" />;
    case 'executing':
      return <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />;
    case 'validating':
      return <Sparkles className="h-4 w-4 text-purple-500 animate-pulse-validation" />;
    case 'passed':
      return <CheckCircle2 className="h-4 w-4 text-emerald-500 animate-readiness-pop" />;
    case 'failed':
      return <XCircle className="h-4 w-4 text-rose-500 animate-readiness-pop" />;
  }
}

function confidenceBar(confidence: number) {
  const pct = Math.round(confidence * 100);
  const color = pct >= 80 ? 'bg-emerald-500' : pct >= 50 ? 'bg-amber-500' : 'bg-rose-500';
  return (
    <div className="flex items-center gap-1.5">
      <div className="h-1.5 w-16 rounded-full bg-muted/60 overflow-hidden">
        <div
          className={cn('h-full rounded-full animate-meter-fill', color)}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-[10px] text-muted-foreground">{pct}%</span>
    </div>
  );
}

// ============================================================================
// COMPONENT
// ============================================================================

interface StreamingTestRowProps {
  testCase: TestCase;
  state: TestRowState;
  isActive: boolean;
}

export function StreamingTestRow({ testCase, state, isActive }: StreamingTestRowProps) {
  const [manualExpanded, setManualExpanded] = useState<boolean | null>(null);
  const outputRef = useRef<HTMLPreElement>(null);

  // Auto-expand on failure, auto-collapse when no longer active
  const autoExpanded = state.phase === 'failed';
  const expanded = manualExpanded ?? autoExpanded;

  // Stream output to DOM directly via ref (avoids React re-renders per token)
  useEffect(() => {
    if (outputRef.current && state.phase === 'executing') {
      outputRef.current.textContent = state.streamingOutput;
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [state.streamingOutput, state.phase]);

  const borderClass =
    state.phase === 'executing' ? 'border-l-2 border-l-blue-500'
    : state.phase === 'validating' ? 'border-l-2 border-l-purple-500'
    : state.phase === 'passed' ? 'border-l-2 border-l-emerald-500'
    : state.phase === 'failed' ? 'border-l-2 border-l-rose-500'
    : '';

  const bgClass =
    state.phase === 'executing' ? 'bg-blue-50/30 dark:bg-blue-950/10'
    : state.phase === 'validating' ? 'bg-purple-50/20 dark:bg-purple-950/10'
    : state.phase === 'passed' ? 'bg-emerald-50/10 dark:bg-emerald-950/5'
    : state.phase === 'failed' ? 'bg-rose-50/15 dark:bg-rose-950/10'
    : '';

  return (
    <div
      className={cn(
        'border border-border/40 rounded-lg overflow-hidden transition-all duration-300',
        borderClass,
        bgClass,
        isActive && state.phase === 'executing' && 'animate-pulse-soft',
        state.phase === 'queued' && 'opacity-60',
      )}
    >
      {/* Row header */}
      <button
        type="button"
        className="w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-muted/30 transition-colors"
        onClick={() => setManualExpanded(expanded ? false : true)}
      >
        {phaseIcon(state.phase)}
        <span className="flex-1 text-sm font-medium truncate">{testCase.name}</span>
        {levelBadge(testCase.level)}
        {state.durationMs != null && (
          <span className="text-[10px] text-muted-foreground">{state.durationMs}ms</span>
        )}
        {state.validationResult && confidenceBar(state.validationResult.confidence)}
        {expanded ? (
          <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        )}
      </button>

      {/* Inline streaming preview during execution */}
      {state.phase === 'executing' && !expanded && state.streamingOutput && (
        <div className="px-3 pb-2 relative">
          <pre
            ref={outputRef}
            className="text-[11px] font-mono text-muted-foreground max-h-[120px] overflow-hidden whitespace-pre-wrap"
          >
            {state.streamingOutput}
          </pre>
          <div className="absolute bottom-2 left-3 right-3 h-8 bg-gradient-to-t from-background/80 to-transparent pointer-events-none" />
        </div>
      )}

      {/* Expanded details */}
      {expanded && (
        <div className="border-t border-border/30 px-3 py-2.5 space-y-2 text-xs bg-muted/10 animate-fade-in">
          {testCase.description && (
            <p className="text-muted-foreground">{testCase.description}</p>
          )}

          <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
            <span className="font-medium text-muted-foreground">Input:</span>
            <span className="font-mono text-[11px] break-all">
              {typeof testCase.input === 'object' ? JSON.stringify(testCase.input) : testCase.input}
            </span>

            {testCase.expectedOutput && (
              <>
                <span className="font-medium text-muted-foreground">Expected:</span>
                <span className="font-mono text-[11px] break-all">{testCase.expectedOutput}</span>
              </>
            )}

            {state.streamingOutput && (
              <>
                <span className="font-medium text-muted-foreground">Actual:</span>
                <pre className="font-mono text-[11px] break-all line-clamp-6 whitespace-pre-wrap">
                  {state.streamingOutput}
                </pre>
              </>
            )}

            {state.error && (
              <>
                <span className="font-medium text-rose-500">Error:</span>
                <span className="text-rose-500">{state.error}</span>
              </>
            )}
          </div>

          {/* AI reasoning */}
          {state.validationResult && (
            <div className="mt-1.5 p-2 rounded-md bg-muted/30">
              <p className="font-medium text-muted-foreground mb-0.5">AI Reasoning:</p>
              <p>{state.validationResult.reasoning}</p>
            </div>
          )}

          {/* Suggestions */}
          {state.validationResult?.suggestions && state.validationResult.suggestions.length > 0 && (
            <div className="mt-1 space-y-0.5">
              <p className="font-medium text-muted-foreground">Suggestions:</p>
              <ul className="list-disc list-inside space-y-0.5 text-muted-foreground">
                {state.validationResult.suggestions.map((suggestion, i) => (
                  <li key={i}>{suggestion}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
