/**
 * @baleyui/react Hooks
 */

import { useState, useCallback, useRef } from 'react';
import { BaleyUI } from '@baleyui/sdk';
import type { ExecutionEvent, Execution } from '@baleyui/sdk';
import type { FlowRunnerState, ChatMessage, ChatWidgetState } from './types';

// ============================================================================
// useBaleyUI Hook
// ============================================================================

interface UseBaleyUIOptions {
  apiKey: string;
  baseUrl?: string;
}

export function useBaleyUI({ apiKey, baseUrl }: UseBaleyUIOptions): BaleyUI {
  const clientRef = useRef<BaleyUI | null>(null);

  if (!clientRef.current) {
    clientRef.current = new BaleyUI({ apiKey, baseUrl });
  }

  return clientRef.current;
}

// ============================================================================
// useFlowRunner Hook
// ============================================================================

interface UseFlowRunnerOptions {
  apiKey: string;
  baseUrl?: string;
  flowId: string;
  onStart?: (executionId: string) => void;
  onEvent?: (event: ExecutionEvent) => void;
  onComplete?: (execution: Execution) => void;
  onError?: (error: Error) => void;
}

interface UseFlowRunnerReturn extends FlowRunnerState {
  execute: (input?: Record<string, unknown>) => Promise<void>;
  reset: () => void;
}

export function useFlowRunner({
  apiKey,
  baseUrl,
  flowId,
  onStart,
  onEvent,
  onComplete,
  onError,
}: UseFlowRunnerOptions): UseFlowRunnerReturn {
  const client = useBaleyUI({ apiKey, baseUrl });
  const [state, setState] = useState<FlowRunnerState>({
    status: 'idle',
    executionId: null,
    events: [],
    result: null,
    error: null,
  });

  const execute = useCallback(
    async (input: Record<string, unknown> = {}) => {
      setState({
        status: 'running',
        executionId: null,
        events: [],
        result: null,
        error: null,
      });

      try {
        const handle = await client.flows.execute(flowId, { input });

        setState((prev) => ({
          ...prev,
          executionId: handle.id,
        }));

        onStart?.(handle.id);

        // Stream events
        const events: ExecutionEvent[] = [];
        for await (const event of handle.stream()) {
          events.push(event);
          setState((prev) => ({
            ...prev,
            events: [...events],
          }));
          onEvent?.(event);
        }

        // Get final result
        const result = await handle.getStatus();

        setState((prev) => ({
          ...prev,
          status: result.status === 'failed' ? 'error' : 'completed',
          result,
        }));

        onComplete?.(result);
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        setState((prev) => ({
          ...prev,
          status: 'error',
          error: err,
        }));
        onError?.(err);
      }
    },
    [client, flowId, onStart, onEvent, onComplete, onError]
  );

  const reset = useCallback(() => {
    setState({
      status: 'idle',
      executionId: null,
      events: [],
      result: null,
      error: null,
    });
  }, []);

  return {
    ...state,
    execute,
    reset,
  };
}

// ============================================================================
// useChatWidget Hook
// ============================================================================

interface UseChatWidgetOptions {
  apiKey: string;
  baseUrl?: string;
  blockId: string;
  initialMessages?: ChatMessage[];
  onMessageSent?: (message: string) => void;
  onResponse?: (response: string) => void;
  onError?: (error: Error) => void;
}

interface UseChatWidgetReturn extends ChatWidgetState {
  sendMessage: (content: string) => Promise<void>;
  clearMessages: () => void;
}

let messageIdCounter = 0;
function generateMessageId(): string {
  return `msg-${Date.now()}-${++messageIdCounter}`;
}

export function useChatWidget({
  apiKey,
  baseUrl,
  blockId,
  initialMessages = [],
  onMessageSent,
  onResponse,
  onError,
}: UseChatWidgetOptions): UseChatWidgetReturn {
  const client = useBaleyUI({ apiKey, baseUrl });
  const [state, setState] = useState<ChatWidgetState>({
    messages: initialMessages,
    isLoading: false,
    error: null,
  });

  const sendMessage = useCallback(
    async (content: string) => {
      if (!content.trim()) return;

      // Add user message
      const userMessage: ChatMessage = {
        id: generateMessageId(),
        role: 'user',
        content: content.trim(),
        timestamp: new Date(),
      };

      setState((prev) => ({
        ...prev,
        messages: [...prev.messages, userMessage],
        isLoading: true,
        error: null,
      }));

      onMessageSent?.(content);

      try {
        // Create streaming assistant message
        const assistantMessage: ChatMessage = {
          id: generateMessageId(),
          role: 'assistant',
          content: '',
          timestamp: new Date(),
          isStreaming: true,
        };

        setState((prev) => ({
          ...prev,
          messages: [...prev.messages, assistantMessage],
        }));

        // Execute block with chat context
        const handle = await client.blocks.run(blockId, {
          input: {
            message: content,
            history: state.messages.map((m) => ({
              role: m.role,
              content: m.content,
            })),
          },
        });

        // Stream response
        let fullContent = '';
        for await (const event of handle.stream()) {
          // Handle node_complete events which contain output
          if (event.type === 'node_complete' && event.data?.output) {
            const output = event.data.output;
            if (typeof output === 'string') {
              fullContent = output;
            } else if (typeof output === 'object' && output !== null && 'content' in output) {
              fullContent = String((output as { content: unknown }).content);
            }

            setState((prev) => ({
              ...prev,
              messages: prev.messages.map((m) =>
                m.id === assistantMessage.id
                  ? { ...m, content: fullContent }
                  : m
              ),
            }));
          }
          // Handle node_stream events for real-time streaming
          if (event.type === 'node_stream' && event.data?.content) {
            fullContent += String(event.data.content);

            setState((prev) => ({
              ...prev,
              messages: prev.messages.map((m) =>
                m.id === assistantMessage.id
                  ? { ...m, content: fullContent }
                  : m
              ),
            }));
          }
        }

        // Mark streaming complete
        setState((prev) => ({
          ...prev,
          isLoading: false,
          messages: prev.messages.map((m) =>
            m.id === assistantMessage.id
              ? { ...m, isStreaming: false, content: fullContent }
              : m
          ),
        }));

        onResponse?.(fullContent);
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        setState((prev) => ({
          ...prev,
          isLoading: false,
          error: err,
          // Remove the streaming message on error
          messages: prev.messages.filter((m) => !m.isStreaming),
        }));
        onError?.(err);
      }
    },
    [client, blockId, state.messages, onMessageSent, onResponse, onError]
  );

  const clearMessages = useCallback(() => {
    setState({
      messages: [],
      isLoading: false,
      error: null,
    });
  }, []);

  return {
    ...state,
    sendMessage,
    clearMessages,
  };
}
