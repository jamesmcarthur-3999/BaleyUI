/**
 * Creator Bot Service
 *
 * The Creator Bot is an internal BaleyBot that helps users build other BaleyBots
 * through natural conversation. It executes through the standard BaleyBot path
 * with full execution tracking.
 */

import { executeInternalBaleybot } from './internal-baleybots';
import {
  creatorOutputSchema,
  type CreatorOutput,
  type CreatorMessage,
  type CreatorStreamChunk,
} from './creator-types';
import type { GeneratorContext } from './types';
import {
  getToolCatalog,
  formatToolCatalogForCreatorBot,
} from './tools/catalog-service';

// ============================================================================
// OUTPUT RESOLUTION
// ============================================================================

/**
 * Resolve the raw output from executeInternalBaleybot into a valid object
 * that can be parsed by creatorOutputSchema.
 *
 * The SDK's buildZodSchema marks all output fields as optional, which causes
 * models to sometimes return partial/malformed structured output. This handles:
 * 1. Valid object output (pass through)
 * 2. String output containing JSON (parse it)
 * 3. String with markdown fences around JSON (extract and parse)
 */
function resolveCreatorOutput(output: unknown): unknown {
  // Already an object with entities — pass through
  if (output && typeof output === 'object' && !Array.isArray(output)) {
    return output;
  }

  // String output — try to extract JSON
  if (typeof output === 'string') {
    const text = output.trim();

    // Try direct JSON parse
    try {
      return JSON.parse(text);
    } catch {
      // Try extracting from markdown code fences
      const jsonMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
      if (jsonMatch?.[1]) {
        try {
          return JSON.parse(jsonMatch[1].trim());
        } catch {
          // Fall through
        }
      }

      // Try finding the first { ... } block
      const braceStart = text.indexOf('{');
      const braceEnd = text.lastIndexOf('}');
      if (braceStart !== -1 && braceEnd > braceStart) {
        try {
          return JSON.parse(text.slice(braceStart, braceEnd + 1));
        } catch {
          // Fall through
        }
      }
    }
  }

  // Return as-is and let creatorOutputSchema.parse() produce a clear error
  return output;
}

// ============================================================================
// TYPES
// ============================================================================

/**
 * Options for creating a Creator Bot instance
 */
export interface CreatorBotOptions {
  /** Context with available tools, policies, and connections */
  context: GeneratorContext;
  /** Previous conversation messages for continuity */
  conversationHistory?: CreatorMessage[];
}

// ============================================================================
// CONTEXT BUILDING
// ============================================================================

/**
 * Format existing BaleyBots as context for the Creator Bot
 */
function formatExistingBaleybots(
  baleybots: GeneratorContext['existingBaleybots']
): string {
  if (baleybots.length === 0) {
    return '';
  }

  const lines = [
    '',
    '## Existing BaleyBots in This Workspace',
    'You can reference these when building new BaleyBots:',
    '',
  ];

  for (const bb of baleybots) {
    lines.push(`- **${bb.name}** (${bb.id}): ${bb.description || 'No description'}`);
  }

  return lines.join('\n');
}

/**
 * Format conversation history as context for the Creator Bot
 */
