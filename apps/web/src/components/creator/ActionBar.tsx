'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Play, Code, Loader2, CheckCircle, XCircle, Save, Copy, Check, Braces, Type } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import type { CreationStatus } from '@/lib/baleybot/creator-types';
import { cn } from '@/lib/utils';
import { BalCodeHighlighter } from './BalCodeHighlighter';

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
  const [copied, setCopied] = useState(false);
  const [inputMode, setInputMode] = useState<'simple' | 'json'>('simple');
  const [jsonError, setJsonError] = useState<string | null>(null);

  /**
   * Validate JSON input when in JSON mode
   */
  const validateJsonInput = (value: string) => {
    if (!value.trim()) {
      setJsonError(null);
      return;
    }
    try {
      JSON.parse(value);
      setJsonError(null);
    } catch (e) {
      setJsonError(e instanceof Error ? e.message : 'Invalid JSON');
    }
  };

  /**
   * Handle test input change
   */
  const handleInputChange = (value: string) => {
    setTestInput(value);
    if (inputMode === 'json') {
      validateJsonInput(value);
    }
  };

  /**
   * Toggle between simple and JSON mode
   */
  const toggleInputMode = () => {
    const newMode = inputMode === 'simple' ? 'json' : 'simple';
    setInputMode(newMode);
    if (newMode === 'json') {
      validateJsonInput(testInput);
    } else {
      setJsonError(null);
    }
  };

  /**
   * Copy BAL code to clipboard
   */
  const handleCopy = async () => {
    if (!balCode) return;
    try {
      await navigator.clipboard.writeText(balCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

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
      {/* Test Input Section */}
      <div className="space-y-2">
        <div className="flex items-start gap-2">
          {/* Mode Toggle */}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={toggleInputMode}
                  className="shrink-0 h-10 px-3"
                  disabled={isRunning}
                >
                  {inputMode === 'simple' ? (
                    <Type className="h-4 w-4" aria-hidden="true" />
                  ) : (
                    <Braces className="h-4 w-4" aria-hidden="true" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>{inputMode === 'simple' ? 'Switch to JSON mode' : 'Switch to simple mode'}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          {/* Test Input Field - Textarea */}
          <textarea
            value={testInput}
            onChange={(e) => handleInputChange(e.target.value)}
            placeholder={inputMode === 'json' ? '{"key": "value"}' : 'Optional test input...'}
            disabled={isRunning}
            aria-label="Test input for BaleyBot execution"
            rows={inputMode === 'json' && testInput.includes('\n') ? 3 : 1}
            className={cn(
              'flex-1 px-4 py-2.5 rounded-xl border-2 resize-none',
              'bg-background text-foreground',
              'placeholder:text-muted-foreground',
              'focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary',
              'disabled:opacity-50 disabled:cursor-not-allowed',
              'transition-all duration-200',
              inputMode === 'json' && 'font-mono text-sm',
              jsonError && 'border-red-500 focus:border-red-500'
            )}
            style={{
              minHeight: '42px',
              height: inputMode === 'json' && testInput.includes('\n') ? 'auto' : '42px',
            }}
          />
        </div>

        {/* JSON Error Message */}
        {jsonError && inputMode === 'json' && (
          <p className="text-xs text-red-500 pl-12">{jsonError}</p>
        )}
      </div>

      {/* Controls Row */}
      <div className="flex items-center gap-3">

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
            <div className="rounded-xl bg-muted/50 border overflow-hidden">
              {/* Code header with copy button */}
              <div className="flex items-center justify-between px-4 py-2 border-b bg-muted/30">
                <span className="text-xs font-medium text-muted-foreground">BAL Code</span>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleCopy}
                        disabled={!balCode}
                        className="h-7 px-2 text-xs"
                      >
                        {copied ? (
                          <>
                            <Check className="h-3.5 w-3.5 mr-1 text-green-500" aria-hidden="true" />
                            Copied!
                          </>
                        ) : (
                          <>
                            <Copy className="h-3.5 w-3.5 mr-1" aria-hidden="true" />
                            Copy
                          </>
                        )}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>{copied ? 'Copied to clipboard!' : 'Copy code to clipboard'}</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              {/* Code content with syntax highlighting */}
              <div className="p-4">
                <BalCodeHighlighter code={balCode} showLineNumbers />
              </div>
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
