/**
 * Creator Streaming
 *
 * Runs the creator SSE stream as a standalone async function with explicit inputs.
 * Fixes the stale-closure bug by accepting all values as a config parameter
 * rather than capturing them from React component closures.
 */

import type { CreatorStreamEvent, CreatorOutput, PlanPreviewData } from './creator-types';
import type { ReadinessState } from './readiness';
import { streamPostSSE } from '@/lib/streaming/client-post-sse';

// ============================================================================
// TYPES
// ============================================================================

/**
 * All values the stream needs — passed explicitly, never captured from closures.
 * This fixes the stale-closure bug where state could change during a multi-second stream.
 */
export interface CreatorStreamConfig {
  message: string;
  conversationHistory: Array<{
    id: string;
    role: string;
    content: string;
    timestamp: string | Date;
    metadata?: Record<string, unknown>;
  }>;
  savedBaleybotId: string | null;
  balCode: string;
  name: string;
  description: string;
  icon: string;
  entities: Array<{ name: string; purpose?: string; tools?: string[] }>;
  viewMode: string;
  availableTabs: string[];
  lifecycleStage: string;
  readiness: ReadinessState;
  triggerConfigured: boolean;
  webhookEnabled: boolean;
}

/**
 * Callbacks for state updates — the caller (page component) wires these to setState.
 * Each callback does ONE thing, making the contract clear and testable.
 */
export interface CreatorStreamCallbacks {
  onStreamingText: (fullText: string) => void;
  onStreamingReasoning: (fullText: string) => void;
  onProgress: (phase: string, message: string) => void;
  onAgentEvent: (event: Record<string, unknown>, entityName?: string, timestamp?: number) => void;
  onConnectionAction: (action: string, result: Record<string, unknown>, timestamp: number) => void;
  onTriggerSaved: (config: unknown) => void;
  onWebhookEnabled: (url: string, secret: string) => void;
  onNavigateTab: (tab: string) => void;
  onShowPlan: (plan: PlanPreviewData) => void;
  onShowSurface: (surface: string, reason?: string) => void;
  onSpecialistSignals: (signals: {
    connections?: boolean;
    tests?: boolean;
    deployment?: boolean;
  }) => void;
  invalidateConnections: () => void;
  invalidateTriggerConfig: (baleybotId: string) => void;
  invalidateBot: (baleybotId: string) => void;
}

export interface CreatorStreamResult {
  result: CreatorOutput;
  summary?: string;
  streamedText: string;
}

// ============================================================================
// IMPLEMENTATION
// ============================================================================

/**
 * Runs the creator SSE stream. Manages its own text buffering (200ms throttle).
 * Returns the final result — does NOT call setState directly.
 */
