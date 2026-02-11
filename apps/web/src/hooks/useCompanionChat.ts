/**
 * Companion Chat Hook
 *
 * Manages state for the Baley companion assistant.
 * Sends messages via SSE to /api/companion/stream and parses streaming events.
 */

'use client';

import { useState, useRef, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { useRouter } from 'next/navigation';
import { useWorkspaceHealth } from './useWorkspaceHealth';
import type { ChatMessage, ContentBlock } from '@/components/companion/ChatMode';

interface PendingInput {
  executionId: string;
  question: string;
}

export function useCompanionChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [pendingInput, setPendingInput] = useState<PendingInput | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  // RAF batching: accumulate text deltas and flush once per animation frame
  const pendingDeltaRef = useRef('');
  const rafIdRef = useRef<number | null>(null);
  const currentAssistantIdRef = useRef<string | null>(null);
  const pathname = usePathname();
  const router = useRouter();
  const health = useWorkspaceHealth();

  // Cleanup RAF on unmount
  useEffect(() => {
    return () => {
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
      }
    };
  }, []);

  /** Flush accumulated text deltas into React state (called once per frame) */
  const flushPendingDelta = () => {
    rafIdRef.current = null;
    const delta = pendingDeltaRef.current;
    if (!delta) return;
    pendingDeltaRef.current = '';
    const assistantId = currentAssistantIdRef.current;
    if (!assistantId) return;

    setMessages((prev) =>
      prev.map((m) => {
        if (m.id !== assistantId) return m;
        const blocks = [...(m.blocks ?? [])];
        const lastBlock = blocks[blocks.length - 1];
        if (lastBlock && lastBlock.type === 'text') {
          blocks[blocks.length - 1] = {
            ...lastBlock,
            content: lastBlock.content + delta,
          };
        } else {
          blocks.push({ type: 'text', content: delta });
        }
        return {
          ...m,
          content: m.content + delta,
          blocks,
        };
      })
    );
  };

  const send = async (message: string) => {
    if (isStreaming) return;

    // Add user message
    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: message,
      timestamp: new Date(),
      status: 'sent',
    };
    setMessages((prev) => [...prev, userMsg]);

    // Create placeholder for assistant response with empty blocks
    const assistantId = `assistant-${Date.now()}`;
    const assistantMsg: ChatMessage = {
      id: assistantId,
      role: 'assistant',
      content: '',
      blocks: [],
      timestamp: new Date(),
      status: 'sending',
    };
    setMessages((prev) => [...prev, assistantMsg]);

    setIsStreaming(true);
    abortRef.current = new AbortController();
    currentAssistantIdRef.current = assistantId;

    try {
      const conversationHistory = messages.map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
        timestamp: m.timestamp.toISOString(),
      }));

      const response = await fetch('/api/companion/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message,
          conversationHistory,
          context: {
            currentPage: pathname,
            healthSummary: health.summary,
          },
        }),
        signal: abortRef.current.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No response body');

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6).trim();
          if (data === '[DONE]') continue;

          try {
            const event = JSON.parse(data);

            switch (event.type) {
              case 'companion_text_delta': {
                // Accumulate deltas and flush via RAF (one React update per frame)
                pendingDeltaRef.current += event.content ?? '';
                if (rafIdRef.current === null) {
                  rafIdRef.current = requestAnimationFrame(flushPendingDelta);
                }
                break;
              }

              case 'companion_tool_start':
                setMessages((prev) =>
                  prev.map((m) => {
                    if (m.id !== assistantId) return m;
                    const blocks: ContentBlock[] = [...(m.blocks ?? [])];
                    blocks.push({
                      type: 'tool_call',
                      id: event.toolCallId ?? `tool-${Date.now()}`,
                      toolName: event.toolName ?? 'unknown',
                      status: 'running',
                    });
                    return { ...m, blocks };
                  })
                );
                break;

              case 'companion_tool_result': {
                // Handle navigation actions
                if (
                  event.result &&
                  typeof event.result === 'object' &&
                  event.result.action === 'navigate'
                ) {
                  router.push(event.result.path);
                }

                // Update matching tool_call block to complete
                setMessages((prev) =>
                  prev.map((m) => {
                    if (m.id !== assistantId) return m;
                    const blocks = (m.blocks ?? []).map((block) => {
                      if (
                        block.type === 'tool_call' &&
                        block.toolName === event.toolName &&
                        block.status === 'running'
                      ) {
                        return {
                          ...block,
                          status: event.error ? ('error' as const) : ('complete' as const),
                          result: event.result
                            ? typeof event.result === 'string'
                              ? event.result
                              : JSON.stringify(event.result).substring(0, 500)
                            : undefined,
                          error: event.error
                            ? typeof event.error === 'string'
                              ? event.error
                              : JSON.stringify(event.error)
                            : undefined,
                        };
                      }
                      return block;
                    });
                    return { ...m, blocks };
                  })
                );
                break;
              }

              case 'companion_input_requested':
                setPendingInput({
                  executionId: event.toolCallId,
                  question:
                    typeof event.question === 'string'
                      ? event.question
                      : JSON.stringify(event.question),
                });
                break;

              case 'companion_complete':
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantId
                      ? {
                          ...m,
                          content: m.content || (event.output ?? ''),
                          status: 'sent' as const,
                        }
                      : m
                  )
                );
                break;

              case 'companion_error':
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantId
                      ? {
                          ...m,
                          content: event.message || 'Something went wrong.',
                          status: 'error' as const,
                        }
                      : m
                  )
                );
                break;
            }
          } catch {
            // Skip malformed JSON
          }
        }
      }
    } catch (error) {
      if ((error as Error).name === 'AbortError') return;
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? {
                ...m,
                content:
                  m.content ||
                  (error instanceof Error
                    ? error.message
                    : 'Connection failed'),
                status: 'error' as const,
              }
            : m
        )
      );
    } finally {
      // Flush any remaining batched text deltas
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
      flushPendingDelta();
      currentAssistantIdRef.current = null;
      setIsStreaming(false);
      abortRef.current = null;
    }
  };

  const respond = async (executionId: string, response: string) => {
    setPendingInput(null);
    try {
      await fetch('/api/companion/respond', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ executionId, response }),
      });
    } catch (error) {
      console.error('Failed to send companion response:', error);
    }
  };

  const stop = () => {
    abortRef.current?.abort();
    setIsStreaming(false);
  };

  const clear = () => {
    setMessages([]);
    setPendingInput(null);
  };

  return {
    messages,
    isStreaming,
    send,
    respond,
    stop,
    clear,
    pendingInput,
    health,
  };
}
