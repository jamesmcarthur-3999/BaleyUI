/**
 * Segment Derivation
 *
 * Converts SDK StreamSegmentState into renderable segments.
 * Since the SDK's segments are already ordered correctly, the "derivation"
 * just filters and appends BaleyUI-specific system blocks.
 */

import type { StreamSegmentState, StreamSegment } from '@baleybots/chat';
import type { RenderableSegment, SystemBlock } from '../types';

/** Extract renderable segments from SDK state. Segments are already in order. */
export function deriveSegments(
  state: StreamSegmentState,
  systemBlocks?: SystemBlock[],
): RenderableSegment[] {
  const segments: RenderableSegment[] = [...state.segments];
  if (systemBlocks) segments.push(...systemBlocks);
  return segments;
}

/** Convert plain text to a single TextSegment (for stored messages). */
export function textToSegments(content: string): StreamSegment[] {
  if (!content) return [];
  return [{
    type: 'text',
    id: `text-static-${Date.now()}`,
    timestamp: Date.now(),
    content,
    isStreaming: false,
  }];
}
