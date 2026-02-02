'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Play, Code, Loader2, CheckCircle, XCircle, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import type { CreationStatus } from '@/lib/baleybot/creator-types';
import { cn } from '@/lib/utils';

/**
 * Auto-save status type
 */
export type AutoSaveStatus = 'idle' | 'saving' | 'saved' | 'error';

interface RunResult {
  success: boolean;
  output: unknown;
  error?: string;
}

/**
 * Safely stringify an unknown value, handling circular references
 */
function safeJsonStringify(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    // Handle circular references or other serialization errors
    return String(value);
  }
}

interface ActionBarProps {
  status: CreationStatus;
  balCode: string;
  onRun: (input: string) => void;
  runResult?: RunResult;
  className?: string;
  /** Whether the run button is locked (e.g., during auto-save) */
  isRunLocked?: boolean;
  /** Auto-save status to display */
  autoSaveStatus?: AutoSaveStatus;
}

export function ActionBar({
  status,
  balCode,
  onRun,
  runResult,
  className,
  isRunLocked = false,
  autoSaveStatus = 'idle',
}: ActionBarProps) {
  const [testInput, setTestInput] = useState('');
  const [showCode, setShowCode] = useState(false);

  // Only render when status is 'ready', 'running', or 'error'
  if (status !== 'ready' && status !== 'running' && status !== 'error') {
    return null;
  }

  const isRunning = status === 'running';
  const isRunDisabled = isRunning || isRunLocked;

  const handleRun = () => {
    onRun(testInput);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
      className={cn('space-y-4', className)}
    >
      {/* Controls Row */}
      <div className="flex items-center gap-3">
        {/* Test Input Field */}
        <input
          type="text"
          value={testInput}
          onChange={(e) => setTestInput(e.target.value)}
          placeholder="Optional test input..."
          disabled={isRunning}
          aria-label="Test input for BaleyBot execution"
          className={cn(
            'flex-1 px-4 py-2.5 rounded-xl border-2',
            'bg-background text-foreground',
            'placeholder:text-muted-foreground',
            'focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary',
            'disabled:opacity-50 disabled:cursor-not-allowed',
            'transition-all duration-200'
          )}
        />

        {/* Auto-Save Status Indicator */}
        {autoSaveStatus !== 'idle' && (
          <div
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm',
              autoSaveStatus === 'saving' && 'bg-blue-50 dark:bg-blue-950/30 text-blue-600 dark:text-blue-400',
              autoSaveStatus === 'saved' && 'bg-green-50 dark:bg-green-950/30 text-green-600 dark:text-green-400',
              autoSaveStatus === 'error' && 'bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400'
            )}
            role="status"
            aria-live="polite"
          >
            {autoSaveStatus === 'saving' && (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                <span>Saving...</span>
              </>
            )}
            {autoSaveStatus === 'saved' && (
              <>
                <CheckCircle className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Saved</span>
              </>
            )}
            {autoSaveStatus === 'error' && (
              <>
                <XCircle className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Save failed</span>
              </>
            )}
          </div>
        )}

        {/* Run Button */}
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <span>
                <Button
                  onClick={handleRun}
                  disabled={isRunDisabled}
                  aria-label={
                    isRunning
                      ? 'Running BaleyBot'
                      : isRunLocked
                        ? 'Saving changes before run'
                        : 'Run BaleyBot'
                  }
                  className={cn(
                    'btn-playful text-white rounded-xl',
                    'px-6 py-2.5 h-auto',
                    'flex items-center gap-2'
                  )}
                >
                  {isRunning ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                      Running...
                    </>
                  ) : isRunLocked ? (
                    <>
                      <Save className="h-4 w-4 animate-pulse" aria-hidden="true" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Play className="h-4 w-4" aria-hidden="true" />
                      Run
                    </>
                  )}
                </Button>
              </span>
            </TooltipTrigger>
            {isRunLocked && !isRunning && (
              <TooltipContent>
                <p>Saving changes before running...</p>
              </TooltipContent>
            )}
          </Tooltip>
        </TooltipProvider>

        {/* Code Toggle Button */}
        <Button
          variant="outline"
          onClick={() => setShowCode(!showCode)}
          aria-expanded={showCode}
          aria-controls="bal-code-viewer"
          className={cn(
            'rounded-xl px-4 py-2.5 h-auto',
            'flex items-center gap-2',
            showCode && 'bg-muted'
          )}
        >
          <Code className="h-4 w-4" aria-hidden="true" />
          {showCode ? 'Hide Code' : 'View Code'}
        </Button>
      </div>

      {/* Code Viewer */}
      <AnimatePresence>
        {showCode && (
          <motion.div
            id="bal-code-viewer"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2, ease: 'easeInOut' }}
            className="overflow-hidden"
            role="region"
            aria-label="Generated BAL code"
          >
            <div className="rounded-xl bg-muted/50 border p-4">
              <pre className="text-sm font-mono overflow-x-auto whitespace-pre-wrap break-words">
                <code>{balCode || '// No BAL code generated yet'}</code>
              </pre>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Run Result Display */}
      <AnimatePresence>
        {runResult && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <div
              className={cn(
                'rounded-xl p-4',
                runResult.success
                  ? 'bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800'
                  : 'bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800'
              )}
            >
              <div className="flex items-start gap-3">
                {runResult.success ? (
                  <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" />
                ) : (
                  <XCircle className="h-5 w-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
                )}
                <div className="flex-1 min-w-0">
                  <p
                    className={cn(
                      'font-medium text-sm mb-1',
                      runResult.success
                        ? 'text-green-800 dark:text-green-200'
                        : 'text-red-800 dark:text-red-200'
                    )}
                  >
                    {runResult.success ? 'Execution Successful' : 'Execution Failed'}
                  </p>
                  <pre
                    className={cn(
                      'text-sm font-mono overflow-x-auto whitespace-pre-wrap break-words',
                      runResult.success
                        ? 'text-green-700 dark:text-green-300'
                        : 'text-red-700 dark:text-red-300'
                    )}
                  >
                    {runResult.success
                      ? safeJsonStringify(runResult.output)
                      : runResult.error || 'Unknown error'}
                  </pre>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
