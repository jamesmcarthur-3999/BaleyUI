/**
 * Creator Pipeline Adapter
 *
 * Bridges the creator_bot internal BaleyBot to the SSE stream.
 * Translates BaleyBot stream events into creator-specific SSE events.
 *
 * Architecture: creator_bot executes with tools (spawn_baleybot,
 * request_user_input, web_search, fetch_url). The adapter:
 * 1. Wires request_user_input to pause/resume via UserInputChannel
 * 2. Forwards all streaming events (not just text_delta) to the client
 * 3. Tags spawned child bot events for the activity panel
 */

import { executeInternalBaleybot } from './internal-baleybots';
import type { CreatorOutput, CreatorMessage } from './creator-types';
import { creatorOutputSchema } from './creator-types';
import type { GeneratorContext } from './types';
import type { BaleybotStreamEvent } from '@baleybots/core';
import { createLogger } from '@/lib/logger';
import { normalizeOutputCandidate } from './internal-bb/runner';
import { runQuickValidation } from './creator-validation';
import {
  setRequestUserInputHandler,
} from './tools/built-in/implementations';
import {
  createUserInputChannel,
  registerChannel,
  removeChannel,
  type UserInputChannel,
} from './tools/built-in/request-user-input';

const logger = createLogger('creator-pipeline-adapter');

// ============================================================================
// AGENT ACTIVITY EVENT TYPES (client-safe)
// ============================================================================

export type AgentEvent =
  | { type: 'text_delta'; content: string }
  | { type: 'reasoning'; content: string }
  | { type: 'tool_start'; toolName: string; id: string }
  | { type: 'tool_complete'; toolName: string; id: string }
  | { type: 'tool_output'; toolName: string; result?: unknown }
  | { type: 'child_bot_event'; childBotName: string; event: AgentEvent }
  | { type: 'done'; reason: string };

// ============================================================================
// SSE EVENT TYPES
// ============================================================================

export type CreatorSSEEvent =
  | { type: 'creator_stream_started'; timestamp: number }
  | { type: 'creator_text_delta'; content: string; timestamp: number }
  | { type: 'creator_progress'; phase: string; message: string; timestamp: number }
  | { type: 'creator_complete'; result: CreatorOutput; summary: string; timestamp: number }
  | { type: 'creator_error'; message: string; timestamp: number }
  | { type: 'creator_validation_started'; timestamp: number }
  | { type: 'creator_validation_progress'; testIndex: number; totalTests: number; testName: string; timestamp: number }
  | { type: 'creator_validation_result'; status: 'passed' | 'failed'; passRate: number; failedTests: string[]; timestamp: number }
  | { type: 'creator_input_requested'; executionId: string; question: string; timestamp: number }
  | { type: 'creator_input_received'; timestamp: number }
  | { type: 'creator_agent_event'; event: AgentEvent; entityName?: string; timestamp: number };

// ============================================================================
// CONTEXT BUILDER
// ============================================================================

function buildPipelineInput(args: {
  message: string;
  context: GeneratorContext;
  conversationHistory: CreatorMessage[];
}): string {
  const parts: string[] = [];

  // Workspace context
  if (args.context.availableTools.length > 0) {
    const toolNames = args.context.availableTools.map((t) => t.name).join(', ');
    parts.push(`Available tools: ${toolNames}`);
  }

  if (args.context.connections.length > 0) {
    const connSummary = args.context.connections
      .map((c) => `${c.name} (${c.type}: ${c.status})`)
      .join(', ');
    parts.push(`Connections: ${connSummary}`);
  }

  if (args.context.existingBaleybots.length > 0) {
    const bbSummary = args.context.existingBaleybots
      .slice(0, 12)
      .map((b) => `${b.name}: ${b.description ?? 'no description'}`)
      .join('; ');
    parts.push(`Existing bots: ${bbSummary}`);
  }

  // Conversation history (last 16 messages, truncated)
  if (args.conversationHistory.length > 0) {
    const recent = args.conversationHistory.slice(-16);
    const historyText = recent
      .map((m) => {
        const content = m.content.length > 900
          ? m.content.slice(0, 900) + '...'
          : m.content;
        return `${m.role}: ${content}`;
      })
      .join('\n');
    parts.push(`Conversation history:\n${historyText}`);
  }

  // Current message
  parts.push(`User message: ${args.message}`);

  return parts.join('\n\n');
}

