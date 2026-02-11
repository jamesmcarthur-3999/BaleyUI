// apps/web/src/components/creator/TestPanel.tsx
'use client';

import { useState, useEffect, useRef } from 'react';
import { Play, Plus, Loader2, CheckCircle2, XCircle, Clock, Pencil, Trash2, Check, X, RotateCcw, Sparkles, TrendingUp, AlertTriangle } from 'lucide-react';
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
  onRunAllWithSelfHealing?: () => void;
  onAddTest: (test: Omit<TestCase, 'id' | 'status'>) => void;
  onGenerateTests: () => void;
  isGenerating: boolean;
  isRunningAll?: boolean;
  isSelfHealing?: boolean;
  runAllProgress?: RunAllProgress | null;
  lastRunSummary?: TestRunSummary | null;
  onUpdateTest?: (testId: string, updates: Partial<TestCase>) => void;
  onDeleteTest?: (testId: string) => void;
  onAcceptActual?: (testId: string) => void;
  className?: string;
}

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

/** Sort tests: failed → running → pending → passed */
function sortByStatus(tests: TestCase[]): TestCase[] {
  const order: Record<TestCase['status'], number> = { failed: 0, running: 1, pending: 2, passed: 3 };
  return [...tests].sort((a, b) => order[a.status] - order[b.status]);
}

/**
 * TestPanel displays and manages test cases for the bot.
 */
