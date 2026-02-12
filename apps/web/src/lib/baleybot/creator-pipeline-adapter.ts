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
import { buildConnectionTools } from './tools/companion/connections';
import { buildIntegrationTools } from './tools/companion/integration';
import { buildUIControlTools } from './tools/companion/ui-control';
import type { CompanionToolContext } from './tools/companion';
import type { TriggerConfig } from './types';


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

/**
 * Specialist findings extracted from spawn results.
 * Each field is the normalized output from the respective specialist BB, or null if not invoked.
 */
export interface SpecialistFindings {
  connections: unknown | null;
  tests: unknown | null;
  deployment: unknown | null;
}

const CONNECTION_TOOL_NAMES = new Set([
  'list_connections', 'test_connection', 'set_default_connection',
  'create_connection', 'delete_connection',
]);

export type CreatorSSEEvent =
  | { type: 'creator_stream_started'; timestamp: number }
  | { type: 'creator_text_delta'; content: string; timestamp: number }
  | { type: 'creator_progress'; phase: string; message: string; timestamp: number }
  | { type: 'creator_complete'; result: CreatorOutput; summary: string; specialist: SpecialistFindings; timestamp: number }
  | { type: 'creator_error'; message: string; timestamp: number }
  | { type: 'creator_agent_event'; event: AgentEvent; entityName?: string; timestamp: number }
  | { type: 'creator_connection_action'; action: string; result: Record<string, unknown>; timestamp: number }
  | { type: 'creator_trigger_saved'; triggerConfig: TriggerConfig; timestamp: number }
  | { type: 'creator_webhook_enabled'; webhookUrl: string; webhookSecret: string; timestamp: number }
  | { type: 'creator_navigate_tab'; tab: string; timestamp: number };

// ============================================================================
// CONTEXT BUILDER
// ============================================================================

export interface PipelineUIState {
  activeTab: string;
  availableTabs: string[];
  lifecycleStage: string;
  readinessSummary: string;
  triggerConfigured: boolean;
  webhookEnabled: boolean;
}

