/**
 * Design Calibration Streaming Orchestrator
 *
 * Frontend streaming client for the design calibration SSE endpoint.
 * Uses streamPostSSE to parse events and dispatches to typed callbacks.
 * The wizard component wires callbacks to refs + setState.
 */

import type { DesignPackageData } from './types';
import { streamPostSSE } from '@/lib/streaming/client-post-sse';

// ============================================================================
// Config & Callbacks
// ============================================================================

export interface DesignCalibrationStreamConfig {
  message: string;
  conversationHistory?: Array<{
    id: string;
    role: string;
    content: string;
    timestamp: number;
  }>;
  existingPackageData?: DesignPackageData;
}

export interface DesignCalibrationCallbacks {
  // SDK-standard event handlers
  onTextDelta: (content: string) => void;
  onToolCallStart: (id: string, toolName: string) => void;
  onToolCallArgsDelta: (id: string, delta: string) => void;
  onToolCallComplete: (id: string, toolName: string, args: string) => void;
  onToolExecStart: (id: string, toolName: string) => void;
  onToolExecOutput: (id: string, toolName: string, result?: unknown, error?: string) => void;
  // Design-specific events
  onDesignPreviewUpdate: (data: DesignPackageData) => void;
  onDesignSaved: (packageId: string) => void;
  onError: (message: string) => void;
  onDone: () => void;
}

// ============================================================================
// SSE Event Types
// ============================================================================

interface DesignStreamEvent {
  type: string;
  // text_delta
  content?: string;
  // tool_call_*
  id?: string;
  toolName?: string;
  argumentsDelta?: string;
  arguments?: string;
  // tool_execution_*
  result?: unknown;
  error?: string;
  // design_preview_update
  data?: DesignPackageData;
  // design_saved
  packageId?: string;
  // design_error
  message?: string;
  // timestamp on all events
  timestamp?: number;
}

// ============================================================================
// Stream Runner
// ============================================================================

export async function runDesignCalibrationStream(
  config: DesignCalibrationStreamConfig,
  callbacks: DesignCalibrationCallbacks,
  signal?: AbortSignal
): Promise<void> {
  await streamPostSSE<DesignStreamEvent>({
    url: '/api/design-calibration/stream',
    body: {
      message: config.message,
      conversationHistory: config.conversationHistory,
      existingPackageData: config.existingPackageData,
    },
    signal,
    onEvent: (event) => {
      switch (event.type) {
        case 'text_delta': {
          if (event.content) {
            callbacks.onTextDelta(event.content);
          }
          break;
        }
        case 'tool_call_stream_start': {
          if (event.id && event.toolName) {
            callbacks.onToolCallStart(event.id, event.toolName);
          }
          break;
        }
        case 'tool_call_arguments_delta': {
          if (event.id && event.argumentsDelta) {
            callbacks.onToolCallArgsDelta(event.id, event.argumentsDelta);
          }
          break;
        }
        case 'tool_call_stream_complete': {
          if (event.id && event.toolName) {
            callbacks.onToolCallComplete(
              event.id,
              event.toolName,
              event.arguments ?? ''
            );
          }
          break;
        }
        case 'tool_execution_start': {
          if (event.id && event.toolName) {
            callbacks.onToolExecStart(event.id, event.toolName);
          }
          break;
        }
        case 'tool_execution_output': {
          if (event.id && event.toolName) {
            callbacks.onToolExecOutput(
              event.id,
              event.toolName,
              event.result,
              event.error
            );
          }
          break;
        }
        case 'design_preview_update': {
          if (event.data) {
            callbacks.onDesignPreviewUpdate(event.data as DesignPackageData);
          }
          break;
        }
        case 'design_saved': {
          if (event.packageId) {
            callbacks.onDesignSaved(event.packageId);
          }
          break;
        }
        case 'design_error': {
          callbacks.onError(event.message ?? 'An error occurred');
          break;
        }
        // design_started, heartbeats — no action needed
      }
    },
    onDone: () => {
      callbacks.onDone();
    },
  });
}