// ============================================================================
// EVENT TRANSLATION
// ============================================================================

/**
 * Simplify a BaleybotStreamEvent into a client-safe AgentEvent.
 */
function simplifyEvent(event: BaleybotStreamEvent): AgentEvent | null {
  const e = event as Record<string, unknown>;

  switch (event.type) {
    case 'text_delta':
      return { type: 'text_delta', content: String(e.content ?? '') };

    case 'reasoning':
      return { type: 'reasoning', content: String(e.content ?? '') };

    case 'tool_call_stream_start':
      return {
        type: 'tool_start',
        toolName: String(e.toolName ?? ''),
        id: String(e.id ?? ''),
      };

    case 'tool_call_stream_complete':
      return {
        type: 'tool_complete',
        toolName: String(e.toolName ?? ''),
        id: String(e.id ?? ''),
      };

    case 'tool_execution_output':
      return {
        type: 'tool_output',
        toolName: String(e.toolName ?? ''),
        result: e.result,
      };

    case 'tool_execution_stream': {
      const childBotName = e.childBotName as string | undefined;
      const nestedEvent = e.nestedEvent as BaleybotStreamEvent | undefined;
      if (childBotName && nestedEvent) {
        const simplified = simplifyEvent(nestedEvent);
        if (simplified) {
          return { type: 'child_bot_event', childBotName, event: simplified };
        }
      }
      return null;
    }

    case 'done':
      return { type: 'done', reason: String(e.reason ?? 'unknown') };

    default:
      return null;
  }
}

/**
 * Forward a stream event as both text_delta (for backward compat)
 * and as a tagged agent activity event.
 */
function forwardEvent(
  event: BaleybotStreamEvent,
  onEvent: (e: CreatorSSEEvent) => void,
): void {
  const ts = Date.now();
  const entityName = (event as Record<string, unknown>).__entityName as string | undefined;

  // Always forward text_delta for the chat (backward compat)
  if (event.type === 'text_delta') {
    onEvent({
      type: 'creator_text_delta',
      content: (event as { content: string }).content,
      timestamp: ts,
    });
  }

  // Forward as agent activity event for the activity panel
  const simplified = simplifyEvent(event);
  if (simplified) {
    onEvent({
      type: 'creator_agent_event',
      event: simplified,
      entityName,
      timestamp: ts,
    });
  }
}

// ============================================================================
// OUTPUT EXTRACTION
// ============================================================================

function extractCreatorOutput(rawOutput: unknown): CreatorOutput | null {
  if (!rawOutput) return null;

  // Use the robust normalizer that handles code fences, balanced JSON, etc.
  let target: unknown = normalizeOutputCandidate(rawOutput);

  // If the output is wrapped in { output, executionId }
  if (target && typeof target === 'object' && 'output' in target) {
    target = (target as Record<string, unknown>).output;
  }

  // Try to validate as CreatorOutput
  const parsed = creatorOutputSchema.safeParse(target);
  if (parsed.success) {
    return parsed.data;
  }

  logger.warn('Creator output validation failed', {
    issues: parsed.error.issues.slice(0, 3),
    outputType: typeof target,
  });

  return null;
}

function compactSummary(output: CreatorOutput): string {
  if (output.status === 'building') {
    return 'Gathering more details before building.';
  }

  const entityCount = output.entities.length;
  const toolCount = output.entities.reduce(
    (sum, entity) => sum + entity.tools.length,
    0
  );
  const parts = [
    `Built ${output.name} with ${entityCount} ${entityCount === 1 ? 'entity' : 'entities'}`,
  ];
  if (toolCount > 0) {
    parts.push(`using ${toolCount} ${toolCount === 1 ? 'tool' : 'tools'}`);
  }
  return `${parts.join(' ')}.`;
}

