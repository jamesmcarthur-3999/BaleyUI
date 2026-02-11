/**
 * Creator Pipeline Adapter
 *
 * Bridges the creator_bot internal BaleyBot to the SSE stream.
 * Translates BaleyBot stream events into creator-specific SSE events.
 *
 * Architecture: creator_bot executes as a conversational agent (no output
 * schema). Its streamed text IS the user-facing conversation. When ready
 * to build, it calls spawn_baleybot('bal_generator', designSpec). The
 * adapter captures the spawn's tool_execution_output and constructs
 * a CreatorOutput from it.
 */

import { executeInternalBaleybot } from './internal-baleybots';
import type { CreatorOutput, CreatorMessage } from './creator-types';
import { creatorOutputSchema } from './creator-types';
import type { GeneratorContext } from './types';
import type { BaleybotStreamEvent } from '@baleybots/core';
import { createLogger } from '@/lib/logger';
import { normalizeOutputCandidate } from './internal-bb/runner';
import { runQuickValidation } from './creator-validation';

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
 * Forward a stream event as both text_delta (for the chat)
 * and as a tagged agent activity event.
 */
function forwardEvent(
  event: BaleybotStreamEvent,
  onEvent: (e: CreatorSSEEvent) => void,
): void {
  const ts = Date.now();
  const entityName = (event as Record<string, unknown>).__entityName as string | undefined;

  // Always forward text_delta for the chat
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
// OUTPUT CONSTRUCTION (from spawn results)
// ============================================================================

/**
 * Map a raw entity from bal_generator output to match the creatorEntitySchema shape.
 */
function mapEntity(raw: Record<string, unknown>): {
  id: string;
  name: string;
  icon: string;
  purpose: string;
  tools: string[];
} {
  return {
    id: String(raw.id ?? raw.name ?? crypto.randomUUID()),
    name: String(raw.name ?? 'Unnamed Entity'),
    icon: String(raw.icon ?? '🤖'),
    purpose: String(raw.purpose ?? raw.goal ?? raw.description ?? ''),
    tools: Array.isArray(raw.tools) ? raw.tools.map(String) : [],
  };
}

/**
 * Build a CreatorOutput from the conversational text and any spawn results.
 * If bal_generator was spawned and produced output, we construct a 'ready' result.
 * Otherwise it's a conversation-only turn ('building').
 */
function buildCreatorOutput(
  text: string,
  spawnResults: Map<string, unknown>,
): CreatorOutput {
  const balGenResult = spawnResults.get('bal_generator');

  if (balGenResult && typeof balGenResult === 'object') {
    const gen = (normalizeOutputCandidate(balGenResult) ?? {}) as Record<string, unknown>;

    // Try to validate through the full schema for safety
    const candidate = {
      status: 'ready' as const,
      message: text,
      entities: Array.isArray(gen.entities)
        ? (gen.entities as Array<Record<string, unknown>>).map(mapEntity)
        : [],
      connections: [],
      balCode: String(gen.balCode ?? ''),
      name: String(gen.suggestedName ?? gen.name ?? 'Unnamed BaleyBot'),
      description: String(gen.explanation ?? gen.description ?? ''),
      icon: String(gen.suggestedIcon ?? gen.icon ?? '🤖'),
    };

    const parsed = creatorOutputSchema.safeParse(candidate);
    if (parsed.success) {
      return parsed.data;
    }

    logger.warn('buildCreatorOutput validation failed, using raw candidate', {
      issues: parsed.error.issues.slice(0, 3),
    });

    // Return the candidate anyway — the schema uses .catch() so this shouldn't happen,
    // but just in case
    return candidate as unknown as CreatorOutput;
  }

  // Conversation-only turn (no spawn)
  return {
    status: 'building',
    message: text || 'Let me know more about what you need.',
    entities: [],
    connections: [],
    balCode: '',
    name: 'Unnamed BaleyBot',
    description: '',
    icon: '🤖',
  };
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
  const { workspaceId, context, conversationHistory, onEvent } = args;

  // Build the input string for creator_bot
  const input = buildPipelineInput({ message: args.message, context, conversationHistory });

  onEvent({ type: 'creator_stream_started', timestamp: Date.now() });

  try {
    // Accumulate conversational text and spawn results
    let accumulatedText = '';
    const spawnResults = new Map<string, unknown>();
    let lastSpawnBotName: string | undefined;

    await executeInternalBaleybot(
      'creator_bot',
      input,
      {
        userWorkspaceId: workspaceId,
        onSegment: (event: BaleybotStreamEvent) => {
          // Accumulate conversational text
          if (event.type === 'text_delta') {
            accumulatedText += String((event as { content: string }).content ?? '');
          }

          // Track which bot is being spawned
          if (event.type === 'tool_call_stream_complete') {
            const e = event as Record<string, unknown>;
            if (e.toolName === 'spawn_baleybot') {
              const rawArgs = e.arguments as Record<string, unknown> | undefined;
              if (rawArgs) {
                lastSpawnBotName = String(
                  rawArgs.baleybot ?? rawArgs.baleybotIdOrName ?? rawArgs.name ?? ''
                );
              }
            }
          }

          // Capture spawn results
          if (event.type === 'tool_execution_output') {
            const e = event as Record<string, unknown>;
            if (e.toolName === 'spawn_baleybot' && e.result && lastSpawnBotName) {
              const result = e.result as { output?: unknown };
              if (result.output) {
                spawnResults.set(lastSpawnBotName, result.output);
              }
            }
          }

          forwardEvent(event, onEvent);
        },
        triggeredBy: 'internal',
      }
    );

    // Build CreatorOutput from text + spawn results
    const creatorOutput = buildCreatorOutput(accumulatedText, spawnResults);

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
  }
}
