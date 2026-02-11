'use client';

import { createContext, useContext, useState, useRef } from 'react';
import type { ReactNode } from 'react';
import type { GraphRuntimeEvent } from '@/lib/streaming/types/events';
import type { ToolCallState } from '@/lib/streaming/types/state';
import { streamPostSSE } from '@/lib/streaming/client-post-sse';

// ============================================================================
// TYPES
// ============================================================================

export type ReviewContentBlock =
  | { type: 'text'; content: string }
  | { type: 'tool_call'; toolCallId: string };

export interface ReviewMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;                    // Raw text for copy/ResultView
  blocks: ReviewContentBlock[];       // Interleaved for rendering
  toolCallStates: Record<string, ToolCallState>;  // Snapshot at finalization
  timestamp: number;
}

export interface ReviewExecutionState {
  isExecuting: boolean;
  executionId: string | null;
  output: string | null;
  error: string | null;
  durationMs: number | null;
  graphEvents: GraphRuntimeEvent[];
  messages: ReviewMessage[];
  toolCalls: Record<string, ToolCallState>;    // Live tool calls for current execution
  currentBlocks: ReviewContentBlock[];          // Blocks being built during streaming
}

interface ReviewExecutionContextValue {
  state: ReviewExecutionState;
  execute: (input: string | Record<string, unknown>) => Promise<void>;
  clearResult: () => void;
}

// ============================================================================
// CONTEXT
// ============================================================================

const ReviewExecutionContext = createContext<ReviewExecutionContextValue | null>(null);

export function useReviewExecution(): ReviewExecutionContextValue {
  const context = useContext(ReviewExecutionContext);
  if (!context) {
    throw new Error('useReviewExecution must be used within a ReviewExecutionProvider');
  }
  return context;
}

// ============================================================================
// PROVIDER
// ============================================================================

type ExecuteStreamEvent =
  | { type: 'execution_started'; executionId?: string }
  | { type: 'text_delta'; content?: string }
  | { type: 'tool_call_stream_start'; id?: string; toolName?: string }
  | { type: 'tool_call_arguments_delta'; id?: string; argumentsDelta?: string }
  | { type: 'tool_call_stream_complete'; id?: string; toolName?: string; arguments?: string }
  | { type: 'tool_execution_start'; id?: string; toolName?: string; arguments?: string }
  | { type: 'tool_execution_output'; id?: string; toolName?: string; result?: unknown; error?: string }
  | { type: 'execution_result'; executionId?: string; output?: string; status?: string; durationMs?: number }
  | { type: 'graph_event'; graphEvent?: GraphRuntimeEvent }
  | { type: 'error'; error?: string }
  | { type: string; [key: string]: unknown };

interface ReviewExecutionProviderProps {
  baleybotId: string;
  children: ReactNode;
}

let messageIdCounter = 0;
function nextMessageId(): string {
  return `msg-${Date.now()}-${++messageIdCounter}`;
}

