/**
 * BAL Generator Service
 *
 * Converts natural language descriptions into BAL (Baleybots Assembly Language) code.
 * Uses AI to understand user intent and generate appropriate configurations.
 */

import { Baleybot, type Processable } from '@baleybots/core';
import { z } from 'zod';
import type {
  GeneratorContext,
  GenerateResult,
  GeneratedEntity,
  GenerationMessage,
  BaleybotSummary,
} from './types';
import { buildToolCatalog, formatToolCatalogForAI, categorizeToolName } from './tool-catalog';

// ============================================================================
// SCHEMAS
// ============================================================================

/**
 * Schema for the generator's structured output
 */
const generateResultSchema = z.object({
  balCode: z.string().describe('The generated BAL code'),
  explanation: z.string().describe('Human-readable explanation of what the BaleyBot does'),
  entities: z.array(
    z.object({
      name: z.string().describe('Entity name (e.g., activity_poller)'),
      goal: z.string().describe('The goal/purpose of this entity'),
      model: z.string().optional().describe('AI model to use (e.g., openai:gpt-4o-mini)'),
      tools: z.array(z.string()).describe('Tools with immediate access'),
      canRequest: z.array(z.string()).describe('Tools that require approval'),
      output: z.record(z.string(), z.string()).optional().describe('Output schema'),
      history: z.enum(['none', 'inherit']).optional().describe('Conversation history mode'),
    })
  ),
  toolRationale: z.record(z.string(), z.string()).describe('Explanation for each tool assignment'),
  suggestedName: z.string().describe('Suggested name for the BaleyBot'),
  suggestedIcon: z.string().describe('Suggested emoji icon'),
});

// ============================================================================
// SYSTEM PROMPT
// ============================================================================

const BAL_SYNTAX_REFERENCE = `
# BAL (Baleybots Assembly Language) Syntax Reference

BAL is used to define BaleyBot configurations. Each entity is an AI agent with a specific purpose.

## Entity Definition
\`\`\`bal
entity_name {
  "goal": "What this entity should accomplish",
  "model": "provider:model-name",  // Optional, e.g., "openai:gpt-4o-mini"
  "tools": ["tool1", "tool2"],     // Immediate access tools
  "can_request": ["tool3"],         // Tools requiring approval
  "output": {                       // Optional output schema
    "field1": "type",
    "field2": "type"
  },
  "history": "none" | "inherit"     // Optional, default is "inherit"
}
\`\`\`

## Chaining Entities
\`\`\`bal
chain {
  entity1
  entity2
  entity3
}
\`\`\`

## Conditional Execution
\`\`\`bal
when condition_entity {
  "pass": pass_entity,
  "fail": fail_entity
}
\`\`\`

## Parallel Execution
\`\`\`bal
parallel {
  "branch1": entity1,
  "branch2": entity2
}
\`\`\`

## Example: Activity Monitor
\`\`\`bal
activity_poller {
  "goal": "Poll database for new user events every 5 minutes",
  "model": "openai:gpt-4o-mini",
  "tools": ["query_database"],
  "history": "none"
}

trend_analyzer {
  "goal": "Analyze event patterns and identify trends",
  "model": "anthropic:claude-sonnet-4-20250514",
  "tools": ["query_database"],
  "can_request": ["send_notification"],
  "output": {
    "trends": "array",
    "anomalies": "array"
  }
}

reporter {
  "goal": "Generate human-readable insights report",
  "history": "inherit"
}

chain {
  activity_poller
  trend_analyzer
  reporter
}
\`\`\`

## Tool Assignment Rules
1. **tools**: Use for read-only or safe operations the entity needs directly
2. **can_request**: Use for write operations, external effects, or dangerous tools
3. Never assign forbidden tools
4. Match tools to the entity's specific goal
`;

function buildSystemPrompt(ctx: GeneratorContext): string {
  const toolCatalog = buildToolCatalog({
    availableTools: ctx.availableTools,
    policies: ctx.workspacePolicies,
  });

  const existingBBsSection =
    ctx.existingBaleybots.length > 0
      ? `
## Existing BaleyBots (can be called via spawn_baleybot)
${ctx.existingBaleybots.map((bb) => `- **${bb.name}** (${bb.id}): ${bb.description || 'No description'}`).join('\n')}

You can have entities call existing BaleyBots using the spawn_baleybot tool.
`
      : '';

  return `You are a BAL (Baleybots Assembly Language) code generator.

Your task is to convert user descriptions into valid BAL code that defines BaleyBot configurations.

${BAL_SYNTAX_REFERENCE}

${formatToolCatalogForAI(toolCatalog)}

${existingBBsSection}

## Guidelines

1. **Understand Intent**: Carefully analyze what the user wants to accomplish
2. **Keep It Simple**: Use the minimum number of entities needed
3. **Appropriate Tools**: Only assign tools relevant to each entity's goal
4. **Safety First**: Put dangerous/write tools in can_request, not tools
5. **Clear Names**: Use descriptive snake_case names for entities
6. **Good Defaults**: Use appropriate models (gpt-4o-mini for simple tasks, claude-sonnet for complex reasoning)
7. **Helpful Icons**: Suggest relevant emoji icons

## Output Format

Return a structured response with:
- balCode: The complete BAL code
- explanation: A brief explanation of what this BaleyBot does
- entities: Array of entity definitions
- toolRationale: Explanation for why each tool was assigned
- suggestedName: A good name for this BaleyBot
- suggestedIcon: A relevant emoji

Always generate valid BAL code that follows the syntax reference.
`;
}

