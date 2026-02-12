'use client';

import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Play, Loader2, ChevronDown, ChevronUp, Clock, CheckCircle2, XCircle, FileUp, Copy, Check, RotateCcw, Wrench, ExternalLink } from 'lucide-react';
import { StreamdownMarkdown } from '@/components/shared/StreamdownMarkdown';
import { ToolCallCard } from '@/components/streaming/ToolCallCard';
import type { ToolCall } from '@/components/streaming/ToolCallCard';
import { streamPostSSE } from '@/lib/streaming/client-post-sse';
import { cn } from '@/lib/utils';
import type { BotCapabilities } from '@/lib/baleybot/capabilities';
import type { ToolCallState } from '@/lib/streaming/types/state';

// ============================================================================
// TYPES
// ============================================================================

interface TokenInfo {
  input: number;
  output: number;
  cost: number;
}

interface TestRun {
  id: string;
  timestamp: number;
  status: 'success' | 'error' | 'timeout' | 'running';
  durationMs: number | null;
  input: string;
  output: string;
  toolCalls: ToolCall[];
  executionId: string | null;
  tokenInfo: TokenInfo | null;
}

interface ExecuteStreamEvent {
  type: string;
  executionId?: string;
  content?: string;
  id?: string;
  toolName?: string;
  argumentsDelta?: string;
  arguments?: string;
  result?: unknown;
  error?: string;
  output?: string;
  status?: string;
  durationMs?: number;
  [key: string]: unknown;
}

interface AdaptiveTestSurfaceProps {
  baleybotId: string;
  capabilities: BotCapabilities;
  botName?: string;
  botIcon?: string;
  onExecutionComplete?: (result: { success: boolean; executionId: string | null; durationMs: number }) => void;
  onFetchExecutionDetails?: (executionId: string) => Promise<{ tokenCount?: number | null; estimatedCost?: number | null } | null>;
  className?: string;
}

// ============================================================================
// COMPONENT
// ============================================================================

