'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Play, Code, Loader2, CheckCircle, XCircle, Save, Copy, Check, Braces, Type, Download, AlertTriangle } from 'lucide-react';
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
import type { ParserErrorLocation } from '@/lib/errors/creator-errors';
import type { SchemaValidationResult } from '@/lib/baleybot/types';

/**
 * Auto-save status type
 */
export type AutoSaveStatus = 'idle' | 'saving' | 'saved' | 'error';

interface RunResult {
  success: boolean;
  output: unknown;
  error?: string;
  /** Parser error location (if this was a parse error) */
  parserLocation?: ParserErrorLocation;
  /** Schema validation result (if entity has output schema) */
  schemaValidation?: SchemaValidationResult;
}

/**
 * Maximum output length before truncation (Phase 5.5)
 */
const MAX_OUTPUT_LENGTH = 10000;
const MAX_OUTPUT_LINES = 200;

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

/**
 * Truncate output for display (Phase 5.5)
 */
interface TruncatedOutput {
  display: string;
  full: string;
  isTruncated: boolean;
  totalLength: number;
  totalLines: number;
}

function truncateOutput(value: unknown): TruncatedOutput {
  const full = safeJsonStringify(value);
  const totalLength = full.length;
  const totalLines = full.split('\n').length;

  let display = full;
  let isTruncated = false;

  // Truncate by length
  if (totalLength > MAX_OUTPUT_LENGTH) {
    display = full.slice(0, MAX_OUTPUT_LENGTH);
    isTruncated = true;
  }

  // Also truncate by lines
  const lines = display.split('\n');
  if (lines.length > MAX_OUTPUT_LINES) {
    display = lines.slice(0, MAX_OUTPUT_LINES).join('\n');
    isTruncated = true;
  }

  return { display, full, isTruncated, totalLength, totalLines };
}

/**
 * Download output as a file
 */
