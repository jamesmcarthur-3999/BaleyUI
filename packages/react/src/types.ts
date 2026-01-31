/**
 * @baleyui/react Types
 */

import type { Execution, ExecutionEvent } from '@baleyui/sdk';

// ============================================================================
// Shared Types
// ============================================================================

export type ThemeMode = 'light' | 'dark' | 'system';

export interface ThemeConfig {
  mode?: ThemeMode;
  primaryColor?: string;
  borderRadius?: 'none' | 'sm' | 'md' | 'lg';
  fontFamily?: string;
}

export interface BaseComponentProps {
  /** API key for authentication */
  apiKey: string;
  /** Base URL for API (defaults to https://app.baleyui.com) */
  baseUrl?: string;
  /** Theme configuration */
  theme?: ThemeConfig;
  /** Additional CSS class names */
  className?: string;
}

// ============================================================================
// FlowRunner Types
// ============================================================================

export type FlowRunnerStatus = 'idle' | 'running' | 'completed' | 'error';

export interface FlowRunnerProps extends BaseComponentProps {
  /** Flow ID to execute */
  flowId: string;
  /** Initial input values */
  defaultInput?: Record<string, unknown>;
  /** Whether to show the input form */
  showInput?: boolean;
  /** Whether to show execution progress */
  showProgress?: boolean;
  /** Whether to show the output */
  showOutput?: boolean;
  /** Custom submit button text */
  submitText?: string;
  /** Callback when execution starts */
  onStart?: (executionId: string) => void;
  /** Callback for streaming events */
  onEvent?: (event: ExecutionEvent) => void;
  /** Callback when execution completes */
  onComplete?: (execution: Execution) => void;
  /** Callback when execution fails */
  onError?: (error: Error) => void;
}

export interface FlowRunnerState {
  status: FlowRunnerStatus;
  executionId: string | null;
  events: ExecutionEvent[];
  result: Execution | null;
  error: Error | null;
}

// ============================================================================
// ChatWidget Types
// ============================================================================

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  isStreaming?: boolean;
}

export interface ChatWidgetProps extends BaseComponentProps {
  /** Block ID for the AI block to use */
  blockId: string;
  /** Chat title displayed in header */
  title?: string;
  /** Placeholder text for input */
  placeholder?: string;
  /** Initial messages to display */
  initialMessages?: ChatMessage[];
  /** Maximum height for the widget */
  maxHeight?: string | number;
  /** Whether to show timestamps */
  showTimestamps?: boolean;
  /** Callback when a message is sent */
  onMessageSent?: (message: string) => void;
  /** Callback when a response is received */
  onResponse?: (response: string) => void;
  /** Callback for errors */
  onError?: (error: Error) => void;
}

export interface ChatWidgetState {
  messages: ChatMessage[];
  isLoading: boolean;
  error: Error | null;
}