export function AdaptiveTestSurface({
  baleybotId,
  capabilities,
  botName,
  botIcon,
  onExecutionComplete,
  onFetchExecutionDetails,
  className,
}: AdaptiveTestSurfaceProps) {
  const [inputValue, setInputValue] = useState('');
  const [jsonInput, setJsonInput] = useState('{\n  "message": "Hello"\n}');
  const [isExecuting, setIsExecuting] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const streamingTextRef = useRef('');
  const [toolCalls, setToolCalls] = useState<Record<string, ToolCallState>>({});
  const [testRuns, setTestRuns] = useState<TestRun[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [, setExecutionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [durationMs, setDurationMs] = useState<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const throttleRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Feature: copy output
  const [copiedOutput, setCopiedOutput] = useState(false);
  // Feature: token/cost display
  const [tokenInfo, setTokenInfo] = useState<TokenInfo | null>(null);
  // Feature: expanded history row
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);

  const handleCopyOutput = async () => {
    if (!streamingText) return;
    await navigator.clipboard.writeText(streamingText);
    setCopiedOutput(true);
    setTimeout(() => setCopiedOutput(false), 2000);
  };

  const handleExecute = async () => {
    if (isExecuting) return;

    // Parse input based on mode
    let input: unknown;
    if (capabilities.inputMode === 'webhook-payload') {
      try {
        input = JSON.parse(jsonInput);
      } catch {
        setError('Invalid JSON payload');
        return;
      }
    } else {
      input = inputValue.trim() || undefined;
    }

    // Reset state
    setIsExecuting(true);
    setStreamingText('');
    streamingTextRef.current = '';
    setToolCalls({});
    setError(null);
    setDurationMs(null);
    setExecutionId(null);
    setTokenInfo(null);
    setCopiedOutput(false);
    if (throttleRef.current) {
      clearTimeout(throttleRef.current);
      throttleRef.current = null;
    }

    abortRef.current = new AbortController();
    const startedAt = Date.now();
    let finalExecutionId: string | null = null;
    let finalOutput = '';
    let success = true;
    const collectedToolCalls: Record<string, ToolCallState> = {};

    try {
      await streamPostSSE<ExecuteStreamEvent>({
        url: `/api/baleybots/${baleybotId}/execute-stream`,
        body: { input, triggeredBy: 'manual' },
        onEvent: (event) => {
          const eventId = event.id as string | undefined;

          if (event.type === 'execution_started') {
            finalExecutionId = (event.executionId as string) ?? null;
            setExecutionId(finalExecutionId);
            return;
          }

          if (event.type === 'text_delta' && event.content) {
            streamingTextRef.current += event.content as string;
            if (!throttleRef.current) {
              throttleRef.current = setTimeout(() => {
                setStreamingText(streamingTextRef.current);
                throttleRef.current = null;
              }, 100);
            }
            return;
          }

          if (event.type === 'tool_call_stream_start' && eventId) {
            const tc: ToolCallState = {
              id: eventId,
              toolName: (event.toolName as string) ?? '',
              arguments: '',
              parsedArguments: undefined,
              status: 'streaming_args',
              startTime: Date.now(),
            };
            collectedToolCalls[eventId] = tc;
            setToolCalls((prev) => ({ ...prev, [eventId]: tc }));
            return;
          }

          if (event.type === 'tool_call_arguments_delta' && eventId) {
            const existing = collectedToolCalls[eventId];
            if (existing) {
              existing.arguments += (event.argumentsDelta as string) ?? '';
              setToolCalls((prev) => ({ ...prev, [eventId]: { ...existing } }));
            }
            return;
          }

          if (event.type === 'tool_call_stream_complete' && eventId) {
            const existing = collectedToolCalls[eventId];
            if (existing) {
              existing.status = 'args_complete';
              existing.arguments = (event.arguments as string) ?? existing.arguments;
              try {
                existing.parsedArguments = JSON.parse(existing.arguments);
              } catch { /* leave as string */ }
              setToolCalls((prev) => ({ ...prev, [eventId]: { ...existing } }));
            }
            return;
          }

          if (event.type === 'tool_execution_start' && eventId) {
            const existing = collectedToolCalls[eventId];
            if (existing) {
              existing.status = 'executing';
              setToolCalls((prev) => ({ ...prev, [eventId]: { ...existing } }));
            }
            return;
          }

          if (event.type === 'tool_execution_output' && eventId) {
            const existing = collectedToolCalls[eventId];
            if (existing) {
              existing.status = event.error ? 'error' : 'complete';
              existing.result = event.result;
              existing.error = event.error as string | undefined;
              existing.endTime = Date.now();
              setToolCalls((prev) => ({ ...prev, [eventId]: { ...existing } }));
            }
            return;
          }

          if (event.type === 'execution_result') {
            finalOutput = (event.output as string) ?? streamingTextRef.current;
            const dur = (event.durationMs as number) ?? Date.now() - startedAt;
            setDurationMs(dur);
            success = event.status !== 'error';
            return;
          }

          if (event.type === 'error') {
            setError((event.error as string) ?? 'Execution failed');
            success = false;
            return;
          }
        },
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Execution failed');
      success = false;
    }

    // Flush remaining text
    if (throttleRef.current) {
      clearTimeout(throttleRef.current);
      throttleRef.current = null;
    }
    const finalText = streamingTextRef.current || finalOutput;
    setStreamingText(finalText);
    setIsExecuting(false);

    const dur = durationMs ?? Date.now() - startedAt;

    // Fetch token info after completion
    let runTokenInfo: TokenInfo | null = null;
    if (finalExecutionId && onFetchExecutionDetails) {
      try {
        const details = await onFetchExecutionDetails(finalExecutionId);
        if (details) {
          runTokenInfo = {
            input: details.tokenCount ?? 0,
            output: 0,
            cost: details.estimatedCost ?? 0,
          };
          setTokenInfo(runTokenInfo);
        }
      } catch {
        // Non-critical — token info just won't display
      }
    }

    // Add to test runs
    const run: TestRun = {
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      status: success ? 'success' : 'error',
      durationMs: dur,
      input: capabilities.inputMode === 'webhook-payload' ? jsonInput : inputValue,
      output: finalText,
      toolCalls: Object.values(collectedToolCalls).map(toToolCall),
      executionId: finalExecutionId,
      tokenInfo: runTokenInfo,
    };
    setTestRuns((prev) => [run, ...prev].slice(0, 20));

    onExecutionComplete?.({
      success,
      executionId: finalExecutionId,
      durationMs: dur,
    });
  };

  const handleCancel = () => {
    abortRef.current?.abort();
    setIsExecuting(false);
  };

  const handleRerun = (run: TestRun) => {
    if (capabilities.inputMode === 'webhook-payload') {
      setJsonInput(run.input);
    } else {
      setInputValue(run.input);
    }
    setSelectedRunId(null);
    // Trigger execution after state update
    setTimeout(() => handleExecute(), 0);
  };

  return (
    <div className={cn('h-full flex flex-col gap-3', className)}>
      {/* Header */}
      <div className="shrink-0 rounded-xl border border-border/60 bg-card/70 shadow-sm px-4 py-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {botIcon && <span className="text-lg">{botIcon}</span>}
          <div>
            <p className="text-sm font-medium">
              Test {botName || 'your bot'}
            </p>
            <p className="text-[11px] text-muted-foreground">
              {capabilities.inputMode === 'webhook-payload'
                ? 'Send a JSON payload to test webhook handling'
                : capabilities.inputMode === 'file'
                  ? 'Upload a file to test file processing'
                  : capabilities.outputMode === 'structured'
                    ? 'Run and inspect structured output'
                    : 'Send a message and see the streaming response'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {durationMs != null && !isExecuting && (
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {(durationMs / 1000).toFixed(1)}s
            </span>
          )}
          {tokenInfo && !isExecuting && tokenInfo.input > 0 && (
            <span className="text-xs text-muted-foreground">
              {tokenInfo.input.toLocaleString()} tokens
            </span>
          )}
          {tokenInfo && !isExecuting && tokenInfo.cost > 0 && (
            <span className="text-xs text-muted-foreground">
              ~${tokenInfo.cost.toFixed(4)}
            </span>
          )}
        </div>
      </div>

      {/* Input area */}
      <div className="shrink-0 rounded-xl border border-border/60 bg-card/70 shadow-sm p-3">
        {capabilities.inputMode === 'webhook-payload' ? (
          <textarea
            value={jsonInput}
            onChange={(e) => setJsonInput(e.target.value)}
            placeholder='{"message": "Hello"}'
            className="w-full min-h-[120px] rounded-lg border border-border/50 bg-muted/30 px-3 py-2 text-sm font-mono resize-y focus:outline-none focus:ring-2 focus:ring-primary/30"
            disabled={isExecuting}
          />
        ) : capabilities.inputMode === 'file' ? (
          <div className="flex items-center gap-3">
            <div className="flex-1 flex items-center justify-center rounded-lg border-2 border-dashed border-border/50 py-8 text-muted-foreground text-sm">
              <FileUp className="h-4 w-4 mr-2" />
              File upload triggers are executed via the file upload API endpoint
            </div>
          </div>
        ) : (
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !isExecuting) {
                e.preventDefault();
                handleExecute();
              }
            }}
            placeholder="Type a message to test your bot..."
            className="w-full rounded-lg border border-border/50 bg-muted/30 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            disabled={isExecuting}
          />
        )}
        <div className="flex items-center justify-end gap-2 mt-2">
          {isExecuting ? (
            <Button size="sm" variant="destructive" onClick={handleCancel}>
              <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
              Cancel
            </Button>
          ) : (
            <Button size="sm" onClick={handleExecute} disabled={capabilities.inputMode === 'file'}>
              <Play className="h-3.5 w-3.5 mr-1.5" />
              Run
            </Button>
          )}
        </div>
      </div>

      {/* Output area */}
      <div className="flex-1 min-h-0 overflow-y-auto rounded-[1.1rem] border border-border/60 bg-card/70 shadow-sm backdrop-blur-sm p-4 relative">
        {/* Copy button */}
        {streamingText && !isExecuting && (
          <button
            onClick={handleCopyOutput}
            className="absolute top-2.5 right-2.5 p-1.5 rounded-md bg-muted/50 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors z-10"
            title="Copy output"
          >
            {copiedOutput
              ? <Check className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
              : <Copy className="h-3.5 w-3.5" />
            }
          </button>
        )}

        {error && (
          <div className="rounded-lg bg-destructive/10 border border-destructive/30 px-3 py-2 text-sm text-destructive mb-3">
            {error}
          </div>
        )}

        {Object.keys(toolCalls).length > 0 && (
          <div className="space-y-2 mb-3">
            {Object.values(toolCalls).map((tc) => (
              <ToolCallCard key={tc.id} toolCall={toToolCall(tc)} />
            ))}
          </div>
        )}

        {streamingText ? (
          capabilities.outputMode === 'structured' && !isExecuting ? (
            <StructuredOutput text={streamingText} schema={capabilities.outputSchema} />
          ) : (
            <div className="prose prose-sm dark:prose-invert max-w-none">
              <StreamdownMarkdown text={streamingText} />
            </div>
          )
        ) : !isExecuting && !error ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="rounded-2xl bg-muted/30 p-4 mb-3">
              <Play className="h-8 w-8 text-muted-foreground/50" />
            </div>
            <p className="text-sm font-medium text-foreground/80">No tests run yet</p>
            <p className="text-xs text-muted-foreground mt-1 max-w-[240px]">
              {capabilities.inputMode === 'webhook-payload'
                ? 'Send a JSON payload above to test your webhook handler'
                : capabilities.inputMode === 'file'
                  ? 'File-triggered bots are tested via the file upload API'
                  : 'Type a message and click Run to see your bot in action'}
            </p>
          </div>
        ) : isExecuting && !streamingText ? (
          <div className="flex items-center justify-center py-8">
            <span className="inline-flex gap-[3px]">
              <span className="w-[5px] h-[5px] rounded-full bg-primary/70 animate-loading-dot" style={{ animationDelay: '0ms' }} />
              <span className="w-[5px] h-[5px] rounded-full bg-primary/70 animate-loading-dot" style={{ animationDelay: '200ms' }} />
              <span className="w-[5px] h-[5px] rounded-full bg-primary/70 animate-loading-dot" style={{ animationDelay: '400ms' }} />
            </span>
            <span className="ml-3 text-sm text-foreground/80">Executing...</span>
          </div>
        ) : null}
      </div>

      {/* Execution History */}
      {testRuns.length > 0 && (
        <div className="shrink-0 rounded-xl border border-border/60 bg-card/70 shadow-sm">
          <button
            onClick={() => setShowHistory(!showHistory)}
            className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            <span>Test History ({testRuns.length})</span>
            {showHistory ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
          {showHistory && (
            <div className="border-t border-border/30 max-h-[300px] overflow-y-auto">
              {testRuns.map((run) => (
                <div key={run.id}>
                  {/* Collapsed row */}
                  <button
                    onClick={() => setSelectedRunId(selectedRunId === run.id ? null : run.id)}
                    className={cn(
                      'w-full flex items-center gap-3 px-4 py-2 text-sm border-b border-border/20 last:border-b-0 hover:bg-muted/20 transition-colors text-left',
                      selectedRunId === run.id && 'bg-muted/20',
                    )}
                  >
                    {run.status === 'success' ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                    ) : (
                      <XCircle className="h-4 w-4 text-destructive shrink-0" />
                    )}
                    <span className="truncate flex-1 text-muted-foreground">
                      {run.input ? run.input.slice(0, 60) : 'Empty input'}
                      {run.input.length > 60 && '...'}
                    </span>
                    {/* Output preview */}
                    {run.output && (
                      <span className="text-xs text-muted-foreground/60 truncate max-w-[120px] hidden sm:inline">
                        {run.output.slice(0, 80)}
                      </span>
                    )}
                    {/* Tool call count */}
                    {run.toolCalls.length > 0 && (
                      <span className="text-[10px] text-muted-foreground flex items-center gap-0.5 shrink-0">
                        <Wrench className="h-3 w-3" />
                        {run.toolCalls.length}
                      </span>
                    )}
                    {run.durationMs != null && (
                      <span className="text-xs text-muted-foreground shrink-0">
                        {(run.durationMs / 1000).toFixed(1)}s
                      </span>
                    )}
                    <span className="text-xs text-muted-foreground shrink-0">
                      {new Date(run.timestamp).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
                    </span>
                    {selectedRunId === run.id ? (
                      <ChevronUp className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    ) : (
                      <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    )}
                  </button>

                  {/* Expanded row */}
                  {selectedRunId === run.id && (
                    <div className="px-4 py-3 bg-muted/20 border-b border-border/20 space-y-2">
                      {/* Input */}
                      <div>
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground/60 mb-1">Input</p>
                        <pre className="text-xs bg-muted/30 rounded-lg px-3 py-2 max-h-[80px] overflow-y-auto whitespace-pre-wrap break-words font-mono">
                          {run.input || '(empty)'}
                        </pre>
                      </div>

                      {/* Output */}
                      <div>
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground/60 mb-1">Output</p>
                        <div className="text-xs bg-muted/30 rounded-lg px-3 py-2 max-h-[120px] overflow-y-auto prose prose-xs dark:prose-invert max-w-none">
                          <StreamdownMarkdown text={run.output || '(no output)'} />
                        </div>
                      </div>

                      {/* Metadata row */}
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        {run.toolCalls.length > 0 && (
                          <span className="flex items-center gap-1">
                            <Wrench className="h-3 w-3" /> {run.toolCalls.length} tool{run.toolCalls.length !== 1 ? 's' : ''}
                          </span>
                        )}
                        {run.tokenInfo && run.tokenInfo.input > 0 && (
                          <span>{run.tokenInfo.input.toLocaleString()} tokens</span>
                        )}
                        {run.tokenInfo && run.tokenInfo.cost > 0 && (
                          <span>~${run.tokenInfo.cost.toFixed(4)}</span>
                        )}
                        {run.durationMs != null && (
                          <span>{(run.durationMs / 1000).toFixed(1)}s</span>
                        )}
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-2 pt-1">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRerun(run);
                          }}
                        >
                          <RotateCcw className="h-3 w-3 mr-1" />
                          Re-run
                        </Button>
                        {run.executionId && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 text-xs"
                            asChild
                          >
                            <a href={`/dashboard/activity/${run.executionId}`} target="_blank" rel="noopener noreferrer">
                              <ExternalLink className="h-3 w-3 mr-1" />
                              View execution
                            </a>
                          </Button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// HELPERS
// ============================================================================

function toToolCall(tc: ToolCallState): ToolCall {
  return {
    id: tc.id,
    toolName: tc.toolName,
    arguments: tc.arguments,
    parsedArguments: tc.parsedArguments,
    status: tc.status,
    result: tc.result,
    error: tc.error,
    startTime: tc.startTime,
    endTime: tc.endTime,
  };
}

function StructuredOutput({
  text,
  schema,
}: {
  text: string;
  schema?: Record<string, string>;
}) {
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const handleCopyField = async (value: string, key: string) => {
    await navigator.clipboard.writeText(value);
    setCopiedField(key);
    setTimeout(() => setCopiedField(null), 2000);
  };

  let parsed: Record<string, unknown> | null = null;
  try {
    parsed = JSON.parse(text);
  } catch {
    const match = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (match?.[1]) {
      try { parsed = JSON.parse(match[1]); } catch { /* noop */ }
    }
  }

  if (!parsed || typeof parsed !== 'object') {
    return (
      <div className="prose prose-sm dark:prose-invert max-w-none">
        <StreamdownMarkdown text={text} />
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {Object.entries(parsed).map(([key, value]) => {
        const displayValue = typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value);
        return (
          <div key={key} className="flex gap-2 text-sm group">
            <span className="font-medium text-muted-foreground min-w-[100px]">
              {key}
              {schema?.[key] && (
                <span className="text-xs text-muted-foreground/60 ml-1">({schema[key]})</span>
              )}
            </span>
            <span className="flex-1 break-words">
              {typeof value === 'object' ? (
                <pre className="text-xs bg-muted/30 rounded p-1.5 overflow-x-auto">
                  {displayValue}
                </pre>
              ) : (
                String(value)
              )}
            </span>
            <button
              onClick={() => handleCopyField(displayValue, key)}
              className="opacity-0 group-hover:opacity-100 transition-opacity p-1 text-muted-foreground hover:text-foreground shrink-0"
              title="Copy value"
            >
              {copiedField === key
                ? <Check className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
                : <Copy className="h-3 w-3" />
              }
            </button>
          </div>
        );
      })}
    </div>
  );
}
