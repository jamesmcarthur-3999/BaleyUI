/**
 * Unified Chat Types — SDK-Aligned
 *
 * Uses SDK's StreamSegment as the canonical content representation.
 * ChatMessage and ChatConfig are BaleyUI-specific wrappers.
 */

import type { StreamSegment } from '@baleybots/chat';

// ============================================================================
// ATTACHMENTS
// ============================================================================

export interface ChatAttachment {
  fileName: string;
  mimeType: string;
  fileSize: number;
  /** Public blob URL (for display) */
  url: string;
  /** Blob download URL (for server-side fetch) */
  downloadUrl: string;
  /** Client-only object URL for image preview (not persisted) */
  localPreviewUrl?: string;
}

// ============================================================================
// MESSAGE
// ============================================================================

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  /** Plain text content (for simple messages / backwards compat) */
  content: string;
  /** SDK segments. When present, rendered instead of content. */
  segments?: StreamSegment[];
  timestamp: Date;
  status?: 'sending' | 'streaming' | 'complete' | 'error';
  /** File attachments (images, PDFs) */
  attachments?: ChatAttachment[];
  /** Optional metadata (tokens, model, duration) */
  meta?: {
    model?: string;
    tokens?: number;
    durationMs?: number;
  };
}

// ============================================================================
// BALEYUI-SPECIFIC BLOCKS
// ============================================================================

/** System notices are BaleyUI-specific (not in SDK) */
export interface SystemBlock {
  type: 'system';
  action: string;
  detail?: string;
  status?: 'success' | 'error' | 'info';
}

/** Either an SDK segment or a BaleyUI-specific system block */
export type RenderableSegment = StreamSegment | SystemBlock;

// ============================================================================
// CHAT CONFIGURATION
// ============================================================================

export interface ChatConfig {
  /** Visual variant */
  variant: 'full-page' | 'floating-panel';
  /** Which segment types to render */
  enabledSegments: Set<StreamSegment['type'] | 'system'>;
  /** Tool display detail level */
  toolDetail: 'minimal' | 'standard' | 'detailed';
  /** Whether to group consecutive tool calls */
  groupConsecutiveTools: boolean;
  /** Minimum consecutive tools before grouping */
  groupThreshold: number;
  /** Show avatar icons */
  showAvatars: boolean;
  /** Show message timestamps */
  showTimestamps: boolean;
  /** Show copy button on assistant messages */
  showCopy: boolean;
  /** Auto-scroll behavior */
  autoScroll: boolean;
}

export const CREATOR_CONFIG: ChatConfig = {
  variant: 'full-page',
  enabledSegments: new Set([
    'text', 'tool_call', 'reasoning', 'structured_output',
    'spawn_agent', 'sequential_thinking', 'dsl_pipeline',
    'error', 'done', 'system',
  ] as const),
  toolDetail: 'standard',
  groupConsecutiveTools: true,
  groupThreshold: 2,
  showAvatars: false,
  showTimestamps: false,
  showCopy: false,
  autoScroll: true,
};

export const COMPANION_CONFIG: ChatConfig = {
  variant: 'floating-panel',
  enabledSegments: new Set(['text', 'tool_call', 'error', 'system'] as const),
  toolDetail: 'minimal',
  groupConsecutiveTools: true,
  groupThreshold: 2,
  showAvatars: true,
  showTimestamps: true,
  showCopy: true,
  autoScroll: true,
};