export function ReviewExecutionProvider({
  baleybotId,
  children,
}: ReviewExecutionProviderProps) {
  const [state, setState] = useState<ReviewExecutionState>({
    isExecuting: false,
    executionId: null,
    output: null,
    error: null,
    durationMs: null,
    graphEvents: [],
    messages: [],
    toolCalls: {},
    currentBlocks: [],
  });

  const outputAccRef = useRef('');
  const toolCallsRef = useRef<Record<string, ToolCallState>>({});
  const currentBlocksRef = useRef<ReviewContentBlock[]>([]);

  const execute = async (input: string | Record<string, unknown>) => {
    const inputText = typeof input === 'string' ? input : JSON.stringify(input);
    const startTime = Date.now();

    // Reset refs
    outputAccRef.current = '';
    toolCallsRef.current = {};
    currentBlocksRef.current = [];

    const userMessage: ReviewMessage = {
      id: nextMessageId(),
      role: 'user',
      content: inputText,
      blocks: [{ type: 'text', content: inputText }],
      toolCallStates: {},
      timestamp: Date.now(),
    };

    setState((prev) => ({
      ...prev,
      isExecuting: true,
      executionId: null,
      output: null,
      error: null,
      durationMs: null,
      graphEvents: [],
      toolCalls: {},
      currentBlocks: [],
      messages: [...prev.messages, userMessage],
    }));

    try {
      await streamPostSSE<ExecuteStreamEvent>({
        url: `/api/baleybots/${baleybotId}/execute-stream`,
        body: { input: inputText, triggeredBy: 'manual' },
        onEvent: (event) => {
          switch (event.type) {
            case 'execution_started': {
              if (event.executionId) {
                setState((prev) => ({
                  ...prev,
                  executionId: event.executionId as string,
                }));
              }
              break;
            }

            case 'text_delta': {
              const textContent = event.content as string | undefined;
              if (textContent) {
                outputAccRef.current += textContent;

                // Update currentBlocks: append to last text block or create new one
                const blocks = currentBlocksRef.current;
                const last = blocks[blocks.length - 1];
                if (last && last.type === 'text') {
                  last.content += textContent;
                } else {
                  blocks.push({ type: 'text', content: textContent });
                }
                currentBlocksRef.current = blocks;

                setState((prev) => ({
                  ...prev,
                  output: outputAccRef.current,
                  currentBlocks: [...currentBlocksRef.current],
                }));
              }
              break;
            }

            case 'tool_call_stream_start': {
              const tcId = event.id as string;
              const toolName = event.toolName as string;
              if (tcId && toolName) {
                toolCallsRef.current[tcId] = {
                  id: tcId,
                  toolName,
                  status: 'streaming_args',
                  arguments: '',
                  startTime: Date.now(),
                };
                currentBlocksRef.current.push({ type: 'tool_call', toolCallId: tcId });

                setState((prev) => ({
                  ...prev,
                  toolCalls: { ...toolCallsRef.current },
                  currentBlocks: [...currentBlocksRef.current],
                }));
              }
              break;
            }

            case 'tool_call_arguments_delta': {
              const tcId = event.id as string;
              const delta = event.argumentsDelta as string;
              if (tcId && delta && toolCallsRef.current[tcId]) {
                toolCallsRef.current[tcId] = {
                  ...toolCallsRef.current[tcId],
                  arguments: toolCallsRef.current[tcId].arguments + delta,
                };
                setState((prev) => ({
                  ...prev,
                  toolCalls: { ...toolCallsRef.current },
                }));
              }
              break;
            }

            case 'tool_call_stream_complete': {
              const tcId = event.id as string;
              if (tcId && toolCallsRef.current[tcId]) {
                let parsed: unknown = undefined;
                try {
                  parsed = JSON.parse(toolCallsRef.current[tcId].arguments);
                } catch {
                  // Arguments may not be valid JSON
                }
                toolCallsRef.current[tcId] = {
                  ...toolCallsRef.current[tcId],
                  status: 'args_complete',
                  parsedArguments: parsed,
                };
                setState((prev) => ({
                  ...prev,
                  toolCalls: { ...toolCallsRef.current },
                }));
              }
              break;
            }

            case 'tool_execution_start': {
              const tcId = event.id as string;
              if (tcId && toolCallsRef.current[tcId]) {
                toolCallsRef.current[tcId] = {
                  ...toolCallsRef.current[tcId],
                  status: 'executing',
                };
                setState((prev) => ({
                  ...prev,
                  toolCalls: { ...toolCallsRef.current },
                }));
              }
              break;
            }

            case 'tool_execution_output': {
              const tcId = event.id as string;
              if (tcId && toolCallsRef.current[tcId]) {
                const hasError = !!event.error;
                toolCallsRef.current[tcId] = {
                  ...toolCallsRef.current[tcId],
                  status: hasError ? 'error' : 'complete',
                  result: hasError ? undefined : event.result,
                  error: hasError ? (event.error as string) : undefined,
                  endTime: Date.now(),
                };
                setState((prev) => ({
                  ...prev,
                  toolCalls: { ...toolCallsRef.current },
                }));
              }
              break;
            }

            case 'graph_event': {
              if (event.graphEvent) {
                setState((prev) => ({
                  ...prev,
                  graphEvents: [...prev.graphEvents, event.graphEvent as GraphRuntimeEvent],
                }));
              }
              break;
            }

            case 'execution_result': {
              setState((prev) => ({
                ...prev,
                executionId: (event.executionId as string) ?? prev.executionId,
                durationMs: (event.durationMs as number) ?? (Date.now() - startTime),
              }));
              break;
            }

            case 'error': {
              setState((prev) => ({
                ...prev,
                error: (event.error as string) ?? 'Execution failed',
              }));
              break;
            }
          }
        },
      });

      // Finalize: snapshot blocks and tool calls into a ReviewMessage
      const finalOutput = outputAccRef.current;
      const finalBlocks = [...currentBlocksRef.current];
      const finalToolCalls = { ...toolCallsRef.current };

      const assistantMessage: ReviewMessage = {
        id: nextMessageId(),
        role: 'assistant',
        content: finalOutput || 'No output',
        blocks: finalBlocks.length > 0 ? finalBlocks : [{ type: 'text', content: finalOutput || 'No output' }],
        toolCallStates: finalToolCalls,
        timestamp: Date.now(),
      };

      setState((prev) => ({
        ...prev,
        isExecuting: false,
        output: finalOutput || prev.output,
        messages: [...prev.messages, assistantMessage],
        currentBlocks: [],
        toolCalls: {},
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Execution failed';
      setState((prev) => ({
        ...prev,
        isExecuting: false,
        error: message,
        currentBlocks: [],
        toolCalls: {},
      }));
    }
  };

  const clearResult = () => {
    outputAccRef.current = '';
    toolCallsRef.current = {};
    currentBlocksRef.current = [];
    setState({
      isExecuting: false,
      executionId: null,
      output: null,
      error: null,
      durationMs: null,
      graphEvents: [],
      messages: [],
      toolCalls: {},
      currentBlocks: [],
    });
  };

  return (
    <ReviewExecutionContext.Provider value={{ state, execute, clearResult }}>
      {children}
    </ReviewExecutionContext.Provider>
  );
}
