/**
 * Creator Bot Service
 *
 * The Creator Bot is a specialized BaleyBot that helps users build other BaleyBots
 * through natural conversation. When a user describes what they need, the Creator Bot
 * designs entities, picks tools, and generates BAL code.
 */

import { Baleybot, type Processable } from '@baleybots/core';
import {
  creatorOutputSchema,
  type CreatorOutput,
  type CreatorMessage,
  type CreatorStreamChunk,
} from './creator-types';
import type { GeneratorContext } from './types';
import { buildToolCatalog, formatToolCatalogForAI } from './tool-catalog';
import {
  getToolCatalog,
  formatToolCatalogForCreatorBot,
  getBuiltInToolDefinitions,
} from './tools/catalog-service';

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
  "output": { "field": "type" }
}
\`\`\`

Entities are chained:
\`\`\`bal
chain { entity1 entity2 entity3 }
\`\`\`

## Built-in Tools Reference

### Built-in Tools (use in "tools" array)

**web_search** - Search the web for information
- Input: { query: string, num_results?: number (default 5, max 20) }
- Use for: researching topics, finding current information, competitor analysis
- Example: A BB that monitors industry news

**fetch_url** - Fetch content from any URL
- Input: { url: string, format?: "html" | "text" | "json" (default "text") }
- Use for: reading web pages, fetching API data, scraping content
- Example: A BB that extracts data from a specific webpage

**spawn_baleybot** - Execute another BaleyBot and return its result
- Input: { baleybot: string (name or ID), input?: any }
- Use for: delegating work, building complex pipelines, reusing existing BBs
- Example: A coordinator BB that calls specialist BBs

**send_notification** - Send an in-app notification to the user
- Input: { title: string, message: string, priority?: "low" | "normal" | "high" }
- Use for: alerts, status updates, important results
- Example: A BB that notifies when a task completes

**store_memory** - Persist key-value data across BB executions
- Input: { action: "get" | "set" | "delete" | "list", key?: string, value?: any }
- Use for: caching, state management, remembering user preferences
- Example: A BB that tracks which items have been processed

### Approval Required Tools (approval handled at runtime)

**schedule_task** - Schedule a BB to run at a future time
- Input: { baleybot?: string, run_at: string (ISO datetime or cron), input?: any }
- Use for: delayed tasks, recurring jobs, scheduled reports
- Example: A BB that runs daily at 9am to generate reports

**create_agent** - Create a temporary specialized AI agent
- Input: { name: string, goal: string, model?: string, tools?: string[] }
- Use for: dynamic subtasks, specialized processing, on-demand expertise
- Example: A BB that spawns a researcher agent for specific questions

**create_tool** - Define a custom tool for the current execution
- Input: { name: string, description: string, input_schema?: object, implementation: string }
- Use for: dynamic capabilities, one-off operations
- Note: Implementation is natural language, interpreted by AI

## Tool Selection Guidelines

1. **Information gathering**: Use web_search for general queries, fetch_url for specific pages
2. **Complex workflows**: Use spawn_baleybot to call other BBs, or create a multi-entity chain
3. **User communication**: Use send_notification for important updates
4. **State persistence**: Use store_memory to remember things between executions
5. **Scheduled operations**: Use schedule_task (requires approval) for timed tasks
6. **Dynamic behavior**: Use create_agent or create_tool (require approval) for flexibility

## Design Principles

1. Keep it simple - use minimum entities needed
2. Use descriptive snake_case names
3. Put required tools in "tools" and rely on runtime approvals for sensitive actions
4. Choose relevant emoji icons
5. Generate helpful, concise names
6. Prefer built-in tools when they fit the use case

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

  // Combine built-in tools with workspace tools
  const builtInTools = getBuiltInToolDefinitions();
  const allTools = [...builtInTools, ...context.availableTools];

  // Build full tool catalog using the new catalog service
  const fullCatalog = getToolCatalog({
    workspaceId: context.workspaceId,
    workspacePolicies: context.workspacePolicies,
    workspaceTools: context.availableTools,
  });

  // Format tool catalog for Creator Bot (comprehensive format)
  const toolCatalogText = formatToolCatalogForCreatorBot(fullCatalog);

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
