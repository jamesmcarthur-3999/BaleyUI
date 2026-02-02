/**
 * Creator Bot Service
 *
 * The Creator Bot is a specialized BaleyBot that helps users build other BaleyBots
 * through natural conversation. When a user describes what they need, the Creator Bot
 * designs entities, picks tools, and generates BAL code.
 */

import { Baleybot, type Processable } from '@baleybots/core';
import { creatorOutputSchema, type CreatorOutput, type CreatorMessage } from './creator-types';
import type { GeneratorContext } from './types';
import { buildToolCatalog, formatToolCatalogForAI } from './tool-catalog';

// ============================================================================
// SYSTEM PROMPT
// ============================================================================

const CREATOR_SYSTEM_PROMPT = `You are a BaleyBot Creator. You help users build AI automation bots through natural conversation.

Your job is to:
1. Understand what the user wants to accomplish
2. Design a BaleyBot with appropriate entities and tools
3. Output a visual representation the user can see being built

## How You Work

When a user describes what they need:
- Analyze their request
- Design entities (AI agents) that work together
- Choose appropriate tools for each entity
- Generate valid BAL code

When a user asks for changes:
- Understand what they want modified
- Update the relevant entities/tools
- Regenerate the BAL code

## BAL Syntax

Each entity is defined as:
\`\`\`bal
entity_name {
  "goal": "What this entity accomplishes",
  "model": "provider:model-name",
  "tools": ["tool1", "tool2"],
  "can_request": ["dangerous_tool"],
  "output": { "field": "type" }
}
\`\`\`

Entities are chained:
\`\`\`bal
chain { entity1 entity2 entity3 }
\`\`\`

## Guidelines

1. Keep it simple - use minimum entities needed
2. Use descriptive snake_case names
3. Put read-only tools in "tools", write/dangerous in "can_request"
4. Choose relevant emoji icons
5. Generate helpful, concise names

## Output Format

Always output structured data with:
- entities: Array of visual entities with id, name, icon, purpose, tools
- connections: How entities connect (from/to)
- balCode: The complete BAL code
- name: Suggested BaleyBot name
- icon: Emoji icon
- status: "building" while working, "ready" when done
`;

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
// HELPER FUNCTIONS
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
 * Build the full system prompt with dynamic context
 */
function buildSystemPrompt(options: CreatorBotOptions): string {
  const { context, conversationHistory = [] } = options;

  // Build tool catalog
  const toolCatalog = buildToolCatalog({
    availableTools: context.availableTools,
    policies: context.workspacePolicies,
  });

  // Format tool catalog for AI
  const toolCatalogText = formatToolCatalogForAI(toolCatalog);

  // Format existing BaleyBots
  const existingBBText = formatExistingBaleybots(context.existingBaleybots);

  // Format conversation history
  const historyText = formatConversationHistory(conversationHistory);

  return `${CREATOR_SYSTEM_PROMPT}

${toolCatalogText}
${existingBBText}
${historyText}`;
}

// ============================================================================
// CREATOR BOT FACTORY
// ============================================================================

/**
 * Create a Creator Bot instance.
 *
 * The Creator Bot uses the provided context to understand what tools are available
 * and what policies apply, then helps the user design BaleyBots through conversation.
 */
export function createCreatorBot(
  options: CreatorBotOptions
): Processable<string, CreatorOutput> {
  const systemPrompt = buildSystemPrompt(options);

  return Baleybot.create({
    name: 'creator_bot',
    goal: `${systemPrompt}

Help the user create a BaleyBot based on their description. Design appropriate entities, select relevant tools, and generate valid BAL code. Always output structured data in the required format.`,
    model: 'anthropic:claude-sonnet-4-20250514',
    outputSchema: creatorOutputSchema,
  }) as Processable<string, CreatorOutput>;
}

// ============================================================================
// MESSAGE PROCESSING
// ============================================================================

/**
 * Process a single message from the user and return a Creator output.
 *
 * This is the main entry point for the Creator Bot service. It creates a new
 * bot instance, processes the user's message, and returns the structured output.
 */
export async function processCreatorMessage(
  options: CreatorBotOptions,
  userMessage: string
): Promise<CreatorOutput> {
  const bot = createCreatorBot(options);
  const result = await bot.process(userMessage);

  // Validate and parse the result
  const parsed = creatorOutputSchema.parse(result);

  return parsed;
}

// ============================================================================
// STREAMING (FUTURE)
// ============================================================================

/**
 * Stream chunk types for the Creator Bot output
 */
export type CreatorStreamChunk =
  | { type: 'status'; data: { message: string } }
  | { type: 'entity'; data: CreatorOutput['entities'][number] }
  | { type: 'connection'; data: CreatorOutput['connections'][number] }
  | { type: 'complete'; data: CreatorOutput };

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
      data: entity,
    };
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
        data: connection,
      };
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
