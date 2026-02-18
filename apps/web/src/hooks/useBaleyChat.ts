/**
 * Unified Baley Chat Hook
 *
 * Single hook for all Baley chat interactions (companion and creator) that:
 *
 * 1. Uses `useStreamState` (SDK-aligned reducer) for stream processing
 * 2. Sends to `/api/baley/stream` (the unified route)
 * 3. Supports both general and creator modes via config
 * 4. No manual RAF batching — the SDK reducer handles text accumulation
 *
 * Produces ChatMessage objects with SDK-aligned StreamSegment[] for rendering
 * via the unified chat component library (SegmentRenderer).
 */

'use client';

import { useState, useRef, useReducer, useCallback, useMemo } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useWorkspaceHealth } from './useWorkspaceHealth';
import {
  streamReducer,
  createInitialAppStreamState,
  type AppStreamState,
} from '@/hooks/useStreamState';
import type { ChatMessage, ChatAttachment } from '@/components/chat';
import type { StreamSegment, TextSegment } from '@baleybots/chat';
import { finalizeSegments, getTextContent } from '@baleybots/chat';
import { stripLargeJsonBlocks } from '@/components/chat/utils/strip-json';
import type { ServerStreamEvent } from '@/lib/streaming/types';
import type { CreatorOutput, PlanPreviewData } from '@/lib/baleybot/creator-types';
import type { TriggerConfig } from '@/lib/baleybot/types';

// ============================================================================
// Navigation request types
// ============================================================================

/** A pending navigation that requires user confirmation. */
export interface PendingNavigation {
  id: string;
  path: string;
  label: string;
  reason?: string;
  createdAt: number;
}

// ============================================================================
// Types
// ============================================================================

/** Pending input request from the companion (e.g., approval prompts). */
export interface PendingInput {
  executionId: string;
  question: string;
}

/** Specialist findings from the creator pipeline. */
export interface SpecialistFindings {
  connections: unknown | null;
  tests: unknown | null;
  deployment: unknown | null;
}

/** Return type of useWorkspaceHealth */
export type WorkspaceHealth = ReturnType<typeof useWorkspaceHealth>;

/** Configuration for the useBaleyChat hook. */
export interface UseBaleyConfig {
  /** Operating mode: 'general' for companion, 'creator' for bot builder, 'canvas' for live app builder. */
  mode?: 'general' | 'creator' | 'canvas';

  /** Callbacks for creator-specific events (only used when mode is 'creator'). */
  creatorCallbacks?: {
    onConnectionAction?: (action: string, result: unknown) => void;
    onTriggerSaved?: (config: TriggerConfig) => void;
    onWebhookEnabled?: (url: string, secret: string) => void;
    onShowPlan?: (plan: PlanPreviewData) => void;
    onShowSurface?: (surface: string, reason?: string) => void;
    onCreatorComplete?: (result: CreatorOutput, specialist: SpecialistFindings) => void;
  };

  /** Context passed to the creator pipeline (only used when mode is 'creator'). */
  creatorContext?: {
    baleybotId?: string;
    currentState?: {
      balCode: string;
      name?: string;
      description?: string;
      icon?: string;
      entities?: Array<{ name: string; purpose?: string; tools?: string[] }>;
    };
    uiState?: {
      activeTab: string;
      availableTabs: string[];
      lifecycleStage: string;
      readinessSummary: string;
      triggerConfigured: boolean;
      webhookEnabled: boolean;
    };
  };

  /** Context passed to the canvas builder (only used when mode is 'canvas'). */
  canvasContext?: {
    sessionId: string;
    scaffoldTemplate?: string;
    designPackageId?: string;
  };

  /** Callbacks for canvas-specific events (only used when mode is 'canvas'). */
  canvasCallbacks?: {
    onFileOp?: (op: { type: 'write' | 'delete'; path: string; content?: string }) => void;
    onRunCommand?: (command: string) => void;
    onPresentPlan?: (plan: PlanPreviewData) => void;
    onDeploy?: (method: string, name: string) => void;
    onRequestErrors?: () => void;
  };
}

// ============================================================================
// Hook
// ============================================================================