// ============================================================================
// GENERATOR SERVICE
// ============================================================================

/**
 * Create a BAL generator Baleybot
 */
export function createBalGenerator(ctx: GeneratorContext): Processable<string, unknown> {
  const systemPrompt = buildSystemPrompt(ctx);

  return Baleybot.create({
    name: 'bal_generator',
    goal: `${systemPrompt}

Generate BAL code based on the user's description. Always return valid BAL code that can be executed.`,
    model: 'anthropic:claude-sonnet-4-20250514',
    outputSchema: generateResultSchema,
  });
}

/**
 * Generate BAL code from a user description
 */
export async function generateBal(
  ctx: GeneratorContext,
  userDescription: string,
  conversationHistory?: GenerationMessage[]
): Promise<GenerateResult> {
  const generator = createBalGenerator(ctx);

  // Build the input message
  let input = userDescription;

  // If there's conversation history, include it for refinement
  if (conversationHistory && conversationHistory.length > 0) {
    const historyText = conversationHistory
      .map((msg) => `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}`)
      .join('\n\n');

    input = `Previous conversation:
${historyText}

User's latest request:
${userDescription}

Please refine the BAL code based on this feedback.`;
  }

  const result = await generator.process(input);

  // Validate the result
  const parsed = generateResultSchema.parse(result);

  // Validate tool assignments against policies
  const validatedEntities = validateToolAssignments(ctx, parsed.entities);

  return {
    ...parsed,
    entities: validatedEntities,
  };
}

/**
 * Validate and adjust tool assignments based on workspace policies
 */
function validateToolAssignments(
  ctx: GeneratorContext,
  entities: GeneratedEntity[]
): GeneratedEntity[] {
  return entities.map((entity) => {
    const validatedTools: string[] = [];
    const validatedCanRequest: string[] = [];

    // Check each tool in the tools array
    for (const toolName of entity.tools) {
      const category = categorizeToolName(toolName, ctx.workspacePolicies);
      if (category === 'immediate') {
        validatedTools.push(toolName);
      } else if (category === 'requires_approval') {
        // Move to can_request
        validatedCanRequest.push(toolName);
      }
      // Forbidden tools are dropped
    }

    // Check each tool in the can_request array
    for (const toolName of entity.canRequest) {
      const category = categorizeToolName(toolName, ctx.workspacePolicies);
      if (category !== 'forbidden') {
        validatedCanRequest.push(toolName);
      }
      // Forbidden tools are dropped
    }

    return {
      ...entity,
      tools: validatedTools,
      canRequest: [...new Set(validatedCanRequest)], // Remove duplicates
    };
  });
}

/**
 * Parse BAL code and extract entity definitions
 */
export function parseBalCode(balCode: string): {
  entities: Array<{ name: string; config: Record<string, unknown> }>;
  chain?: string[];
  errors: string[];
} {
  const entities: Array<{ name: string; config: Record<string, unknown> }> = [];
  const errors: string[] = [];
  let chain: string[] | undefined;

  // Simple regex-based parser for BAL syntax
  // In production, this would be a proper parser

  // Match entity definitions
  const entityRegex = /(\w+)\s*\{([^}]+)\}/g;
  let match;

  while ((match = entityRegex.exec(balCode)) !== null) {
    const name = match[1];
    const configStr = match[2];

    if (!name || !configStr) {
      continue;
    }

    if (name === 'chain') {
      // Parse chain directive
      chain = configStr
        .split(/\s+/)
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
    } else if (name === 'parallel' || name === 'when') {
      // These are control structures, handle separately
      // For now, skip
    } else {
      // Parse entity config as JSON-like
      try {
        // Convert BAL config to JSON
        const jsonStr = configStr
          .replace(/(\w+):/g, '"$1":') // Add quotes to keys
          .replace(/'/g, '"'); // Convert single quotes to double

        const config = JSON.parse(`{${jsonStr}}`) as Record<string, unknown>;
        entities.push({ name, config });
      } catch {
        errors.push(`Failed to parse entity "${name}": Invalid configuration syntax`);
      }
    }
  }

  return { entities, chain, errors };
}

/**
 * Validate BAL code structure
 */
export function validateBalCode(balCode: string): {
  valid: boolean;
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];

  const { entities, chain, errors: parseErrors } = parseBalCode(balCode);
  errors.push(...parseErrors);

  // Check for at least one entity
  if (entities.length === 0) {
    errors.push('BAL code must define at least one entity');
  }

  // Check chain references valid entities
  if (chain) {
    const entityNames = new Set(entities.map((e) => e.name));
    for (const name of chain) {
      if (!entityNames.has(name)) {
        errors.push(`Chain references undefined entity: ${name}`);
      }
    }
  }

  // Validate each entity
  for (const entity of entities) {
    if (!entity.config.goal) {
      warnings.push(`Entity "${entity.name}" is missing a goal`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Format existing BaleyBots for the generator context
 */
export function formatExistingBaleybots(
  baleybots: Array<{ id: string; name: string; description: string | null }>
): BaleybotSummary[] {
  return baleybots.map((bb) => ({
    id: bb.id,
    name: bb.name,
    description: bb.description,
    icon: null,
    status: 'active' as const,
    executionCount: 0,
    lastExecutedAt: null,
  }));
}
