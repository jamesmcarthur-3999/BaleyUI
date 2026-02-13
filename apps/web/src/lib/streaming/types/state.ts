/**
 * Streaming State Types
 *
 * DELETED: All legacy types (StreamState, ToolCallState, ToolCallStatus, etc.) have been
 * removed. The canonical streaming representation is SDK's StreamSegmentState from
 * @baleybots/chat, used via AppStreamState in useStreamState.ts.
 *
 * For streaming state, use:
 *   - AppStreamState / AppStreamStatus from '@/hooks/useStreamState'
 *   - StreamSegmentState from '@baleybots/chat'
 *   - ToolCallSegment from '@baleybots/chat'
 *
 * For tool call status values, use SDK values: 'running' | 'completed' | 'failed'
 * (NOT the old 'streaming_args' | 'args_complete' | 'executing' | 'complete' | 'error')
 *
 * This file is intentionally empty. It remains to avoid breaking the barrel import
 * at streaming/types/index.ts. It can be deleted once the barrel is cleaned up.
 */