function buildPipelineInput(args: {
  message: string;
  context: GeneratorContext;
  conversationHistory: CreatorMessage[];
  currentState?: {
    balCode: string;
    name?: string;
    description?: string;
    icon?: string;
    entities?: Array<{ name: string; purpose?: string; tools?: string[] }>;
  };
  uiState?: PipelineUIState;
}): string {
  const parts: string[] = [];

  // Workspace context
  if (args.context.availableTools.length > 0) {
    const toolNames = args.context.availableTools.map((t) => t.name).join(', ');
    parts.push(`Available tools: ${toolNames}`);
  }

  if (args.context.connections.length > 0) {
    const connSummary = args.context.connections
      .map((c) => `${c.name} [id:${c.id}] (${c.type}: ${c.status})`)
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

  // Current builder state (for edit iterations)
  if (args.currentState?.balCode) {
    const s = args.currentState;
    const stateLines = [`Current BaleyBot: ${s.name ?? 'Unnamed'}`];
    if (s.entities?.length) {
      stateLines.push(`Entities: ${s.entities.map(e => e.name).join(', ')}`);
    }
    stateLines.push(`Current BAL code:\n\`\`\`\n${s.balCode}\n\`\`\``);
    parts.push(stateLines.join('\n'));
  }

  // UI state awareness — lets creator_bot know what the user is looking at
  if (args.uiState) {
    const ui = args.uiState;
    const uiLines = [
      'UI State:',
      `- User is currently viewing: [${ui.activeTab} tab]`,
      `- Available tabs: ${ui.availableTabs.join(', ')}`,
      `- Lifecycle stage: ${ui.lifecycleStage}`,
      `- Readiness: ${ui.readinessSummary}`,
      `- Trigger: ${ui.triggerConfigured ? 'configured' : 'not configured'}`,
      `- Webhook: ${ui.webhookEnabled ? 'enabled' : 'not enabled'}`,
      '- You can switch tabs using navigate_tab. Use this to guide the user to relevant content.',
    ];
    parts.push(uiLines.join('\n'));
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

    case 'tool_execution_start':
      return { type: 'tool_start', toolName: String(e.toolName ?? ''), id: String(e.id ?? '') };

    case 'tool_call_stream_output':
      return { type: 'tool_output', toolName: String(e.id ?? ''), result: e.output };

    case 'tool_call_stream_error':
      return { type: 'tool_output', toolName: String(e.id ?? ''), result: `Error: ${String((e.error as Record<string, unknown>)?.message ?? 'Unknown error')}` };

    case 'structured_output_delta':
      return { type: 'text_delta', content: String(e.content ?? '') };

    case 'tool_validation_error':
      return { type: 'tool_output', toolName: String(e.toolName ?? ''), result: `Validation error: ${String(e.validationErrors ?? '')}` };

    case 'tool_call_arguments_delta':
    case 'tool_call_stream_delta':
      return null; // Incremental arg chunks — too noisy

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
/**
 * Find generator result by name, falling back to shape-based detection
 * (any result with a `balCode` field) if name lookup misses.
 */
function findGeneratorResult(spawnResults: Map<string, unknown>): unknown | null {
  const byName = spawnResults.get('bal_generator');
  if (byName) return byName;

  // Fallback: search by output shape (has `balCode` field)
  for (const result of spawnResults.values()) {
    const normalized = normalizeOutputCandidate(result);
    if (normalized && typeof normalized === 'object' && 'balCode' in normalized) {
      return result;
    }
  }
  return null;
}

function buildCreatorOutput(
  text: string,
  spawnResults: Map<string, unknown>,
): CreatorOutput {
  const balGenResult = findGeneratorResult(spawnResults);

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

    logger.warn('buildCreatorOutput validation failed, falling back to building', {
      issues: parsed.error.issues.slice(0, 3),
    });

    // Spawn was attempted but output failed adapter-side validation.
    // Pass through the model's conversational text as-is — creator_bot handles
    // failure communication naturally when it sees the spawn result.
    return {
      status: 'building' as const,
      message: text,
      entities: [],
      connections: [],
      balCode: '',
      name: String(gen.suggestedName ?? gen.name ?? 'Unnamed BaleyBot'),
      description: '',
      icon: '🤖',
    };
  }

  // Conversation-only turn (no spawn)
  return {
    status: 'building',
    message: text,
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
  userId: string;
  baleybotId?: string;
  message: string;
  context: GeneratorContext;
  conversationHistory: CreatorMessage[];
  currentState?: {
    balCode: string;
    name?: string;
    description?: string;
    icon?: string;
    entities?: Array<{ name: string; purpose?: string; tools?: string[] }>;
  };
  uiState?: PipelineUIState;
  signal?: AbortSignal;
  executionId: string;
  onEvent: (event: CreatorSSEEvent) => void;
}

export async function executeCreatorPipeline(
  args: CreatorPipelineArgs
): Promise<CreatorOutput | null> {
  const { workspaceId, context, conversationHistory, onEvent } = args;

  // Build the input string for creator_bot
  const input = buildPipelineInput({
    message: args.message,
    context,
    conversationHistory,
    currentState: args.currentState,
    uiState: args.uiState,
  });

  onEvent({ type: 'creator_stream_started', timestamp: Date.now() });

  // Build all companion tools for injection
  const connectionToolCtx: CompanionToolContext = {
    workspaceId: args.workspaceId,
    userId: args.userId,
  };
  const connectionTools = buildConnectionTools(connectionToolCtx);

  // Merge all injected tools
  const allInjectedTools = new Map([...connectionTools]);

  // Always inject UI control tools
  const uiTools = buildUIControlTools({
    onNavigateTab: (tab) =>
      onEvent({ type: 'creator_navigate_tab', tab, timestamp: Date.now() }),
  });
  for (const [k, v] of uiTools) allInjectedTools.set(k, v);

  // When bot is saved, also inject integration tools
  if (args.baleybotId) {
    const integrationTools = buildIntegrationTools({
      workspaceId,
      baleybotId: args.baleybotId,
      onTriggerSaved: (config) =>
        onEvent({
          type: 'creator_trigger_saved',
          triggerConfig: config,
          timestamp: Date.now(),
        }),
      onWebhookEnabled: (url, secret) =>
        onEvent({
          type: 'creator_webhook_enabled',
          webhookUrl: url,
          webhookSecret: secret,
          timestamp: Date.now(),
        }),
    });
    for (const [k, v] of integrationTools) allInjectedTools.set(k, v);
  }

  try {
    // Accumulate conversational text and spawn results
    let accumulatedText = '';
    const spawnResults = new Map<string, unknown>();
    // Map tool call IDs to spawned bot names so concurrent spawns are tracked correctly
    const pendingSpawnNames = new Map<string, string>();

    await executeInternalBaleybot(
      'creator_bot',
      input,
      {
        userWorkspaceId: workspaceId,
        injectedTools: allInjectedTools,
        signal: args.signal,
        onSegment: (event: BaleybotStreamEvent) => {
          // Accumulate conversational text
          if (event.type === 'text_delta') {
            accumulatedText += String((event as { content: string }).content ?? '');
          }

          // Track which bot is being spawned, keyed by tool call ID
          if (event.type === 'tool_call_stream_complete') {
            const e = event as Record<string, unknown>;
            if (e.toolName === 'spawn_baleybot') {
              const toolCallId = String(e.id ?? '');
              // Arguments may arrive as a JSON string or parsed object
              let rawArgs = e.arguments as Record<string, unknown> | string | undefined;
              if (typeof rawArgs === 'string') {
                try { rawArgs = JSON.parse(rawArgs) as Record<string, unknown>; } catch { rawArgs = undefined; }
              }
              if (rawArgs && typeof rawArgs === 'object' && toolCallId) {
                const botName = String(
                  rawArgs.baleybot ?? rawArgs.baleybotIdOrName ?? rawArgs.name ?? ''
                );
                if (botName) {
                  pendingSpawnNames.set(toolCallId, botName);
                }
              }
            }
          }

          // Capture spawn results using tool call ID → bot name mapping
          if (event.type === 'tool_execution_output') {
            const e = event as Record<string, unknown>;
            const toolName = String(e.toolName ?? '');

            if (toolName === 'spawn_baleybot' && e.result) {
              const toolCallId = String(e.id ?? '');
              const botName = pendingSpawnNames.get(toolCallId);
              if (botName) {
                const result = e.result as { output?: unknown };
                if (result.output) {
                  spawnResults.set(botName, result.output);
                }
                pendingSpawnNames.delete(toolCallId);
              }
            }

            // Connection tool events → emit as visual action cards
            if (CONNECTION_TOOL_NAMES.has(toolName)) {
              onEvent({
                type: 'creator_connection_action',
                action: toolName,
                result: (e.result ?? {}) as Record<string, unknown>,
                timestamp: Date.now(),
              });
            }
          }

          forwardEvent(event, onEvent);
        },
        triggeredBy: 'internal',
      }
    );

    // Build CreatorOutput from text + spawn results
    const creatorOutput = buildCreatorOutput(accumulatedText, spawnResults);

    // Extract specialist findings from spawn results
    const specialistFindings: SpecialistFindings = {
      connections: normalizeOutputCandidate(spawnResults.get('connection_advisor')) ?? null,
      tests: normalizeOutputCandidate(spawnResults.get('test_orchestrator')) ?? null,
      deployment: normalizeOutputCandidate(spawnResults.get('deployment_advisor')) ?? null,
    };

    onEvent({
      type: 'creator_complete',
      result: creatorOutput,
      summary: compactSummary(creatorOutput),
      specialist: specialistFindings,
      timestamp: Date.now(),
    });

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
