'use client';

import { cn } from '@/lib/utils';
import type { TestRowState, TestPhase } from '@/lib/baleybot/testing/test-stream-types';

// ============================================================================
// HELPERS
// ============================================================================

function phaseColor(phase: TestPhase): string {
  switch (phase) {
    case 'queued': return 'bg-muted/60';
    case 'executing': return 'bg-blue-500';
    case 'validating': return 'bg-purple-500';
    case 'passed': return 'bg-emerald-500';
    case 'failed': return 'bg-rose-500';
  }
}

// ============================================================================
// COMPONENT
// ============================================================================

interface BatchProgressTimelineProps {
  testIds: string[];
  testStates: Map<string, TestRowState>;
  activeTestId: string | null;
  className?: string;
}

export function BatchProgressTimeline({
  testIds,
  testStates,
  activeTestId,
  className,
}: BatchProgressTimelineProps) {
  const passedCount = testIds.filter(id => testStates.get(id)?.phase === 'passed').length;
  const failedCount = testIds.filter(id => testStates.get(id)?.phase === 'failed').length;
  const executingCount = testIds.filter(id => {
    const phase = testStates.get(id)?.phase;
    return phase === 'executing' || phase === 'validating';
  }).length;

  const activeName = activeTestId
    ? testIds.indexOf(activeTestId) + 1
    : null;

  const useDots = testIds.length > 8;

  return (
    <div className={cn('space-y-1.5', className)}>
      {/* Stats header */}
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <div className="flex items-center gap-2">
          {passedCount > 0 && (
            <span className="text-emerald-600 dark:text-emerald-400">{passedCount} passed</span>
          )}
          {failedCount > 0 && (
            <span className="text-rose-600 dark:text-rose-400">{failedCount} failed</span>
          )}
          {executingCount > 0 && (
            <span className="text-blue-600 dark:text-blue-400">{executingCount} active</span>
          )}
        </div>
        <span>
          {passedCount + failedCount}/{testIds.length}
        </span>
      </div>

      {/* Timeline */}
      {useDots ? (
        /* Dot grid for >8 tests */
        <div className="flex flex-wrap gap-1">
          {testIds.map(id => {
            const phase = testStates.get(id)?.phase ?? 'queued';
            const isActive = id === activeTestId;
            return (
              <div
                key={id}
                className={cn(
                  'h-2.5 w-2.5 rounded-full transition-colors duration-500',
                  phaseColor(phase),
                  isActive && 'animate-pulse-soft ring-2 ring-blue-500/30',
                )}
              />
            );
          })}
        </div>
      ) : (
        /* Segmented bar for <=8 tests */
        <div className="flex gap-0.5 h-2 rounded-full overflow-hidden">
          {testIds.map(id => {
            const phase = testStates.get(id)?.phase ?? 'queued';
            const isActive = id === activeTestId;
            return (
              <div
                key={id}
                className={cn(
                  'flex-1 rounded-sm transition-colors duration-500',
                  phaseColor(phase),
                  isActive && 'animate-pulse-soft',
                )}
              />
            );
          })}
        </div>
      )}

      {/* Active test indicator */}
      {activeName && (
        <p className="text-[10px] text-muted-foreground">
          Running test {activeName} of {testIds.length}...
        </p>
      )}
    </div>
  );
}
