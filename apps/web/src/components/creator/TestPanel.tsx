// apps/web/src/components/creator/TestPanel.tsx
'use client';

import { useState, useEffect, useRef } from 'react';
import { FlaskConical, Play, Plus, ChevronDown, Loader2, CheckCircle2, XCircle, Clock, Pencil, Trash2, Check, X, RotateCcw, Sparkles, TrendingUp, AlertTriangle, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import type { FailureCategory, MatchStrategy, RunAllProgress, TestRunSummary } from '@/hooks/useTestExecution';

export type InputType = 'text' | 'structured' | 'fixture';

export interface TestFixture {
  key: string;
  value: unknown;
  ttlSeconds?: number;
  description?: string;
}

export interface StepExpectation {
  entityName: string;
  expectation: string;
}

export interface TestCase {
  id: string;
  name: string;
  level: 'unit' | 'integration' | 'e2e';
  inputType?: InputType;
  input: string | Record<string, unknown>;
  fixtures?: TestFixture[];
  expectedSteps?: StepExpectation[];
  description?: string;
  expectedOutput?: string;
  status: 'pending' | 'running' | 'passed' | 'failed';
  actualOutput?: string;
  error?: string;
  durationMs?: number;
  failureCategory?: FailureCategory;
  matchStrategy?: MatchStrategy;
}

interface TestPanelProps {
  testCases: TestCase[];
  topology?: string;
  onRunTest: (testId: string) => void;
  onRunAll: () => void;
  onAddTest: (test: Omit<TestCase, 'id' | 'status'>) => void;
  onGenerateTests: () => void;
  isGenerating: boolean;
  isRunningAll?: boolean;
  runAllProgress?: RunAllProgress | null;
  lastRunSummary?: TestRunSummary | null;
  onUpdateTest?: (testId: string, updates: Partial<TestCase>) => void;
  onDeleteTest?: (testId: string) => void;
  onAcceptActual?: (testId: string) => void;
  className?: string;
}

const LEVEL_COLORS: Record<string, string> = {
  unit: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
  integration: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  e2e: 'bg-purple-500/10 text-purple-600 dark:text-purple-400',
};

const STATUS_ICONS = {
  pending: <Clock className="h-3.5 w-3.5 text-muted-foreground" />,
  running: <Loader2 className="h-3.5 w-3.5 text-primary animate-spin" />,
  passed: <CheckCircle2 className="h-3.5 w-3.5 text-green-600 dark:text-green-400" />,
  failed: <XCircle className="h-3.5 w-3.5 text-red-600 dark:text-red-400" />,
};

const FAILURE_BADGES: Record<FailureCategory, { label: string; className: string }> = {
  connection_missing: { label: 'connection', className: 'bg-orange-500/10 text-orange-600 dark:text-orange-400' },
  execution_error: { label: 'error', className: 'bg-red-500/10 text-red-600 dark:text-red-400' },
  output_mismatch: { label: 'mismatch', className: 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400' },
  timeout: { label: 'timeout', className: 'bg-slate-500/10 text-slate-600 dark:text-slate-400' },
  rate_limited: { label: 'rate limit', className: 'bg-violet-500/10 text-violet-600 dark:text-violet-400' },
  precondition_failed: { label: 'setup', className: 'bg-orange-500/10 text-orange-600 dark:text-orange-400' },
};

const LEVEL_BORDER_COLORS: Record<string, string> = {
  unit: 'border-l-blue-500',
  integration: 'border-l-amber-500',
  e2e: 'border-l-purple-500',
};

const STRATEGY_LABELS: Record<MatchStrategy, { label: string; className: string }> = {
  exact: { label: 'exact', className: 'bg-blue-500/10 text-blue-600 dark:text-blue-400' },
  contains: { label: 'contains', className: 'bg-muted text-muted-foreground' },
  semantic: { label: 'semantic', className: 'bg-violet-500/10 text-violet-600 dark:text-violet-400' },
  schema: { label: 'schema', className: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' },
  structured: { label: 'structured', className: 'bg-teal-500/10 text-teal-600 dark:text-teal-400' },
};

function formatDuration(ms: number): string {
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.round(ms)}ms`;
}

/**
 * TestPanel displays and manages test cases for the bot.
 */
const TOPOLOGY_BADGES: Record<string, { label: string; className: string }> = {
  single: { label: 'single', className: 'bg-blue-500/10 text-blue-600 dark:text-blue-400' },
  chain: { label: 'chain', className: 'bg-amber-500/10 text-amber-600 dark:text-amber-400' },
  parallel: { label: 'parallel', className: 'bg-purple-500/10 text-purple-600 dark:text-purple-400' },
  complex: { label: 'complex', className: 'bg-rose-500/10 text-rose-600 dark:text-rose-400' },
  multiple: { label: 'multi', className: 'bg-amber-500/10 text-amber-600 dark:text-amber-400' },
};

export function TestPanel({
  testCases,
  topology,
  onRunTest,
  onRunAll,
  onAddTest,
  onGenerateTests,
  isGenerating,
  isRunningAll,
  runAllProgress,
  lastRunSummary,
  onUpdateTest,
  onDeleteTest,
  onAcceptActual,
  className,
}: TestPanelProps) {
  const [expandedTests, setExpandedTests] = useState<Set<string>>(new Set());
  const [collapsedLevels, setCollapsedLevels] = useState<Set<string>>(new Set());
  const [showAddForm, setShowAddForm] = useState(false);
  const [summaryExpanded, setSummaryExpanded] = useState(false);

  const toggleLevel = (level: string) => {
    setCollapsedLevels(prev => {
      const next = new Set(prev);
      if (next.has(level)) next.delete(level);
      else next.add(level);
      return next;
    });
  };
  const [newTestInput, setNewTestInput] = useState('');
  const [newTestName, setNewTestName] = useState('');
  const [newTestExpected, setNewTestExpected] = useState('');
  const [newTestMatchStrategy, setNewTestMatchStrategy] = useState<MatchStrategy>('contains');
  const [newTestInputMode, setNewTestInputMode] = useState<'text' | 'json'>('text');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [editingTestId, setEditingTestId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editInput, setEditInput] = useState('');
  const [editExpected, setEditExpected] = useState('');

  // Track previous statuses to auto-expand failed tests
  const prevStatusesRef = useRef<Map<string, TestCase['status']>>(new Map());

  useEffect(() => {
    const prev = prevStatusesRef.current;
    const newExpanded = new Set(expandedTests);
    let changed = false;

    for (const test of testCases) {
      const prevStatus = prev.get(test.id);
      if (prevStatus === 'running' && test.status === 'failed') {
        newExpanded.add(test.id);
        changed = true;
      }
    }

    if (changed) {
      setExpandedTests(newExpanded);
    }

    prevStatusesRef.current = new Map(testCases.map(t => [t.id, t.status]));
  }, [testCases, expandedTests]);

  const toggleExpanded = (id: string) => {
    setExpandedTests(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleAddTest = () => {
    if (!newTestName.trim() || !newTestInput.trim()) return;

    let parsedInput: string | Record<string, unknown> = newTestInput.trim();
    let inputType: InputType | undefined;

    if (newTestInputMode === 'json') {
      try {
        parsedInput = JSON.parse(newTestInput.trim()) as Record<string, unknown>;
        inputType = 'structured';
      } catch {
        // Invalid JSON — treat as text
        inputType = 'text';
      }
    }

    onAddTest({
      name: newTestName.trim(),
      level: 'unit',
      inputType,
      input: parsedInput,
      expectedOutput: newTestExpected.trim() || undefined,
      matchStrategy: newTestMatchStrategy !== 'contains' ? newTestMatchStrategy : undefined,
    });
    setNewTestName('');
    setNewTestInput('');
    setNewTestExpected('');
    setNewTestMatchStrategy('contains');
    setNewTestInputMode('text');
    setShowAdvanced(false);
    setShowAddForm(false);
  };

  const startEditing = (test: TestCase) => {
    setEditingTestId(test.id);
    setEditName(test.name);
    setEditInput(typeof test.input === 'object' ? JSON.stringify(test.input, null, 2) : test.input);
    setEditExpected(test.expectedOutput ?? '');
  };

  const saveEdit = () => {
    if (!editingTestId || !onUpdateTest) return;
    onUpdateTest(editingTestId, {
      name: editName.trim(),
      input: editInput.trim(),
      expectedOutput: editExpected.trim() || undefined,
      // Reset status since the test definition changed
      status: 'pending',
      error: undefined,
      actualOutput: undefined,
      failureCategory: undefined,
    });
    setEditingTestId(null);
  };

  const cancelEdit = () => {
    setEditingTestId(null);
  };

  // Group by level
  const byLevel = {
    unit: testCases.filter(t => t.level === 'unit'),
    integration: testCases.filter(t => t.level === 'integration'),
    e2e: testCases.filter(t => t.level === 'e2e'),
  };

  const totalPassed = testCases.filter(t => t.status === 'passed').length;
  const totalFailed = testCases.filter(t => t.status === 'failed').length;
  const totalPending = testCases.filter(t => t.status === 'pending').length;
  const isRunning = testCases.some(t => t.status === 'running');
  const passRate = testCases.length > 0 ? totalPassed / testCases.length : 0;

  // SVG ring calculations for mini pass-rate indicator
  const ringRadius = 10;
  const ringCircumference = 2 * Math.PI * ringRadius;
  const ringOffset = ringCircumference * (1 - passRate);

  return (
    <div className={cn('space-y-4', className)}>
      {/* Header with stats + mini ring */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          {testCases.length > 0 && totalPassed + totalFailed > 0 ? (
            <svg width="28" height="28" viewBox="0 0 28 28" className="shrink-0">
              <circle cx="14" cy="14" r={ringRadius} fill="none" strokeWidth="3" className="stroke-muted" />
              <circle
                cx="14" cy="14" r={ringRadius} fill="none" strokeWidth="3"
                strokeDasharray={ringCircumference}
                strokeDashoffset={ringOffset}
                strokeLinecap="round"
                className={cn(
                  'transition-all duration-700 ease-out origin-center -rotate-90',
                  passRate === 1 ? 'stroke-green-500' : passRate >= 0.5 ? 'stroke-amber-500' : 'stroke-red-500',
                )}
                style={{ transformOrigin: '14px 14px' }}
              />
              <text x="14" y="14" textAnchor="middle" dominantBaseline="central" className="fill-foreground text-[7px] font-bold">
                {Math.round(passRate * 100)}
              </text>
            </svg>
          ) : (
            <FlaskConical className="h-4 w-4 text-muted-foreground" />
          )}
          <div>
            <div className="flex items-center gap-1.5">
              <h3 className="text-sm font-medium leading-none">Test Suite</h3>
              {topology && TOPOLOGY_BADGES[topology] && (
                <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full font-medium', TOPOLOGY_BADGES[topology].className)}>
                  {TOPOLOGY_BADGES[topology].label}
                </span>
              )}
            </div>
            {testCases.length > 0 && (
              <p className="text-[11px] text-muted-foreground mt-0.5">
                <span className="text-green-600 dark:text-green-400">{totalPassed}</span>
                {' / '}
                <span>{testCases.length}</span>
                {totalFailed > 0 && (
                  <span className="text-red-600 dark:text-red-400 ml-1.5">{totalFailed} failed</span>
                )}
                {totalPending > 0 && (
                  <span className="text-muted-foreground ml-1.5">{totalPending} pending</span>
                )}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          {testCases.length > 0 && (
            <Button size="sm" variant="outline" onClick={onRunAll} disabled={isRunning || !!isRunningAll} className="h-7 text-xs">
              {(isRunning || isRunningAll) ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Zap className="h-3 w-3 mr-1" />}
              {isRunningAll && runAllProgress ? `${runAllProgress.current}/${runAllProgress.total}` : 'Run All'}
            </Button>
          )}
          <Button size="sm" onClick={onGenerateTests} disabled={isGenerating} className="h-7 text-xs">
            {isGenerating ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Sparkles className="h-3 w-3 mr-1" />}
            Generate
          </Button>
        </div>
      </div>

      {/* Run progress bar */}
      {isRunningAll && runAllProgress && (
        <div className="rounded-lg border border-border/50 bg-muted/30 p-3 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              {runAllProgress.phase === 'analyzing' ? (
                <Sparkles className="h-3.5 w-3.5 text-violet-500 animate-pulse shrink-0" />
              ) : runAllProgress.phase === 'validating' ? (
                <TrendingUp className="h-3.5 w-3.5 text-blue-500 animate-pulse shrink-0" />
              ) : (
                <Loader2 className="h-3.5 w-3.5 text-primary animate-spin shrink-0" />
              )}
              <span className="font-medium truncate">
                {runAllProgress.phase === 'analyzing'
                  ? 'AI analyzing results...'
                  : runAllProgress.phase === 'validating'
                    ? 'Validating outputs...'
                    : runAllProgress.currentTestName}
              </span>
            </div>
            <span className="text-muted-foreground shrink-0">
              {runAllProgress.current}/{runAllProgress.total}
            </span>
          </div>
          <div className="h-1.5 bg-muted rounded-full overflow-hidden">
            <div
              className={cn(
                'h-full rounded-full transition-all duration-500 ease-out',
                runAllProgress.phase === 'analyzing'
                  ? 'bg-gradient-to-r from-violet-500 to-purple-500'
                  : 'bg-gradient-to-r from-primary to-blue-500',
              )}
              style={{ width: `${(runAllProgress.current / runAllProgress.total) * 100}%` }}
            />
          </div>
          {/* Phase indicators */}
          <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
            <span className={cn('flex items-center gap-1', runAllProgress.phase === 'running' && 'text-foreground font-medium')}>
              <span className={cn('w-1.5 h-1.5 rounded-full', runAllProgress.phase === 'running' ? 'bg-primary' : 'bg-muted-foreground/30')} />
              Running
            </span>
            <span className={cn('flex items-center gap-1', runAllProgress.phase === 'validating' && 'text-foreground font-medium')}>
              <span className={cn('w-1.5 h-1.5 rounded-full', runAllProgress.phase === 'validating' ? 'bg-blue-500' : 'bg-muted-foreground/30')} />
              Validating
            </span>
            <span className={cn('flex items-center gap-1', runAllProgress.phase === 'analyzing' && 'text-foreground font-medium')}>
              <span className={cn('w-1.5 h-1.5 rounded-full', runAllProgress.phase === 'analyzing' ? 'bg-violet-500' : 'bg-muted-foreground/30')} />
              AI Analysis
            </span>
          </div>
        </div>
      )}

      {/* AI-Powered Run Summary Card */}
      {lastRunSummary && !isRunningAll && (
        <div className={cn(
          'text-xs rounded-lg border overflow-hidden',
          lastRunSummary.overallStatus === 'passed' && 'border-green-200 dark:border-green-800/50 bg-green-50/50 dark:bg-green-950/20',
          lastRunSummary.overallStatus === 'failed' && 'border-red-200 dark:border-red-800/50 bg-red-50/50 dark:bg-red-950/20',
          lastRunSummary.overallStatus === 'mixed' && 'border-amber-200 dark:border-amber-800/50 bg-amber-50/50 dark:bg-amber-950/20',
        )}>
          {/* Summary header */}
          <button
            onClick={() => setSummaryExpanded(!summaryExpanded)}
            className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-black/[0.02] dark:hover:bg-white/[0.02] transition-colors"
          >
            <div className="flex items-center gap-2">
              <Sparkles className={cn(
                'h-3.5 w-3.5 shrink-0',
                lastRunSummary.overallStatus === 'passed' && 'text-green-600 dark:text-green-400',
                lastRunSummary.overallStatus === 'failed' && 'text-red-600 dark:text-red-400',
                lastRunSummary.overallStatus === 'mixed' && 'text-amber-600 dark:text-amber-400',
              )} />
              <span className="font-medium">
                {Math.round(lastRunSummary.passRate * 100)}% pass rate
              </span>
              <span className="text-muted-foreground">&mdash;</span>
              <span className="text-muted-foreground truncate">{lastRunSummary.summary}</span>
            </div>
            <ChevronDown className={cn(
              'h-3.5 w-3.5 text-muted-foreground shrink-0 transition-transform duration-200',
              !summaryExpanded && '-rotate-90',
            )} />
          </button>

          {/* Expandable details */}
          {summaryExpanded && (
            <div className="px-3 pb-3 space-y-3 border-t border-border/30">
              {/* Patterns found */}
              {lastRunSummary.patterns && lastRunSummary.patterns.length > 0 && (
                <div className="pt-2">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-1.5">Patterns</p>
                  <div className="space-y-1.5">
                    {lastRunSummary.patterns.map((pattern, i) => (
                      <div key={i} className="flex items-start gap-2 bg-background/50 rounded-md px-2 py-1.5">
                        <AlertTriangle className="h-3 w-3 text-amber-500 shrink-0 mt-0.5" />
                        <div>
                          <p className="font-medium">{pattern.description}</p>
                          <p className="text-muted-foreground mt-0.5">{pattern.suggestedFix}</p>
                          {pattern.affectedTests.length > 0 && (
                            <p className="text-muted-foreground/70 mt-0.5">
                              Affects: {pattern.affectedTests.join(', ')}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Pipeline insights */}
              {lastRunSummary.pipelineInsights && lastRunSummary.pipelineInsights.length > 0 && (
                <div className="pt-2">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-1.5">Pipeline Insights</p>
                  <div className="space-y-1.5">
                    {lastRunSummary.pipelineInsights.map((insight, i) => (
                      <div key={i} className="flex items-start gap-2 bg-background/50 rounded-md px-2 py-1.5">
                        <Zap className="h-3 w-3 text-teal-500 shrink-0 mt-0.5" />
                        <div>
                          <span className="font-medium font-mono text-teal-600 dark:text-teal-400">{insight.entityName}</span>
                          {insight.likelyIssue && <p className="text-muted-foreground mt-0.5">{insight.likelyIssue}</p>}
                          {insight.suggestedFix && <p className="text-foreground/80 mt-0.5">{insight.suggestedFix}</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Improvement suggestions */}
              {lastRunSummary.botImprovements && lastRunSummary.botImprovements.length > 0 && (
                <div className="pt-1">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-1.5">Suggested Improvements</p>
                  <div className="space-y-1.5">
                    {lastRunSummary.botImprovements.map((imp, i) => (
                      <div key={i} className="flex items-start gap-2 bg-background/50 rounded-md px-2 py-1.5">
                        <TrendingUp className={cn(
                          'h-3 w-3 shrink-0 mt-0.5',
                          imp.impact === 'high' ? 'text-red-500' : imp.impact === 'medium' ? 'text-amber-500' : 'text-blue-500',
                        )} />
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="font-medium">{imp.title}</span>
                            <span className={cn(
                              'text-[9px] px-1 py-0 rounded-full',
                              imp.impact === 'high' && 'bg-red-500/10 text-red-600 dark:text-red-400',
                              imp.impact === 'medium' && 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
                              imp.impact === 'low' && 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
                            )}>
                              {imp.impact}
                            </span>
                            <span className={cn(
                              'text-[9px] px-1 py-0 rounded-full bg-muted text-muted-foreground',
                            )}>
                              {imp.type}
                            </span>
                          </div>
                          <p className="text-muted-foreground mt-0.5">{imp.description}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Next steps */}
              {lastRunSummary.nextSteps && lastRunSummary.nextSteps.length > 0 && (
                <div className="pt-1">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-1.5">Next Steps</p>
                  <ul className="space-y-1">
                    {lastRunSummary.nextSteps.map((step, i) => (
                      <li key={i} className="flex items-start gap-1.5">
                        <span className="text-muted-foreground/50 shrink-0">{i + 1}.</span>
                        <span>{step}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Empty state */}
      {testCases.length === 0 && !showAddForm && (
        <div className="flex flex-col items-center justify-center py-14 text-center relative">
          {/* Gradient glow behind icon */}
          <div className="absolute top-6 w-24 h-24 bg-gradient-to-br from-violet-500/10 to-blue-500/10 rounded-full blur-2xl" />
          <div className="relative mb-4 p-3 rounded-2xl bg-gradient-to-br from-violet-500/10 to-blue-500/10 border border-violet-500/10">
            <FlaskConical className="h-8 w-8 text-violet-500/60" />
          </div>
          <h3 className="text-base font-semibold mb-1">No tests yet</h3>
          <p className="text-xs text-muted-foreground max-w-[280px] mb-5 leading-relaxed">
            AI-generate tests from your bot&apos;s configuration, or write custom test cases to verify behavior.
          </p>
          <div className="flex gap-2">
            <Button size="sm" onClick={onGenerateTests} disabled={isGenerating} className="h-8">
              {isGenerating ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5 mr-1.5" />}
              Auto-generate
            </Button>
            <Button size="sm" variant="outline" onClick={() => setShowAddForm(true)} className="h-8">
              <Plus className="h-3.5 w-3.5 mr-1.5" />
              Custom Test
            </Button>
          </div>
        </div>
      )}

      {/* Test cases grouped by level with collapsible headers */}
      {(['unit', 'integration', 'e2e'] as const).map(level => {
        const tests = byLevel[level];
        if (tests.length === 0) return null;
        const levelPassed = tests.filter(t => t.status === 'passed').length;
        const levelFailed = tests.filter(t => t.status === 'failed').length;
        const isLevelCollapsed = collapsedLevels.has(level);

        return (
          <div key={level}>
            {/* Collapsible level header */}
            <button
              onClick={() => toggleLevel(level)}
              className="flex items-center gap-2 mb-2 w-full group"
            >
              <ChevronDown className={cn(
                'h-3 w-3 text-muted-foreground transition-transform duration-200',
                isLevelCollapsed && '-rotate-90',
              )} />
              <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full font-medium uppercase', LEVEL_COLORS[level])}>
                {level}
              </span>
              <span className="text-xs text-muted-foreground">
                {tests.length} test{tests.length !== 1 ? 's' : ''}
              </span>
              {/* Mini stats per level */}
              {(levelPassed > 0 || levelFailed > 0) && (
                <span className="text-[10px] text-muted-foreground ml-auto flex items-center gap-1.5">
                  {levelPassed > 0 && <span className="text-green-600 dark:text-green-400">{levelPassed} passed</span>}
                  {levelFailed > 0 && <span className="text-red-600 dark:text-red-400">{levelFailed} failed</span>}
                </span>
              )}
            </button>

            {!isLevelCollapsed && (
              <div className="space-y-1.5 ml-1">
                {tests.map(test => (
                  <div
                    key={test.id}
                    className={cn(
                      'rounded-lg border border-border/50 overflow-hidden border-l-2 transition-colors',
                      LEVEL_BORDER_COLORS[level],
                      test.status === 'running' && 'ring-1 ring-primary/20',
                    )}
                  >
                    {/* Test row header */}
                    <div className="flex items-center">
                      <div
                        role="button"
                        tabIndex={0}
                        onClick={() => toggleExpanded(test.id)}
                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleExpanded(test.id); } }}
                        className="flex-1 flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted/30 transition-colors cursor-pointer min-w-0"
                        aria-expanded={expandedTests.has(test.id)}
                        aria-label={`${expandedTests.has(test.id) ? 'Collapse' : 'Expand'} test: ${test.name}`}
                      >
                        <ChevronDown className={cn(
                          'h-3 w-3 text-muted-foreground shrink-0 transition-transform duration-200',
                          !expandedTests.has(test.id) && '-rotate-90',
                        )} />
                        {STATUS_ICONS[test.status]}
                        <span className={cn(
                          'truncate text-left flex-1',
                          test.status === 'passed' && 'text-foreground',
                          test.status === 'failed' && 'text-foreground',
                          test.status === 'pending' && 'text-muted-foreground',
                        )}>{test.name}</span>

                        {/* Failure category badge */}
                        {test.failureCategory && test.status === 'failed' && (
                          <span className={cn(
                            'text-[10px] px-1.5 py-0.5 rounded-full font-medium shrink-0',
                            FAILURE_BADGES[test.failureCategory].className,
                          )}>
                            {FAILURE_BADGES[test.failureCategory].label}
                          </span>
                        )}

                        {/* Match strategy badge - always shown */}
                        {test.matchStrategy && (
                          <span className={cn(
                            'text-[10px] px-1.5 py-0.5 rounded-full font-medium shrink-0',
                            STRATEGY_LABELS[test.matchStrategy].className,
                          )}>
                            {STRATEGY_LABELS[test.matchStrategy].label}
                          </span>
                        )}

                        {/* Formatted duration */}
                        {test.durationMs !== undefined && (
                          <span className={cn(
                            'text-[10px] shrink-0 tabular-nums',
                            test.durationMs > 10000 ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground',
                          )}>
                            {formatDuration(test.durationMs)}
                          </span>
                        )}
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 w-6 p-0 shrink-0 mr-2"
                        onClick={() => onRunTest(test.id)}
                        disabled={test.status === 'running'}
                        aria-label={`Run test: ${test.name}`}
                      >
                        <Play className="h-3 w-3" />
                      </Button>
                    </div>

                    {/* Expanded test details */}
                    {expandedTests.has(test.id) && (
                      <div className="px-3 pb-3 pt-1 border-t border-border/30 space-y-2 text-xs">
                        {/* Inline edit mode */}
                        {editingTestId === test.id ? (
                          <div className="space-y-2">
                            <div>
                              <p className="text-muted-foreground font-medium mb-0.5">Name:</p>
                              <input
                                type="text"
                                value={editName}
                                onChange={(e) => setEditName(e.target.value)}
                                className="w-full text-sm bg-muted/50 border border-border/50 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-primary/20"
                              />
                            </div>
                            <div>
                              <p className="text-muted-foreground font-medium mb-0.5">Input:</p>
                              <textarea
                                value={editInput}
                                onChange={(e) => setEditInput(e.target.value)}
                                rows={3}
                                className="w-full text-sm bg-muted/50 border border-border/50 rounded px-2 py-1 resize-none focus:outline-none focus:ring-2 focus:ring-primary/20 font-mono"
                              />
                            </div>
                            <div>
                              <p className="text-muted-foreground font-medium mb-0.5">Expected Output:</p>
                              <textarea
                                value={editExpected}
                                onChange={(e) => setEditExpected(e.target.value)}
                                rows={3}
                                className="w-full text-sm bg-muted/50 border border-border/50 rounded px-2 py-1 resize-none focus:outline-none focus:ring-2 focus:ring-primary/20 font-mono"
                              />
                            </div>
                            <div className="flex gap-2 justify-end">
                              <Button size="sm" variant="ghost" onClick={cancelEdit} className="h-7 text-xs">
                                <X className="h-3 w-3 mr-1" />
                                Cancel
                              </Button>
                              <Button size="sm" onClick={saveEdit} disabled={!editName.trim() || !editInput.trim()} className="h-7 text-xs">
                                <Check className="h-3 w-3 mr-1" />
                                Save
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <>
                            {/* Input */}
                            <div>
                              <div className="flex items-center gap-1.5 mb-0.5">
                                <p className="text-muted-foreground font-medium">Input:</p>
                                {test.inputType && test.inputType !== 'text' && (
                                  <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-teal-500/10 text-teal-600 dark:text-teal-400">
                                    {test.inputType}
                                  </span>
                                )}
                              </div>
                              <pre className="bg-muted/50 rounded p-2 font-mono whitespace-pre-wrap text-[11px] leading-relaxed">
                                {typeof test.input === 'object' ? JSON.stringify(test.input, null, 2) : test.input}
                              </pre>
                            </div>

                            {/* Description */}
                            {test.description && (
                              <p className="text-[11px] text-muted-foreground italic">{test.description}</p>
                            )}

                            {/* Step expectations for chain/pipeline tests */}
                            {test.expectedSteps && test.expectedSteps.length > 0 && (
                              <div>
                                <p className="text-muted-foreground font-medium mb-1">Pipeline Steps:</p>
                                <div className="flex items-center gap-1 flex-wrap text-[11px]">
                                  {test.expectedSteps.map((step, i) => (
                                    <span key={i} className="flex items-center gap-1">
                                      {i > 0 && <span className="text-muted-foreground/50">&rarr;</span>}
                                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-muted/50 border border-border/30">
                                        <span className="font-medium text-foreground">{step.entityName}</span>
                                        <span className="text-muted-foreground">{step.expectation}</span>
                                      </span>
                                    </span>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Fixtures */}
                            {test.fixtures && test.fixtures.length > 0 && (
                              <div>
                                <p className="text-muted-foreground font-medium mb-0.5">Fixtures ({test.fixtures.length}):</p>
                                <div className="space-y-0.5 text-[11px]">
                                  {test.fixtures.map((fixture, i) => (
                                    <div key={i} className="flex items-center gap-2 px-2 py-1 bg-muted/30 rounded">
                                      <span className="font-mono text-teal-600 dark:text-teal-400">{fixture.key}</span>
                                      {fixture.description && <span className="text-muted-foreground">&mdash; {fixture.description}</span>}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Diff view for expected vs actual when both exist and test failed */}
                            {test.expectedOutput && test.actualOutput && test.status === 'failed' && test.failureCategory === 'output_mismatch' ? (
                              <div className="space-y-0">
                                <p className="text-muted-foreground font-medium mb-0.5">Output Comparison:</p>
                                <div className="grid grid-cols-2 gap-0 rounded-lg overflow-hidden border border-border/30">
                                  <div className="border-r border-border/30">
                                    <div className="px-2 py-1 bg-red-500/5 border-b border-border/30 text-[10px] font-medium text-red-600 dark:text-red-400">
                                      Expected
                                    </div>
                                    <pre className="p-2 font-mono whitespace-pre-wrap text-[11px] leading-relaxed bg-red-500/[0.02]">{test.expectedOutput}</pre>
                                  </div>
                                  <div>
                                    <div className="px-2 py-1 bg-green-500/5 border-b border-border/30 text-[10px] font-medium text-green-600 dark:text-green-400">
                                      Actual
                                    </div>
                                    <pre className="p-2 font-mono whitespace-pre-wrap text-[11px] leading-relaxed bg-green-500/[0.02]">{test.actualOutput}</pre>
                                  </div>
                                </div>
                              </div>
                            ) : (
                              <>
                                {/* Standard expected/actual display */}
                                {test.expectedOutput && (
                                  <div>
                                    <p className="text-muted-foreground font-medium mb-0.5">Expected:</p>
                                    <pre className="bg-muted/50 rounded p-2 font-mono whitespace-pre-wrap text-[11px] leading-relaxed">{test.expectedOutput}</pre>
                                  </div>
                                )}
                                {test.actualOutput && (
                                  <div>
                                    <p className="text-muted-foreground font-medium mb-0.5">Actual:</p>
                                    <pre className={cn(
                                      'rounded p-2 font-mono whitespace-pre-wrap text-[11px] leading-relaxed',
                                      test.status === 'passed' ? 'bg-green-500/5 border border-green-500/10' : 'bg-red-500/5 border border-red-500/10'
                                    )}>{test.actualOutput}</pre>
                                  </div>
                                )}
                              </>
                            )}

                            {/* Error display */}
                            {test.error && (
                              <div>
                                <p className="text-red-600 dark:text-red-400 font-medium mb-0.5">Error:</p>
                                <pre className="bg-red-500/5 border border-red-500/10 rounded p-2 font-mono whitespace-pre-wrap text-[11px] leading-relaxed text-red-700 dark:text-red-300">{test.error}</pre>
                              </div>
                            )}

                            {/* Action buttons for failed tests */}
                            {test.status === 'failed' && (
                              <div className="flex flex-wrap gap-1.5 pt-1.5 border-t border-border/20">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-7 text-xs"
                                  onClick={() => onRunTest(test.id)}
                                >
                                  <RotateCcw className="h-3 w-3 mr-1" />
                                  Retry
                                </Button>
                                {test.failureCategory === 'output_mismatch' && test.actualOutput && onAcceptActual && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-7 text-xs text-green-600 dark:text-green-400 border-green-200 dark:border-green-800 hover:bg-green-50 dark:hover:bg-green-950"
                                    onClick={() => onAcceptActual(test.id)}
                                  >
                                    <CheckCircle2 className="h-3 w-3 mr-1" />
                                    Accept Actual
                                  </Button>
                                )}
                                {onUpdateTest && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-7 text-xs"
                                    onClick={() => startEditing(test)}
                                  >
                                    <Pencil className="h-3 w-3 mr-1" />
                                    Edit
                                  </Button>
                                )}
                                {onDeleteTest && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-7 text-xs text-red-600 dark:text-red-400 border-red-200 dark:border-red-800 hover:bg-red-50 dark:hover:bg-red-950"
                                    onClick={() => onDeleteTest(test.id)}
                                  >
                                    <Trash2 className="h-3 w-3 mr-1" />
                                    Remove
                                  </Button>
                                )}
                              </div>
                            )}

                            {/* Quick actions for passed tests */}
                            {test.status === 'passed' && (
                              <div className="flex flex-wrap gap-1.5 pt-1.5 border-t border-border/20">
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-6 text-[11px] text-muted-foreground"
                                  onClick={() => onRunTest(test.id)}
                                >
                                  <RotateCcw className="h-2.5 w-2.5 mr-1" />
                                  Re-run
                                </Button>
                                {onUpdateTest && (
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-6 text-[11px] text-muted-foreground"
                                    onClick={() => startEditing(test)}
                                  >
                                    <Pencil className="h-2.5 w-2.5 mr-1" />
                                    Edit
                                  </Button>
                                )}
                                {onDeleteTest && (
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-6 text-[11px] text-muted-foreground"
                                    onClick={() => onDeleteTest(test.id)}
                                  >
                                    <Trash2 className="h-2.5 w-2.5 mr-1" />
                                    Remove
                                  </Button>
                                )}
                              </div>
                            )}

                            {/* Quick actions for pending tests */}
                            {test.status === 'pending' && (
                              <div className="flex flex-wrap gap-1.5 pt-1.5 border-t border-border/20">
                                {onUpdateTest && (
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-6 text-[11px] text-muted-foreground"
                                    onClick={() => startEditing(test)}
                                  >
                                    <Pencil className="h-2.5 w-2.5 mr-1" />
                                    Edit
                                  </Button>
                                )}
                                {onDeleteTest && (
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-6 text-[11px] text-muted-foreground"
                                    onClick={() => onDeleteTest(test.id)}
                                  >
                                    <Trash2 className="h-2.5 w-2.5 mr-1" />
                                    Remove
                                  </Button>
                                )}
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}

      {/* Add custom test form */}
      {showAddForm && (
        <div className="rounded-lg border border-border/50 p-3 space-y-3">
          <p className="text-sm font-medium">Add Custom Test</p>
          <input
            type="text"
            placeholder="Test name..."
            value={newTestName}
            onChange={(e) => setNewTestName(e.target.value)}
            aria-label="Test name"
            className="w-full text-sm bg-muted/50 border border-border/50 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/20"
          />

          {/* Input mode toggle */}
          <div>
            <div className="flex items-center gap-2 mb-1">
              <label className="text-xs text-muted-foreground">Input</label>
              <div className="flex rounded-md border border-border/50 overflow-hidden text-[11px]">
                <button
                  type="button"
                  onClick={() => setNewTestInputMode('text')}
                  className={cn(
                    'px-2 py-0.5 transition-colors',
                    newTestInputMode === 'text' ? 'bg-primary text-primary-foreground' : 'bg-muted/50 text-muted-foreground hover:text-foreground',
                  )}
                >
                  Text
                </button>
                <button
                  type="button"
                  onClick={() => setNewTestInputMode('json')}
                  className={cn(
                    'px-2 py-0.5 transition-colors border-l border-border/50',
                    newTestInputMode === 'json' ? 'bg-primary text-primary-foreground' : 'bg-muted/50 text-muted-foreground hover:text-foreground',
                  )}
                >
                  JSON
                </button>
              </div>
            </div>
            <textarea
              placeholder={newTestInputMode === 'json' ? '{ "key": "value" }' : 'Test input...'}
              value={newTestInput}
              onChange={(e) => setNewTestInput(e.target.value)}
              rows={newTestInputMode === 'json' ? 4 : 2}
              aria-label="Test input"
              className={cn(
                'w-full text-sm bg-muted/50 border border-border/50 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-primary/20',
                newTestInputMode === 'json' && 'font-mono text-[12px]',
              )}
            />
            {newTestInputMode === 'json' && newTestInput.trim() && (() => {
              try { JSON.parse(newTestInput); return null; } catch {
                return <p className="text-[10px] text-red-500 mt-0.5">Invalid JSON</p>;
              }
            })()}
          </div>

          <textarea
            placeholder="Expected output (optional)..."
            value={newTestExpected}
            onChange={(e) => setNewTestExpected(e.target.value)}
            rows={2}
            aria-label="Expected output"
            className="w-full text-sm bg-muted/50 border border-border/50 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-primary/20"
          />

          {/* Advanced options toggle */}
          <button
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            {showAdvanced ? '- Hide' : '+ Show'} advanced options
          </button>

          {showAdvanced && (
            <div className="space-y-2">
              <div>
                <label htmlFor="match-strategy" className="text-xs text-muted-foreground block mb-1">
                  Match Strategy
                </label>
                <select
                  id="match-strategy"
                  value={newTestMatchStrategy}
                  onChange={(e) => setNewTestMatchStrategy(e.target.value as MatchStrategy)}
                  className="w-full text-sm bg-muted/50 border border-border/50 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/20"
                >
                  <option value="contains">Contains (default) - Substring + keyword match</option>
                  <option value="exact">Exact - JSON or string equality</option>
                  <option value="semantic">Semantic - Lenient concept matching</option>
                  <option value="schema">Schema - Validate output keys + types</option>
                  <option value="structured">Structured - Deep JSON comparison</option>
                </select>
              </div>
            </div>
          )}

          <div className="flex gap-2 justify-end">
            <Button size="sm" variant="outline" onClick={() => setShowAddForm(false)}>Cancel</Button>
            <Button size="sm" onClick={handleAddTest} disabled={!newTestName.trim() || !newTestInput.trim()}>Add</Button>
          </div>
        </div>
      )}

      {/* Add test button (when tests exist) */}
      {testCases.length > 0 && !showAddForm && (
        <Button variant="outline" size="sm" onClick={() => setShowAddForm(true)} className="w-full">
          <Plus className="h-3.5 w-3.5 mr-1" />
          Add Custom Test
        </Button>
      )}
    </div>
  );
}