export function useBaleyChat(config?: UseBaleyConfig) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [pendingInput, setPendingInput] = useState<PendingInput | null>(null);
  const [pendingNavigations, setPendingNavigations] = useState<PendingNavigation[]>([]);
  const [lastCreatorResult, setLastCreatorResult] = useState<CreatorOutput>();
  const [lastSpecialistFindings, setLastSpecialistFindings] = useState<SpecialistFindings>();
  const [streamState, dispatch] = useReducer(streamReducer, createInitialAppStreamState());
  const streamStateRef = useRef(streamState);
  streamStateRef.current = streamState;

  const abortRef = useRef<AbortController | null>(null);
  const currentAssistantIdRef = useRef<string | null>(null);

  // RAF batching: queue stream events and flush once per animation frame
  const eventQueueRef = useRef<ServerStreamEvent[]>([]);
  const rafIdRef = useRef<number | null>(null);

  const flushEventQueue = useCallback(() => {
    rafIdRef.current = null;
    const events = eventQueueRef.current;
    if (events.length === 0) return;
    eventQueueRef.current = [];
    dispatch({ type: 'PROCESS_BATCH', events });
  }, []);

  const queueEvent = useCallback((event: ServerStreamEvent) => {
    eventQueueRef.current.push(event);
    if (rafIdRef.current === null) {
      rafIdRef.current = requestAnimationFrame(flushEventQueue);
    }
  }, [flushEventQueue]);

  const pathname = usePathname();
  const router = useRouter();
  const health = useWorkspaceHealth();

  // --------------------------------------------------------------------------
  // send — main entry point for sending a message
  // --------------------------------------------------------------------------

  const send = useCallback(async (message: string, attachments?: ChatAttachment[]) => {
    if (isStreaming) return;

    // Clear stale navigation requests when user sends a new message
    setPendingNavigations([]);

    // Add user message
    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: message,
      attachments: attachments && attachments.length > 0 ? attachments : undefined,
      timestamp: new Date(),
      status: 'complete',
    };
    setMessages(prev => [...prev, userMsg]);

    // Create assistant placeholder with empty segments
    const assistantId = `assistant-${Date.now()}`;
    const assistantMsg: ChatMessage = {
      id: assistantId,
      role: 'assistant',
      content: '',
      segments: [],
      timestamp: new Date(),
      status: 'streaming',
    };
    setMessages(prev => [...prev, assistantMsg]);
    currentAssistantIdRef.current = assistantId;

    setIsStreaming(true);
    dispatch({ type: 'START_STREAM', botId: 'baley', botName: 'Baley' });
    abortRef.current = new AbortController();

    try {
      // Build conversation history from current messages (before adding user msg above)
      const conversationHistory = messages.map(m => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
        timestamp: m.timestamp.toISOString(),
      }));

      const body: Record<string, unknown> = {
        message,
        conversationHistory,
        context: {
          currentPage: pathname,
          healthSummary: health.summary,
          pendingActions: {
            total: health.pendingActions ?? 0,
            critical: health.criticalActions ?? 0,
          },
        },
        // Include attachment metadata for multimodal processing
        ...(attachments && attachments.length > 0 && {
          attachments: attachments.map(a => ({
            fileName: a.fileName,
            mimeType: a.mimeType,
            downloadUrl: a.downloadUrl,
          })),
        }),
      };

      // Add creator context if in creator mode
      if (config?.mode === 'creator' && config.creatorContext) {
        body.creatorContext = config.creatorContext;
      }

      // Add canvas context if in canvas mode
      if (config?.mode === 'canvas' && config.canvasContext) {
        body.canvasContext = config.canvasContext;
      }

      const response = await fetch('/api/baley/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
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

            // ----------------------------------------------------------------
            // SDK stream events — fed to the reducer
            // ----------------------------------------------------------------
            if (event.type === 'stream_event') {
              const serverEvent = event as ServerStreamEvent;
              queueEvent(serverEvent);

              // Check for action objects in tool results
              const inner = serverEvent.event;
              if (
                inner.type === 'tool_execution_output' &&
                inner.result &&
                typeof inner.result === 'object'
              ) {
                const result = inner.result as Record<string, unknown>;
                const actionType = result.action as string | undefined;

                if (actionType === 'navigate_request') {
                  const path = result.path as string;
                  const label = (result.label as string) ?? path;
                  const reason = result.reason as string | undefined;
                  if (path) {
                    setPendingNavigations((prev) => [
                      ...prev,
                      {
                        id: `nav-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                        path,
                        label,
                        reason,
                        createdAt: Date.now(),
                      },
                    ]);
                  }
                } else if (actionType === 'show_surface') {
                  const surface = result.surface as string;
                  const reason = result.reason as string | undefined;
                  if (surface) {
                    config?.creatorCallbacks?.onShowSurface?.(surface, reason);
                  }
                } else if (actionType === 'show_plan') {
                  const plan = result.plan as PlanPreviewData | undefined;
                  if (plan) {
                    config?.creatorCallbacks?.onShowPlan?.(plan);
                  }
                }
              }
            }

            // ----------------------------------------------------------------
            // Stream lifecycle events
            // ----------------------------------------------------------------
            else if (event.type === 'complete') {
              // Handled in finally block — segment finalization
            }

            else if (event.type === 'error') {
              setMessages(prev =>
                prev.map(m =>
                  m.id === assistantId
                    ? {
                        ...m,
                        content: event.message || 'Something went wrong.',
                        status: 'error' as const,
                      }
                    : m
                )
              );
            }

            else if (event.type === 'heartbeat') {
              // no-op — keeps the connection alive
            }

            // ----------------------------------------------------------------
            // Input request (companion approval / follow-up question)
            // ----------------------------------------------------------------
            else if (event.type === 'input_requested') {
              setPendingInput({
                executionId: event.toolCallId ?? event.executionId ?? '',
                question:
                  typeof event.question === 'string'
                    ? event.question
                    : JSON.stringify(event.question),
              });
            }

            // ----------------------------------------------------------------
            // Creator-specific events
            // ----------------------------------------------------------------
            else if (event.type === 'creator_complete') {
              const result = event.result as CreatorOutput | undefined;
              const specialist = (event.specialist ?? {
                connections: null,
                tests: null,
                deployment: null,
              }) as SpecialistFindings;

              if (result) {
                setLastCreatorResult(result);
                setLastSpecialistFindings(specialist);
                config?.creatorCallbacks?.onCreatorComplete?.(result, specialist);
              }
            }

            else if (event.type === 'creator_connection_action') {
              config?.creatorCallbacks?.onConnectionAction?.(
                event.action ?? 'unknown',
                event.result
              );
            }

            else if (event.type === 'creator_trigger_saved') {
              if (event.triggerConfig) {
                config?.creatorCallbacks?.onTriggerSaved?.(event.triggerConfig as TriggerConfig);
              }
            }

            else if (event.type === 'creator_webhook_enabled') {
              if (event.webhookUrl && event.webhookSecret) {
                config?.creatorCallbacks?.onWebhookEnabled?.(
                  event.webhookUrl as string,
                  event.webhookSecret as string
                );
              }
            }

            // creator_navigate_tab, creator_show_plan, creator_show_surface
            // are now handled via action objects in tool_execution_output above.

            // ----------------------------------------------------------------
            // Canvas-specific events
            // ----------------------------------------------------------------
            else if (event.type === 'canvas_file_op') {
              const op = event.op as string;
              const path = event.path as string;
              const content = event.content as string | undefined;
              if (op === 'write' && path) {
                config?.canvasCallbacks?.onFileOp?.({ type: 'write', path, content });
              } else if (op === 'delete' && path) {
                config?.canvasCallbacks?.onFileOp?.({ type: 'delete', path });
              }
            }

            else if (event.type === 'canvas_run_command') {
              const command = event.command as string;
              if (command) {
                config?.canvasCallbacks?.onRunCommand?.(command);
              }
            }

            else if (event.type === 'canvas_present_plan') {
              const plan = event.plan as PlanPreviewData | undefined;
              if (plan) {
                config?.canvasCallbacks?.onPresentPlan?.(plan);
              }
            }

            else if (event.type === 'canvas_deploy') {
              config?.canvasCallbacks?.onDeploy?.(
                event.method as string,
                event.name as string,
              );
            }

            else if (event.type === 'canvas_request_errors') {
              config?.canvasCallbacks?.onRequestErrors?.();
            }
          } catch {
            // Skip malformed JSON lines
          }
        }
      }
    } catch (error) {
      if ((error as Error).name === 'AbortError') return;

      setMessages(prev =>
        prev.map(m =>
          m.id === assistantId
            ? {
                ...m,
                content:
                  m.content ||
                  (error instanceof Error ? error.message : 'Connection failed'),
                status: 'error' as const,
              }
            : m
        )
      );
    } finally {
      // Flush any remaining RAF-queued events synchronously before finalizing
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
      if (eventQueueRef.current.length > 0) {
        const remaining = eventQueueRef.current;
        eventQueueRef.current = [];
        dispatch({ type: 'PROCESS_BATCH', events: remaining });
      }

      // Finalize: read segments from streamState, update the assistant message,
      // then reset streamState for the next turn.
      const finalAssistantId = currentAssistantIdRef.current;
      currentAssistantIdRef.current = null;
      setIsStreaming(false);
      abortRef.current = null;

      if (finalAssistantId) {
        // We need to use a functional update to capture the latest streamState
        // at the time of finalization. Because `dispatch` is synchronous within
        // the same microtask, the `streamState` in the outer closure reflects
        // the latest reduced state.
        //
        // Use finalizeSegments to mark isStreaming=false on text/reasoning
        // segments, and getTextContent for the plain-text fallback.
        setMessages(prev =>
          prev.map((m): ChatMessage => {
            if (m.id !== finalAssistantId) return m;

            // If the message already has an error status (set by error handlers
            // above), don't overwrite it.
            if (m.status === 'error') return m;

            const finalizedSegments = finalizeSegments(streamStateRef.current.segmentState).map(
              (seg: StreamSegment) => {
                if (seg.type === 'text') {
                  const textSeg = seg as TextSegment;
                  return { ...textSeg, content: stripLargeJsonBlocks(textSeg.content) };
                }
                return seg;
              }
            );
            const textContent = getTextContent(streamStateRef.current.segmentState);

            return {
              ...m,
              content: textContent || m.content,
              segments: finalizedSegments.length > 0 ? finalizedSegments : m.segments,
              status: 'complete' as const,
            };
          })
        );
      }

      // Reset the stream state for the next turn
      dispatch({ type: 'RESET' });
    }
  }, [isStreaming, messages, pathname, health, config, router, queueEvent]);

  // --------------------------------------------------------------------------
  // respond — answer a pending input request
  // --------------------------------------------------------------------------

  const respond = useCallback(async (executionId: string, response: string) => {
    setPendingInput(null);
    try {
      await fetch('/api/companion/respond', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ executionId, response }),
      });
    } catch (error) {
      console.error('Failed to send response:', error);
    }
  }, []);

  // --------------------------------------------------------------------------
  // stop — abort the current stream
  // --------------------------------------------------------------------------

  const stop = useCallback(() => {
    abortRef.current?.abort();

    // Flush remaining RAF-queued events synchronously before cancelling
    if (rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }
    if (eventQueueRef.current.length > 0) {
      const remaining = eventQueueRef.current;
      eventQueueRef.current = [];
      dispatch({ type: 'PROCESS_BATCH', events: remaining });
    }

    setIsStreaming(false);
    dispatch({ type: 'CANCEL' });

    // Finalize any in-progress assistant message
    const assistantId = currentAssistantIdRef.current;
    if (assistantId) {
      const finalizedSegments = finalizeSegments(streamStateRef.current.segmentState).map(
        (seg: StreamSegment) => {
          if (seg.type === 'text') {
            const textSeg = seg as TextSegment;
            return { ...textSeg, content: stripLargeJsonBlocks(textSeg.content) };
          }
          return seg;
        }
      );
      const textContent = getTextContent(streamStateRef.current.segmentState);

      setMessages(prev =>
        prev.map((m): ChatMessage => {
          if (m.id !== assistantId) return m;
          return {
            ...m,
            content: textContent || m.content,
            segments: finalizedSegments.length > 0 ? finalizedSegments : m.segments,
            status: 'complete' as const,
          };
        })
      );
      currentAssistantIdRef.current = null;
    }

    dispatch({ type: 'RESET' });
  }, []);

  // --------------------------------------------------------------------------
  // clear — reset all state
  // --------------------------------------------------------------------------

  const clear = useCallback(() => {
    setMessages([]);
    setPendingInput(null);
    setPendingNavigations([]);
    setLastCreatorResult(undefined);
    setLastSpecialistFindings(undefined);
    dispatch({ type: 'RESET' });
    currentAssistantIdRef.current = null;
  }, []);

  // --------------------------------------------------------------------------
  // approveNavigation — user approves a pending navigation request
  // --------------------------------------------------------------------------

  const approveNavigation = (navId: string) => {
    const nav = pendingNavigations.find((n) => n.id === navId);
    setPendingNavigations((prev) => prev.filter((n) => n.id !== navId));
    if (nav) {
      router.push(nav.path);
    }
  };

  // --------------------------------------------------------------------------
  // dismissNavigation — user dismisses a pending navigation request
  // --------------------------------------------------------------------------

  const dismissNavigation = useCallback((navId: string) => {
    setPendingNavigations((prev) => prev.filter((n) => n.id !== navId));
  }, []);

  // --------------------------------------------------------------------------
  // Enriched messages — merge live streaming segments into the active message
  // --------------------------------------------------------------------------

  const enrichedMessages = useMemo(() => {
    const activeId = currentAssistantIdRef.current;
    if (!isStreaming || !activeId) return messages;

    const liveSegments = streamState.segmentState.segments;
    if (!liveSegments || liveSegments.length === 0) return messages;

    return messages.map(m => {
      if (m.id !== activeId) return m;
      return { ...m, segments: [...liveSegments] };
    });
  }, [messages, isStreaming, streamState]);

  // --------------------------------------------------------------------------
  // Return
  // --------------------------------------------------------------------------

  return {
    messages: enrichedMessages,
    isStreaming,
    send,
    respond,
    stop,
    clear,
    streamState,
    pendingInput,
    pendingNavigations,
    approveNavigation,
    dismissNavigation,
    health,
    lastCreatorResult,
    lastSpecialistFindings,
  };
}