function formatConversationHistory(messages: CreatorMessage[]): string {
  if (messages.length === 0) {
    return '';
  }

  const lines = ['', '## Previous Conversation', ''];

  for (const msg of messages) {
    const role = msg.role === 'user' ? 'User' : 'Assistant';
    lines.push(`${role}: ${msg.content}`);
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Build the context string for the Creator Bot
 */
function buildCreatorContext(options: CreatorBotOptions): string {
  const { context, conversationHistory = [] } = options;

  const lines: string[] = [];

  // Add tool catalog (including connection-derived tools if database connections exist)
  const databaseConnections = context.connections
    .filter((c) => (c.type === 'postgres' || c.type === 'mysql') && c.status === 'connected')
    .map((c) => ({
      connectionId: c.id,
      connectionName: c.name,
      type: c.type as 'postgres' | 'mysql',
      config: {} as import('@/lib/connections/providers').DatabaseConnectionConfig, // Config not needed for catalog display
      schema: c.availableModels as import('./tools/connection-derived').DatabaseSchema | undefined,
    }));

  const fullCatalog = getToolCatalog({
    workspaceId: context.workspaceId,
    workspacePolicies: context.workspacePolicies,
    workspaceTools: context.availableTools,
    includeConnectionTools: databaseConnections.length > 0,
    databaseConnections,
  });
  lines.push(formatToolCatalogForCreatorBot(fullCatalog));

  // Add existing BaleyBots
  const existingBBText = formatExistingBaleybots(context.existingBaleybots);
  if (existingBBText) {
    lines.push(existingBBText);
  }

  // Add conversation history
  const historyText = formatConversationHistory(conversationHistory);
  if (historyText) {
    lines.push(historyText);
  }

  return lines.join('\n');
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Process a message through the Creator Bot.
 * Executes via the internal BaleyBot system with full tracking.
 */
export async function processCreatorMessage(
  options: CreatorBotOptions,
  userMessage: string
): Promise<CreatorOutput> {
  const context = buildCreatorContext(options);

  const { output } = await executeInternalBaleybot(
    'creator_bot',
    userMessage,
    {
      userWorkspaceId: options.context.workspaceId,
      context,
      triggeredBy: 'internal',
    }
  );

  // The creator_bot has no BAL output schema, so the model returns JSON as
  // text (guided by the CRITICAL instruction in the goal). Parse it here.
  const resolved = resolveCreatorOutput(output);
  const result = creatorOutputSchema.safeParse(resolved);
  if (result.success) {
    return result.data;
  }

  // Log for debugging, throw user-friendly error
  const logger = await import('@/lib/logger').then(m => m.createLogger('creator-bot'));
  logger.error('Creator bot output validation failed', {
    zodErrors: result.error.issues,
    outputType: typeof output,
    outputPreview: typeof output === 'string'
      ? output.slice(0, 500)
      : JSON.stringify(output).slice(0, 500),
  });
  throw new Error(
    'The AI returned an incomplete response. Please try again with a simpler description.'
  );
}

// ============================================================================
// STREAMING (FUTURE)
// ============================================================================

/**
 * Stream the Creator Bot response.
 *
 * This async generator simulates streaming by yielding chunks as they become
 * available. In the future, this will be updated to use true streaming from
 * the underlying AI model.
 *
 * @param options - Creator Bot options
 * @param userMessage - The user's message to process
 * @yields Streaming chunks with status updates, entities, connections, and final result
 */
export async function* streamCreatorMessage(
  options: CreatorBotOptions,
  userMessage: string
): AsyncGenerator<CreatorStreamChunk> {
  // Yield initial status
  yield {
    type: 'status',
    data: { message: 'Understanding your request...' },
  };

  // Process the message (in the future, this will be streaming)
  const result = await processCreatorMessage(options, userMessage);

  // Yield building status
  yield {
    type: 'status',
    data: { message: 'Designing entities...' },
  };

  // Yield entities one by one
  for (const entity of result.entities) {
    yield {
      type: 'entity',
      data: {
        id: entity.id,
        name: entity.name,
        icon: entity.icon,
        purpose: entity.purpose,
        tools: entity.tools,
      },
    } as CreatorStreamChunk;
  }

  // Yield connecting status
  if (result.connections.length > 0) {
    yield {
      type: 'status',
      data: { message: 'Connecting entities...' },
    };

    // Yield connections one by one
    for (const connection of result.connections) {
      yield {
        type: 'connection',
        data: {
          id: `conn-${connection.from}-${connection.to}`,
          from: connection.from,
          to: connection.to,
          label: connection.label,
        },
      } as CreatorStreamChunk;
    }
  }

  // Yield final status
  yield {
    type: 'status',
    data: { message: 'Generating BAL code...' },
  };

  // Yield the complete result
  yield {
    type: 'complete',
    data: result,
  };
}