export async function runCreatorStream(
  config: CreatorStreamConfig,
  callbacks: CreatorStreamCallbacks,
): Promise<CreatorStreamResult> {
  let finalResult: CreatorOutput | null = null;
  let finalSummary: string | undefined;

  // Internal text buffers — owned by this function, not by React
  let textBuffer = '';
  let reasoningBuffer = '';
  let throttleTimer: ReturnType<typeof setTimeout> | null = null;

  const flushBuffers = () => {
    if (throttleTimer) {
      clearTimeout(throttleTimer);
      throttleTimer = null;
    }
    callbacks.onStreamingText(textBuffer);
    callbacks.onStreamingReasoning(reasoningBuffer);
  };

  const scheduleFlush = () => {
    if (!throttleTimer) {
      throttleTimer = setTimeout(() => {
        callbacks.onStreamingText(textBuffer);
        callbacks.onStreamingReasoning(reasoningBuffer);
        throttleTimer = null;
      }, 200);
    }
  };

  callbacks.onProgress('discovery', 'Starting creator workflow...');

  await streamPostSSE<CreatorStreamEvent>({
    url: '/api/baleybots/creator/stream',
    body: {
      baleybotId: config.savedBaleybotId ?? undefined,
      message: config.message,
      conversationHistory: config.conversationHistory,
      currentState: config.balCode ? {
        balCode: config.balCode,
        name: config.name,
        description: config.description,
        icon: config.icon,
        entities: config.entities,
      } : undefined,
      uiState: {
        activeTab: config.viewMode,
        availableTabs: config.availableTabs,
        lifecycleStage: config.lifecycleStage,
        readinessSummary: Object.entries(config.readiness)
          .map(([dim, status]) => `${dim} (${status})`)
          .join(', '),
        triggerConfigured: config.triggerConfigured,
        webhookEnabled: config.webhookEnabled,
      },
    },
    onEvent: (event) => {
      try {
        if (event.type === 'creator_stream_started') {
          callbacks.onProgress('discovery', 'Understanding your request...');
          return;
        }

        // Agent activity events (for expandable activity panel)
        if (event.type === 'creator_agent_event') {
          if (event.event) {
            const agentEvent = event.event as Record<string, unknown>;

            // Capture top-level reasoning from creator_bot
            if (agentEvent.type === 'reasoning' && agentEvent.content) {
              reasoningBuffer += String(agentEvent.content);
              scheduleFlush();
            }

            callbacks.onAgentEvent(
              agentEvent,
              event.entityName,
              event.timestamp,
            );
          }
          return;
        }

        // Connection action events -> visual action cards
        if (event.type === 'creator_connection_action') {
          if (event.result) {
            callbacks.onConnectionAction(
              event.action ?? 'unknown',
              event.result,
              event.timestamp ?? Date.now(),
            );
          }
          callbacks.invalidateConnections();
          return;
        }

        // Integration events from companion tools
        if (event.type === 'creator_trigger_saved') {
          if (event.triggerConfig) {
            callbacks.onTriggerSaved(event.triggerConfig);
            if (config.savedBaleybotId) {
              callbacks.invalidateTriggerConfig(config.savedBaleybotId);
            }
          }
          return;
        }

        if (event.type === 'creator_webhook_enabled') {
          if (event.webhookUrl && event.webhookSecret) {
            callbacks.onWebhookEnabled(event.webhookUrl, event.webhookSecret);
          }
          if (config.savedBaleybotId) {
            callbacks.invalidateBot(config.savedBaleybotId);
          }
          return;
        }

        if (event.type === 'creator_navigate_tab') {
          if (event.tab) {
            callbacks.onNavigateTab(event.tab);
          }
          return;
        }

        if (event.type === 'creator_show_plan') {
          if (event.plan) {
            callbacks.onShowPlan(event.plan);
          }
          return;
        }

        if (event.type === 'creator_show_surface') {
          if (event.surface) {
            callbacks.onShowSurface(event.surface, event.reason);
          }
          return;
        }

        // Show streaming text in chat
        if (event.type === 'creator_text_delta') {
          const content = event.content ?? '';
          if (content) {
            textBuffer += content;
            scheduleFlush();
          }
          return;
        }

        if (event.type === 'creator_progress') {
          const phase = event.phase ?? 'building';
          const progressMessage = event.message?.trim() || 'Building...';
          callbacks.onProgress(phase, progressMessage);
          return;
        }

        if (event.type === 'creator_complete') {
          if (event.result) {
            finalResult = event.result;
          }
          finalSummary =
            event.summary?.trim() ||
            'Creator completed the response.';

          // Capture specialist findings for readiness enrichment
          if (event.specialist) {
            callbacks.onSpecialistSignals({
              connections: event.specialist.connections != null ? true : undefined,
              tests: event.specialist.tests != null ? true : undefined,
              deployment: event.specialist.deployment != null ? true : undefined,
            });
          }

          callbacks.onProgress('complete', finalSummary || 'Ready!');
          return;
        }

        if (event.type === 'creator_error') {
          throw new Error(event.message || 'Creator stream failed');
        }
      } catch (eventError) {
        // Don't let a single malformed event kill the entire stream
        if (event.type === 'creator_error') throw eventError;
        console.warn('Error processing creator stream event:', event.type, eventError);
      }
    },
  });

  // Flush any remaining buffered text
  flushBuffers();

  // Capture final streamed text before clearing
  const streamedText = textBuffer.trim();

  // If the concierge streamed text but no structured result (conversation-only turn),
  // build a synthetic building response from the streamed text
  if (!finalResult && streamedText) {
    finalResult = {
      status: 'building' as const,
      message: streamedText,
      entities: [],
      connections: [],
      balCode: '',
      name: 'Unnamed BaleyBot',
      description: '',
      icon: '\u{1F916}',
    };
  }

  if (!finalResult) {
    // Stream completed but produced neither a creator_complete event nor streamed text.
    // Return empty message so the caller can surface a system notice.
    finalResult = {
      status: 'building' as const,
      message: '',
      entities: [],
      connections: [],
      balCode: '',
      name: 'Unnamed BaleyBot',
      description: '',
      icon: '\u{1F916}',
    };
  }

  return {
    result: finalResult,
    summary: finalSummary,
    streamedText,
  };
}