export function TestPanel({
  testCases,
  onRunTest,
  onRunAll,
  onRunAllWithSelfHealing,
  onAddTest,
  onGenerateTests,
  isGenerating,
  isRunningAll,
  isSelfHealing,
  runAllProgress,
  lastRunSummary,
  onUpdateTest,
  onDeleteTest,
  onAcceptActual,
  className,
}: TestPanelProps) {
  const [expandedTests, setExpandedTests] = useState<Set<string>>(new Set());
  const [showAddForm, setShowAddForm] = useState(false);

  const [newTestInput, setNewTestInput] = useState('');
  const [newTestName, setNewTestName] = useState('');
  const [newTestExpected, setNewTestExpected] = useState('');
  const [newTestMatchStrategy, setNewTestMatchStrategy] = useState<MatchStrategy>('contains');
  const [newTestInputMode, setNewTestInputMode] = useState<'text' | 'json'>('text');
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

  const totalPassed = testCases.filter(t => t.status === 'passed').length;
  const totalFailed = testCases.filter(t => t.status === 'failed').length;
  const isRunning = testCases.some(t => t.status === 'running');

  const passRate = testCases.length > 0 ? totalPassed / testCases.length : 0;
  const passPercentage = Math.round(passRate * 100);
  const hasResults = totalPassed + totalFailed > 0;

  const sortedTests = sortByStatus(testCases);

  return (
    <div className={cn('space-y-4', className)}>
      {/* Results-first header */}
      {testCases.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-baseline justify-between">
            <p className="text-lg font-semibold tracking-tight">
              {hasResults ? (
                <>
                  <span className={cn(
                    passRate === 1 ? 'text-green-600 dark:text-green-400' : passRate >= 0.5 ? 'text-foreground' : 'text-red-600 dark:text-red-400',
                  )}>
                    {totalPassed}/{testCases.length}
                  </span>
                  {' '}
                  <span className="text-foreground">Passing</span>
                </>
              ) : (
                <span className="text-muted-foreground">{testCases.length} test{testCases.length !== 1 ? 's' : ''}</span>
              )}
            </p>
            {hasResults && (
              <span className={cn(
                'text-2xl font-bold tabular-nums',
                passRate === 1 ? 'text-green-600 dark:text-green-400' : passRate >= 0.5 ? 'text-amber-600 dark:text-amber-400' : 'text-red-600 dark:text-red-400',
              )}>
                {passPercentage}%
              </span>
            )}
          </div>

          {/* Thin progress bar */}
          {hasResults && (
            <div className="h-1 bg-muted rounded-full overflow-hidden">
              <div
                className={cn(
                  'h-full rounded-full transition-all duration-500 ease-out',
                  passRate === 1 ? 'bg-green-500' : passRate >= 0.5 ? 'bg-amber-500' : 'bg-red-500',
                )}
                style={{ width: `${passPercentage}%` }}
              />
            </div>
          )}

          {/* Action row */}
          <div className="flex items-center gap-1.5">
            <Button size="sm" variant="outline" onClick={onRunAll} disabled={isRunning || !!isRunningAll} className="h-7 text-xs">
              {(isRunning || isRunningAll) ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Play className="h-3 w-3 mr-1" />}
              {isRunningAll && runAllProgress ? `${runAllProgress.current}/${runAllProgress.total}` : 'Run All'}
            </Button>
            {onRunAllWithSelfHealing && (
              <Button
                size="sm"
                variant="outline"
                onClick={onRunAllWithSelfHealing}
                disabled={isRunning || !!isRunningAll}
                className="h-7 text-xs"
                title="Run all tests and automatically fix failures by adjusting the bot"
              >
                {(isRunning || isRunningAll)
                  ? <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                  : <Sparkles className="h-3 w-3 mr-1" />}
                {isSelfHealing ? 'Self-Healing...' : 'Self-Heal'}
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={() => setShowAddForm(true)} className="h-7 text-xs ml-auto">
              <Plus className="h-3 w-3 mr-1" />
              Add
            </Button>
          </div>
        </div>
      )}

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
          {/* Phase labels as inline text */}
          <p className="text-[10px]">
            <span className={cn(runAllProgress.phase === 'running' ? 'text-foreground font-medium' : 'text-muted-foreground/50')}>Running</span>
            <span className="text-muted-foreground/30"> · </span>
            <span className={cn(runAllProgress.phase === 'validating' ? 'text-foreground font-medium' : 'text-muted-foreground/50')}>Validating</span>
            <span className="text-muted-foreground/30"> · </span>
            <span className={cn(runAllProgress.phase === 'analyzing' ? 'text-foreground font-medium' : 'text-muted-foreground/50')}>AI Analysis</span>
          </p>
        </div>
      )}

      {/* AI-Powered Run Summary — always visible when present */}
      {lastRunSummary && !isRunningAll && (
        <div className={cn(
          'text-xs rounded-lg border overflow-hidden',
          lastRunSummary.overallStatus === 'passed' && 'border-green-200 dark:border-green-800/50 bg-green-50/50 dark:bg-green-950/20',
          lastRunSummary.overallStatus === 'failed' && 'border-red-200 dark:border-red-800/50 bg-red-50/50 dark:bg-red-950/20',
          lastRunSummary.overallStatus === 'mixed' && 'border-amber-200 dark:border-amber-800/50 bg-amber-50/50 dark:bg-amber-950/20',
        )}>
          {/* Summary header — always visible, no collapse */}
          <div className="flex items-center gap-2 px-3 py-2.5">
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

          {/* Details — always expanded */}
          <div className="px-3 pb-3 space-y-2 border-t border-border/30">
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
        </div>
      )}

      {/* Empty state */}
      {testCases.length === 0 && !showAddForm && (
        <div className="flex flex-col items-center justify-center py-14 text-center relative">
          {/* Gradient glow behind icon */}
          <div className="absolute top-6 w-24 h-24 bg-gradient-to-br from-violet-500/10 to-blue-500/10 rounded-full blur-2xl" />
          <div className="relative mb-4 p-3 rounded-2xl bg-gradient-to-br from-violet-500/10 to-blue-500/10 border border-violet-500/10">
            <Sparkles className="h-8 w-8 text-violet-500/60" />
          </div>
          <h3 className="text-base font-semibold mb-1">Ready to test?</h3>
          <p className="text-xs text-muted-foreground max-w-[280px] mb-5 leading-relaxed">
            AI-generate tests from your bot&apos;s configuration, or write custom test cases to verify behavior.
          </p>
          <Button size="sm" onClick={onGenerateTests} disabled={isGenerating} className="h-8">
            {isGenerating ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5 mr-1.5" />}
            Generate Tests
          </Button>
          <button
            onClick={() => setShowAddForm(true)}
            className="mt-2 text-xs text-muted-foreground underline cursor-pointer hover:text-foreground transition-colors"
          >
            or add one manually
          </button>
        </div>
      )}

      {/* Flat test list — sorted by status */}
      {sortedTests.length > 0 && (
        <div className="space-y-1.5">
          {sortedTests.map(test => (
            <div
              key={test.id}
              className={cn(
                'rounded-lg border border-border/50 overflow-hidden transition-colors',
                test.status === 'running' && 'ring-1 ring-primary/20',
              )}
            >
              {/* Test row */}
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
                  {STATUS_ICONS[test.status]}
                  <span className={cn(
                    'truncate text-left flex-1',
                    test.status === 'pending' && 'text-muted-foreground',
                  )}>{test.name}</span>

                  {/* Failure category badge — only on failed tests */}
                  {test.failureCategory && test.status === 'failed' && (
                    <span className={cn(
                      'text-[10px] px-1.5 py-0.5 rounded-full font-medium shrink-0',
                      FAILURE_BADGES[test.failureCategory].className,
                    )}>
                      {FAILURE_BADGES[test.failureCategory].label}
                    </span>
                  )}

                  {/* Duration */}
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

                      {/* Match strategy — shown in expanded details only */}
                      {test.matchStrategy && (
                        <div className="flex items-center gap-1.5">
                          <span className="text-muted-foreground font-medium">Strategy:</span>
                          <span className={cn(
                            'text-[10px] px-1.5 py-0.5 rounded-full font-medium',
                            STRATEGY_LABELS[test.matchStrategy].className,
                          )}>
                            {STRATEGY_LABELS[test.matchStrategy].label}
                          </span>
                        </div>
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

                      {/* Unified action row */}
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 text-[11px]"
                          onClick={() => onRunTest(test.id)}
                        >
                          <RotateCcw className="h-2.5 w-2.5 mr-1" />
                          Run
                        </Button>
                        {test.status === 'failed' && test.failureCategory === 'output_mismatch' && test.actualOutput && onAcceptActual && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 text-[11px] text-green-600 dark:text-green-400"
                            onClick={() => onAcceptActual(test.id)}
                          >
                            <CheckCircle2 className="h-2.5 w-2.5 mr-1" />
                            Accept Actual
                          </Button>
                        )}
                        {onUpdateTest && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 text-[11px]"
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
                            className="h-6 text-[11px] text-red-600 dark:text-red-400"
                            onClick={() => onDeleteTest(test.id)}
                          >
                            <Trash2 className="h-2.5 w-2.5 mr-1" />
                            Remove
                          </Button>
                        )}
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Add custom test form */}
      {showAddForm && (
        <div className="rounded-lg border border-border/50 p-3 space-y-2">
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

          {/* Match strategy — inline, not behind an advanced toggle */}
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

          <div className="flex gap-2 justify-end">
            <Button size="sm" variant="outline" onClick={() => setShowAddForm(false)}>Cancel</Button>
            <Button size="sm" onClick={handleAddTest} disabled={!newTestName.trim() || !newTestInput.trim()}>Add</Button>
          </div>
        </div>
      )}

      {/* Add test button (when tests exist) — only show when form is closed */}
      {testCases.length > 0 && !showAddForm && null}
    </div>
  );
}