// ============================================================================
// MAIN PIPELINE
// ============================================================================

export interface CreatorPipelineArgs {
  workspaceId: string;
  baleybotId?: string;
  message: string;
  context: GeneratorContext;
  conversationHistory: CreatorMessage[];
  signal?: AbortSignal;
  executionId: string;
  onEvent: (event: CreatorSSEEvent) => void;
}

export async function executeCreatorPipeline(
  args: CreatorPipelineArgs
): Promise<CreatorOutput | null> {
  const { workspaceId, context, conversationHistory, onEvent, executionId } = args;

  // Build the input string for creator_bot
  const input = buildPipelineInput({ message: args.message, context, conversationHistory });

  // Set up the request_user_input channel for this execution
  const channel: UserInputChannel = createUserInputChannel();
  registerChannel(executionId, channel);

  // Configure the handler to use the channel + emit SSE events.
  // The handler is scoped per-execution via the channel registry lookup,
  // so concurrent sessions don't conflict.
  setRequestUserInputHandler(async (handlerArgs) => {
    const question = String(handlerArgs.question ?? '');

    // Emit event telling the client we're waiting for input
    onEvent({
      type: 'creator_input_requested',
      executionId,
      question,
      timestamp: Date.now(),
    });

    // Wait for user response (blocks until /api/baleybots/creator/respond is called)
    const response = await channel.waitForInput(question);

    // Emit acknowledgement
    onEvent({
      type: 'creator_input_received',
      timestamp: Date.now(),
    });

    return { response };
  });

  onEvent({ type: 'creator_stream_started', timestamp: Date.now() });

  try {
    const { output } = await executeInternalBaleybot(
      'creator_bot',
      input,
      {
        userWorkspaceId: workspaceId,
        onSegment: (event: BaleybotStreamEvent) => {
          forwardEvent(event, onEvent);
        },
        triggeredBy: 'internal',
      }
    );

    // Extract the CreatorOutput from the bot's output
    const creatorOutput = extractCreatorOutput(output);

    if (creatorOutput) {
      onEvent({
        type: 'creator_complete',
        result: creatorOutput,
        summary: compactSummary(creatorOutput),
        timestamp: Date.now(),
      });

      // Background validation (non-blocking — creator_complete already sent)
      if (creatorOutput.status === 'ready' && args.baleybotId && creatorOutput.entities.length > 0) {
        try {
          onEvent({ type: 'creator_validation_started', timestamp: Date.now() });
          const result = await runQuickValidation({
            workspaceId,
            baleybotId: args.baleybotId,
            balCode: creatorOutput.balCode,
            entities: creatorOutput.entities.map((e) => ({
              name: e.name,
              tools: e.tools,
              purpose: e.purpose,
            })),
            onProgress: (testIndex, totalTests, testName) =>
              onEvent({
                type: 'creator_validation_progress',
                testIndex,
                totalTests,
                testName,
                timestamp: Date.now(),
              }),
            signal: args.signal,
          });
          onEvent({
            type: 'creator_validation_result',
            status: result.passRate === 1 ? 'passed' : 'failed',
            passRate: result.passRate,
            failedTests: result.failedTests.map((t) => t.name),
            timestamp: Date.now(),
          });
        } catch {
          // Validation failure must never break the main flow
          logger.warn('Background validation failed silently');
        }
      }
    }

    return creatorOutput;
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : 'Pipeline failed';
    logger.error('Creator pipeline failed', { error: errMsg });
    onEvent({
      type: 'creator_error',
      message: errMsg,
      timestamp: Date.now(),
    });
    return null;
  } finally {
    // Clean up channel when execution ends
    removeChannel(executionId);
    setRequestUserInputHandler(null);
  }
}
