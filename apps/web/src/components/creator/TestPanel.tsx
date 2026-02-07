// apps/web/src/components/creator/TestPanel.tsx
'use client';

import { useState } from 'react';
import { FlaskConical, Play, Plus, ChevronDown, ChevronRight, Loader2, CheckCircle2, XCircle, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

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
}

interface TestPanelProps {
  testCases: TestCase[];
  onRunTest: (testId: string) => void;
  onRunAll: () => void;
  onAddTest: (test: Omit<TestCase, 'id' | 'status'>) => void;
  onGenerateTests: () => void;
  isGenerating: boolean;
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
  className,
}: TestPanelProps) {
  const [expandedTests, setExpandedTests] = useState<Set<string>>(new Set());
  const [showAddForm, setShowAddForm] = useState(false);
  const [newTestInput, setNewTestInput] = useState('');
  const [newTestName, setNewTestName] = useState('');
  const [newTestExpected, setNewTestExpected] = useState('');

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
    });
    setNewTestName('');
    setNewTestInput('');
    setNewTestExpected('');
    setShowAddForm(false);
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
            <Button size="sm" variant="outline" onClick={onRunAll} disabled={isRunning}>
              {isRunning ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Play className="h-3.5 w-3.5 mr-1" />}
              Run All
            </Button>
          )}
          <Button size="sm" onClick={onGenerateTests} disabled={isGenerating}>
            {isGenerating ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <FlaskConical className="h-3.5 w-3.5 mr-1" />}
            Generate
          </Button>
        </div>
      </div>

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
