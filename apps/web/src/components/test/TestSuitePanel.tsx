'use client';

import { useState } from 'react';
import {
  Play,
  Loader2,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  BarChart3,
  Lightbulb,
  ArrowRight,
  ArrowDown,
  Square,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { TestCase } from '@/lib/baleybot/creator-types';
import type { TestRowState, StreamPhase, FixAttemptState } from '@/lib/baleybot/testing/test-stream-types';
import { StreamingTestRow } from './StreamingTestRow';
import { BatchProgressTimeline } from './BatchProgressTimeline';
import { AutoFixActivity } from './AutoFixActivity';
import { IterationBanner } from './IterationBanner';
import { useSmartAutoScroll } from '@/hooks/useSmartAutoScroll';

// ============================================================================
// TYPES (exported for consumers)
// ============================================================================

export interface TestAnalysisPattern {
  type: string;
  description: string;
  affectedTests: string[];
  suggestedFix: string;
}

export interface TestAnalysisImprovement {
  type: 'prompt' | 'tool' | 'model' | 'structure';
  title: string;
  description: string;
  impact: 'high' | 'medium' | 'low';
}

export interface TestAnalysis {
  overallStatus: 'passed' | 'failed' | 'mixed';
  summary: string;
  passRate: number;
  patterns?: TestAnalysisPattern[];
  botImprovements?: TestAnalysisImprovement[];
  nextSteps?: string[];
}

interface TestSuitePanelProps {
  testCases: TestCase[];
  testStates: Map<string, TestRowState>;
  streamPhase: StreamPhase;
  overallProgress: { completed: number; total: number };
  activeTestId: string | null;
  analysis: TestAnalysis | null;
  fixAttempts: FixAttemptState[];
  onRunAll: () => void;
  onCancel: () => void;
  onRegenerate: () => void;
  onStopAutoFix?: () => void;
  isRegenerating?: boolean;
  className?: string;
}

// ============================================================================
// HELPERS
// ============================================================================

function overallStatusBadge(status: TestAnalysis['overallStatus']) {
  const styles: Record<TestAnalysis['overallStatus'], { label: string; className: string }> = {
    passed: { label: 'All Passed', className: 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30' },
    failed: { label: 'Failed', className: 'text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/30' },
    mixed: { label: 'Mixed', className: 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30' },
  };
  const style = styles[status];
  return (
    <span className={cn('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium animate-readiness-pop', style.className)}>
      {style.label}
    </span>
  );
}

// ============================================================================
// ANALYSIS SUMMARY (enhanced with animations)
// ============================================================================

function AnalysisSummary({ analysis }: { analysis: TestAnalysis }) {
  const [patternsExpanded, setPatternsExpanded] = useState(false);
  const [improvementsExpanded, setImprovementsExpanded] = useState(false);

  const pct = Math.round(analysis.passRate * 100);
  const circumference = 2 * Math.PI * 20;
  const offset = circumference - (analysis.passRate * circumference);
  const ringColor = analysis.passRate >= 0.8 ? 'stroke-emerald-500' : analysis.passRate >= 0.5 ? 'stroke-amber-500' : 'stroke-rose-500';

  return (
    <div className="space-y-3 border border-border/40 rounded-lg p-3 animate-fade-in-up">
      {/* Header */}
      <div className="flex items-center gap-3">
        <BarChart3 className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium">Analysis</span>
        {overallStatusBadge(analysis.overallStatus)}

        {/* Pass rate ring */}
        <div className="ml-auto flex items-center gap-2">
          <svg width="36" height="36" viewBox="0 0 48 48" className="animate-ring-draw"
            style={{ '--ring-circumference': `${circumference}`, '--ring-offset': `${offset}` } as React.CSSProperties}
          >
            <circle cx="24" cy="24" r="20" fill="none" stroke="currentColor" strokeWidth="3" className="text-muted/30" />
            <circle
              cx="24" cy="24" r="20" fill="none" strokeWidth="3"
              className={ringColor}
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={offset}
              transform="rotate(-90 24 24)"
            />
            <text x="24" y="24" textAnchor="middle" dominantBaseline="central" className="fill-foreground text-[11px] font-medium">
              {pct}%
            </text>
          </svg>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">{analysis.summary}</p>

      {/* Patterns */}
      {analysis.patterns && analysis.patterns.length > 0 && (
        <div className="animate-card-appear" style={{ animationDelay: '0.2s' }}>
          <button
            type="button"
            className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
            onClick={() => setPatternsExpanded(!patternsExpanded)}
          >
            {patternsExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            Patterns Found ({analysis.patterns.length})
          </button>
          {patternsExpanded && (
            <ul className="mt-1.5 space-y-2 text-xs text-muted-foreground pl-5">
              {analysis.patterns.map((p, i) => (
                <li key={i} className="animate-card-appear" style={{ animationDelay: `${i * 0.1}s` }}>
                  <span className="font-medium">{p.type}:</span> {p.description}
                  {p.suggestedFix && <span className="block text-[11px] mt-0.5">Fix: {p.suggestedFix}</span>}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Bot improvements */}
      {analysis.botImprovements && analysis.botImprovements.length > 0 && (
        <div className="animate-card-appear" style={{ animationDelay: '0.4s' }}>
          <button
            type="button"
            className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
            onClick={() => setImprovementsExpanded(!improvementsExpanded)}
          >
            <Lightbulb className="h-3 w-3" />
            {improvementsExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            Bot Improvements ({analysis.botImprovements.length})
          </button>
          {improvementsExpanded && (
            <ul className="mt-1.5 space-y-2 text-xs text-muted-foreground pl-5">
              {analysis.botImprovements.map((imp, i) => (
                <li key={i} className="animate-card-appear" style={{ animationDelay: `${i * 0.1}s` }}>
                  <span className="font-medium">{imp.title}</span>
                  <span className={cn(
                    'ml-1.5 inline-flex items-center rounded-md px-1 py-0.5 text-[10px] font-medium',
                    imp.impact === 'high' ? 'bg-rose-50 text-rose-600 dark:bg-rose-950/30 dark:text-rose-400' :
                    imp.impact === 'medium' ? 'bg-amber-50 text-amber-600 dark:bg-amber-950/30 dark:text-amber-400' :
                    'bg-muted/60 text-muted-foreground'
                  )}>{imp.impact}</span>
                  <span className="block text-[11px] mt-0.5">{imp.description}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Next steps */}
      {analysis.nextSteps && analysis.nextSteps.length > 0 && (
        <div className="space-y-1 animate-card-appear" style={{ animationDelay: '0.6s' }}>
          <p className="text-xs font-medium text-muted-foreground">Next Steps:</p>
          <ul className="space-y-0.5 text-xs text-muted-foreground">
            {analysis.nextSteps.map((step, i) => (
              <li key={i} className="flex items-start gap-1.5">
                <ArrowRight className="h-3 w-3 mt-0.5 shrink-0" />
                <span>{step}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function TestSuitePanel({
  testCases,
  testStates,
  streamPhase,
  overallProgress: _overallProgress,
  activeTestId,
  analysis,
  fixAttempts,
  onRunAll,
  onCancel,
  onRegenerate,
  onStopAutoFix,
  isRegenerating,
  className,
}: TestSuitePanelProps) {
  const hasTests = testCases.length > 0;
  const isStreaming = streamPhase === 'executing' || streamPhase === 'analyzing' || streamPhase === 'fixing';

  const { containerRef, userScrolledAway, jumpToActive } = useSmartAutoScroll(activeTestId);

  // Count results from stream state
  const passedCount = testCases.filter(tc => testStates.get(tc.id)?.phase === 'passed').length;

  if (!hasTests) {
    return (
      <div className={cn('space-y-3', className)}>
        <div className="text-center py-8 text-muted-foreground">
          <p className="text-sm">No test cases yet.</p>
          <p className="text-xs mt-1">Tests are generated automatically when a bot is built, or you can generate them manually.</p>
          <Button
            size="sm"
            variant="outline"
            className="mt-3"
            onClick={onRegenerate}
            disabled={isRegenerating}
          >
            {isRegenerating ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5 mr-1.5" />}
            Generate Tests
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className={cn('space-y-3 relative', className)}>
      {/* Header */}
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-medium">Test Suite</h3>
        <span className="text-xs text-muted-foreground">
          {passedCount}/{testCases.length} passed
        </span>
        <div className="ml-auto flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs"
            onClick={onRegenerate}
            disabled={isStreaming || isRegenerating}
          >
            {isRegenerating ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <RefreshCw className="h-3 w-3 mr-1" />}
            Regenerate
          </Button>
          {isStreaming ? (
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              onClick={onCancel}
            >
              <Square className="h-3 w-3 mr-1" />
              Cancel
            </Button>
          ) : (
            <Button
              size="sm"
              className="h-7 text-xs"
              onClick={onRunAll}
              disabled={isRegenerating}
            >
              <Play className="h-3 w-3 mr-1" />
              Run All
            </Button>
          )}
        </div>
      </div>

      {/* Progress timeline */}
      {isStreaming && (
        <BatchProgressTimeline
          testIds={testCases.map(tc => tc.id)}
          testStates={testStates}
          activeTestId={activeTestId}
        />
      )}

      {/* Iteration banner (during fix re-runs) */}
      <IterationBanner fixAttempts={fixAttempts} />

      {/* Test case list */}
      <div ref={containerRef} className="space-y-1.5">
        {testCases.map(tc => {
          const state = testStates.get(tc.id) ?? { phase: 'queued' as const, streamingOutput: '' };
          return (
            <div key={tc.id} data-test-id={tc.id}>
              <StreamingTestRow
                testCase={tc}
                state={state}
                isActive={tc.id === activeTestId}
              />
            </div>
          );
        })}
      </div>

      {/* Jump to active button */}
      {userScrolledAway && (
        <button
          type="button"
          className="fixed bottom-20 right-8 z-40 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary text-primary-foreground text-xs font-medium shadow-lg animate-fade-in-up hover:bg-primary/90 transition-colors"
          onClick={jumpToActive}
        >
          <ArrowDown className="h-3 w-3" />
          Jump to active test
        </button>
      )}

      {/* Auto-fix activity */}
      {fixAttempts.length > 0 && (
        <AutoFixActivity
          fixAttempts={fixAttempts}
          onStopAutoFix={onStopAutoFix}
        />
      )}

      {/* Analysis summary */}
      {analysis && !isStreaming && <AnalysisSummary analysis={analysis} />}
    </div>
  );
}
