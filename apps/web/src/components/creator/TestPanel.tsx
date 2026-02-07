// apps/web/src/components/creator/TestPanel.tsx
'use client';

import { useState, useEffect, useRef } from 'react';
import { FlaskConical, Play, Plus, ChevronDown, ChevronRight, Loader2, CheckCircle2, XCircle, Clock, Pencil, Trash2, Check, X, RotateCcw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import type { FailureCategory, MatchStrategy, RunAllProgress, TestRunSummary } from '@/hooks/useTestExecution';

export interface TestCase {
  id: string;
  name: string;
  level: 'unit' | 'integration' | 'e2e';
  input: string;
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

/**
 * TestPanel displays and manages test cases for the bot.
 */
export function TestPanel({
  testCases,
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
  const [showAddForm, setShowAddForm] = useState(false);
  const [newTestInput, setNewTestInput] = useState('');
  const [newTestName, setNewTestName] = useState('');
  const [newTestExpected, setNewTestExpected] = useState('');
  const [newTestMatchStrategy, setNewTestMatchStrategy] = useState<MatchStrategy>('contains');
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
    onAddTest({
      name: newTestName.trim(),
      level: 'unit',
      input: newTestInput.trim(),
      expectedOutput: newTestExpected.trim() || undefined,
      matchStrategy: newTestMatchStrategy !== 'contains' ? newTestMatchStrategy : undefined,
    });
    setNewTestName('');
    setNewTestInput('');
    setNewTestExpected('');
    setNewTestMatchStrategy('contains');
    setShowAdvanced(false);
    setShowAddForm(false);
  };

  const startEditing = (test: TestCase) => {
    setEditingTestId(test.id);
    setEditName(test.name);
    setEditInput(test.input);
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
  const isRunning = testCases.some(t => t.status === 'running');

  return (
    <div className={cn('space-y-4', className)}>
      {/* Header with stats */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h3 className="text-sm font-medium">Test Suite</h3>
          {testCases.length > 0 && (
            <div className="flex items-center gap-2 text-xs">
              <span className="text-green-600 dark:text-green-400">{totalPassed} passed</span>
              {totalFailed > 0 && (
                <span className="text-red-600 dark:text-red-400">{totalFailed} failed</span>
              )}
              <span className="text-muted-foreground">{testCases.length} total</span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          {testCases.length > 0 && (
            <Button size="sm" variant="outline" onClick={onRunAll} disabled={isRunning || !!isRunningAll}>
              {(isRunning || isRunningAll) ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Play className="h-3.5 w-3.5 mr-1" />}
              {isRunningAll && runAllProgress ? `${runAllProgress.current}/${runAllProgress.total}` : 'Run All'}
            </Button>
          )}
          <Button size="sm" onClick={onGenerateTests} disabled={isGenerating}>
            {isGenerating ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <FlaskConical className="h-3.5 w-3.5 mr-1" />}
            Generate
          </Button>
        </div>
      </div>

      {/* Run progress */}
      {isRunningAll && runAllProgress && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 rounded-md px-3 py-2">
          <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
          <span className="truncate">
            {runAllProgress.phase === 'analyzing' ? 'Analyzing results...' : runAllProgress.currentTestName}
          </span>
        </div>
      )}

      {/* Last run summary */}
      {lastRunSummary && !isRunningAll && (
        <div className={cn(
          'text-xs rounded-md px-3 py-2',
          lastRunSummary.overallStatus === 'passed' && 'bg-green-50 text-green-700 dark:bg-green-950/30 dark:text-green-400',
          lastRunSummary.overallStatus === 'failed' && 'bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-400',
          lastRunSummary.overallStatus === 'mixed' && 'bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400',
        )}>
          <p className="font-medium">{Math.round(lastRunSummary.passRate * 100)}% pass rate</p>
          <p className="mt-0.5 opacity-80">{lastRunSummary.summary}</p>
        </div>
      )}

      {/* Empty state */}
      {testCases.length === 0 && !showAddForm && (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <FlaskConical className="h-10 w-10 text-muted-foreground/40 mb-4" />
          <h3 className="text-lg font-medium mb-2">No tests yet</h3>
          <p className="text-sm text-muted-foreground max-w-md mb-4">
            Generate tests from your bot&apos;s goal, or add custom test cases.
          </p>
          <div className="flex gap-2">
            <Button size="sm" onClick={onGenerateTests} disabled={isGenerating}>
              {isGenerating ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <FlaskConical className="h-3.5 w-3.5 mr-1" />}
              Auto-generate
            </Button>
            <Button size="sm" variant="outline" onClick={() => setShowAddForm(true)}>
              <Plus className="h-3.5 w-3.5 mr-1" />
              Add Custom
            </Button>
          </div>
        </div>
      )}

      {/* Test cases grouped by level */}
      {(['unit', 'integration', 'e2e'] as const).map(level => {
        const tests = byLevel[level];
        if (tests.length === 0) return null;
        return (
          <div key={level}>
            <div className="flex items-center gap-2 mb-2">
              <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full font-medium uppercase', LEVEL_COLORS[level])}>
                {level}
              </span>
              <span className="text-xs text-muted-foreground">{tests.length} test{tests.length !== 1 ? 's' : ''}</span>
            </div>
            <div className="space-y-1">
              {tests.map(test => (
                <div key={test.id} className="rounded-lg border border-border/50 overflow-hidden">
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
                      {expandedTests.has(test.id) ? (
                        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      ) : (
                        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      )}
                      {STATUS_ICONS[test.status]}
                      <span className="truncate text-left flex-1">{test.name}</span>
                      {/* Failure category badge */}
                      {test.failureCategory && test.status === 'failed' && (
                        <span className={cn(
                          'text-[10px] px-1.5 py-0.5 rounded-full font-medium shrink-0',
                          FAILURE_BADGES[test.failureCategory].className,
                        )}>
                          {FAILURE_BADGES[test.failureCategory].label}
                        </span>
                      )}
                      {/* Match strategy indicator */}
                      {test.matchStrategy && test.matchStrategy !== 'contains' && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-muted text-muted-foreground shrink-0">
                          {test.matchStrategy}
                        </span>
                      )}
                      {test.durationMs !== undefined && (
                        <span className="text-[10px] text-muted-foreground shrink-0">{test.durationMs}ms</span>
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
                            <Button size="sm" variant="ghost" onClick={cancelEdit}>
                              <X className="h-3 w-3 mr-1" />
                              Cancel
                            </Button>
                            <Button size="sm" onClick={saveEdit} disabled={!editName.trim() || !editInput.trim()}>
                              <Check className="h-3 w-3 mr-1" />
                              Save
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <>
                          {/* Read-only display */}
                          <div>
                            <p className="text-muted-foreground font-medium mb-0.5">Input:</p>
                            <pre className="bg-muted/50 rounded p-2 font-mono whitespace-pre-wrap">{test.input}</pre>
                          </div>
                          {test.expectedOutput && (
                            <div>
                              <p className="text-muted-foreground font-medium mb-0.5">Expected:</p>
                              <pre className="bg-muted/50 rounded p-2 font-mono whitespace-pre-wrap">{test.expectedOutput}</pre>
                            </div>
                          )}
                          {test.actualOutput && (
                            <div>
                              <p className="text-muted-foreground font-medium mb-0.5">Actual:</p>
                              <pre className={cn(
                                'rounded p-2 font-mono whitespace-pre-wrap',
                                test.status === 'passed' ? 'bg-green-500/5' : 'bg-red-500/5'
                              )}>{test.actualOutput}</pre>
                            </div>
                          )}
                          {test.error && (
                            <div>
                              <p className="text-red-600 dark:text-red-400 font-medium mb-0.5">Error:</p>
                              <pre className="bg-red-500/5 rounded p-2 font-mono whitespace-pre-wrap text-red-700 dark:text-red-300">{test.error}</pre>
                            </div>
                          )}

                          {/* Action buttons for failed tests */}
                          {test.status === 'failed' && (
                            <div className="flex flex-wrap gap-1.5 pt-1 border-t border-border/20">
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
                        </>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
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
          <textarea
            placeholder="Test input..."
            value={newTestInput}
            onChange={(e) => setNewTestInput(e.target.value)}
            rows={2}
            aria-label="Test input"
            className="w-full text-sm bg-muted/50 border border-border/50 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
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