function downloadOutput(content: string, filename: string) {
  const blob = new Blob([content], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Format byte size for display
 */
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
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
      {/* Test Input Section - responsive layout (Phase 4.4) */}
      <div className="space-y-2">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-start gap-2">
          {/* Mode Toggle - min 44px touch target (Phase 4.2) */}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={toggleInputMode}
                  className="shrink-0 min-h-11 min-w-11 h-11 px-3"
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

      {/* Controls Row - Stacks on mobile, row on tablet+ (Phase 4.4, 4.8) */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3 md:gap-4">

        {/* Auto-Save Status Indicator - order changes on mobile (Phase 4.4) */}
        {autoSaveStatus !== 'idle' && (
          <div
            className={cn(
              'flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-sm',
              'order-first sm:order-none', // Show at top on mobile (Phase 4.4)
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
                {/* Run button - min 44px touch target (Phase 4.2), full width on mobile (Phase 4.4) */}
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
                    'px-6 min-h-11 h-auto',
                    'flex items-center justify-center gap-2',
                    'w-full sm:w-auto' // Full width on mobile (Phase 4.4)
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

        {/* Code Toggle Button - min 44px touch target (Phase 4.2), full width on mobile (Phase 4.4) */}
        <Button
          variant="outline"
          onClick={() => setShowCode(!showCode)}
          aria-expanded={showCode}
          aria-controls="bal-code-viewer"
          className={cn(
            'rounded-xl px-4 min-h-11 h-auto',
            'flex items-center justify-center gap-2',
            'w-full sm:w-auto', // Full width on mobile (Phase 4.4)
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

      {/* Run Result Display (Phase 5.5: Handle large output) */}
      <AnimatePresence>
        {runResult && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            {(() => {
              const outputData = runResult.success
                ? truncateOutput(runResult.output)
                : { display: runResult.error || 'Unknown error', full: runResult.error || 'Unknown error', isTruncated: false, totalLength: 0, totalLines: 0 };

              const isParserError = !runResult.success && runResult.parserLocation;

              return (
                <div
                  className={cn(
                    'rounded-xl p-4',
                    runResult.success
                      ? 'bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800'
                      : isParserError
                        ? 'bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800'
                        : 'bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800'
                  )}
                >
                  {/* Truncation warning */}
                  {outputData.isTruncated && runResult.success && (
                    <div className="mb-3 px-3 py-2 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg flex items-center justify-between">
                      <p className="text-xs text-amber-700 dark:text-amber-300">
                        Output truncated ({formatBytes(outputData.totalLength)}, {outputData.totalLines.toLocaleString()} lines)
                      </p>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => downloadOutput(outputData.full, `baleybot-output-${Date.now()}.json`)}
                        className="h-7 px-2 text-xs"
                      >
                        <Download className="h-3 w-3 mr-1" />
                        Download Full
                      </Button>
                    </div>
                  )}

                  <div className="flex items-start gap-3">
                    {runResult.success ? (
                      <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" />
                    ) : isParserError ? (
                      <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
                    ) : (
                      <XCircle className="h-5 w-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <p
                          className={cn(
                            'font-medium text-sm',
                            runResult.success
                              ? 'text-green-800 dark:text-green-200'
                              : isParserError
                                ? 'text-amber-800 dark:text-amber-200'
                                : 'text-red-800 dark:text-red-200'
                          )}
                        >
                          {runResult.success
                            ? 'Execution Successful'
                            : isParserError
                              ? 'Syntax Error'
                              : 'Execution Failed'}
                        </p>
                        {runResult.success && !outputData.isTruncated && outputData.totalLength > 1000 && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => downloadOutput(outputData.full, `baleybot-output-${Date.now()}.json`)}
                            className="h-6 px-2 text-xs text-muted-foreground"
                          >
                            <Download className="h-3 w-3 mr-1" />
                            Download
                          </Button>
                        )}
                      </div>

                      {/* Parser error with source line display */}
                      {isParserError && runResult.parserLocation ? (
                        <div className="space-y-2">
                          <p className={cn(
                            'text-sm',
                            'text-amber-700 dark:text-amber-300'
                          )}>
                            {outputData.display}
                          </p>

                          {/* Source line with error indicator */}
                          {runResult.parserLocation.sourceLine && (
                            <div className="bg-background/50 rounded-lg p-3 font-mono text-sm overflow-x-auto">
                              <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
                                <Code className="h-3 w-3" />
                                Line {runResult.parserLocation.line}
                              </div>
                              <pre className="text-foreground">{runResult.parserLocation.sourceLine}</pre>
                              <pre className="text-amber-500 dark:text-amber-400">
                                {' '.repeat(Math.max(0, runResult.parserLocation.column - 1))}^
                              </pre>
                            </div>
                          )}

                          <p className="text-xs text-muted-foreground">
                            Line {runResult.parserLocation.line}, column {runResult.parserLocation.column}
                          </p>
                        </div>
                      ) : (
                        <pre
                          className={cn(
                            'text-sm font-mono overflow-x-auto whitespace-pre-wrap break-words max-h-[400px] overflow-y-auto',
                            runResult.success
                              ? 'text-green-700 dark:text-green-300'
                              : 'text-red-700 dark:text-red-300'
                          )}
                        >
                          {outputData.display}
                        </pre>
                      )}

                      {outputData.isTruncated && (
                        <p className="mt-2 text-xs text-muted-foreground text-center">
                          ... output truncated ...
                        </p>
                      )}

                      {/* Schema Validation Status (Task 10) */}
                      {runResult.success && runResult.schemaValidation && (
                        <div
                          className={cn(
                            'mt-3 p-2.5 rounded-lg border text-sm',
                            runResult.schemaValidation.valid
                              ? 'bg-green-50/50 dark:bg-green-950/20 border-green-200 dark:border-green-800/50'
                              : 'bg-amber-50/50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800/50'
                          )}
                        >
                          <div className="flex items-center gap-2">
                            {runResult.schemaValidation.valid ? (
                              <>
                                <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400 flex-shrink-0" />
                                <span className="text-green-700 dark:text-green-300 font-medium">
                                  Output matches schema
                                </span>
                              </>
                            ) : (
                              <>
                                <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 flex-shrink-0" />
                                <span className="text-amber-700 dark:text-amber-300 font-medium">
                                  Output schema mismatch
                                </span>
                              </>
                            )}
                          </div>

                          {/* Show validation issues if any */}
                          {!runResult.schemaValidation.valid &&
                            runResult.schemaValidation.issues.length > 0 && (
                              <ul className="mt-2 space-y-1 text-xs text-amber-600 dark:text-amber-400">
                                {runResult.schemaValidation.issues.slice(0, 5).map((issue, idx) => (
                                  <li key={idx} className="flex items-start gap-1.5">
                                    <span className="text-amber-500 mt-0.5">•</span>
                                    <span>
                                      {issue.path.length > 0 && (
                                        <code className="font-mono bg-amber-100 dark:bg-amber-900/30 px-1 rounded mr-1">
                                          {issue.path.join('.')}
                                        </code>
                                      )}
                                      {issue.message}
                                    </span>
                                  </li>
                                ))}
                                {runResult.schemaValidation.issues.length > 5 && (
                                  <li className="text-amber-500 dark:text-amber-500 italic">
                                    ... and {runResult.schemaValidation.issues.length - 5} more issues
                                  </li>
                                )}
                              </ul>
                            )}

                          {/* Hint to check Schema tab */}
                          {!runResult.schemaValidation.valid && (
                            <p className="mt-2 text-xs text-muted-foreground">
                              Check the Schema tab to adjust your output definition.
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })()}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
