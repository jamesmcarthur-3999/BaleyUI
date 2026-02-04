/**
 * BAL Generator Service
 *
 * Converts natural language descriptions into BAL (Baleybots Assembly Language) code.
 * Uses AI to understand user intent and generate appropriate configurations.
 */

import { Baleybot, type Processable } from '@baleybots/core';
import { parse, tokenize } from '@baleybots/tools';
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
      tools: z.array(z.string()).describe('Tools assigned to the entity (approvals handled at runtime)'),
      canRequest: z.array(z.string()).default([]).describe('Tools that require approval'),
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
# BAL (Baleybots Assembly Language) Syntax Reference (v2)

BAL is used to define BaleyBot configurations. Each entity is an AI agent with a specific purpose.

## Entity Definition
\`\`\`bal
entity_name {
  "goal": "What this entity should accomplish",
  "model": "provider:model-name",  // Optional, e.g., "openai:gpt-4o-mini"
  "tools": ["tool1", "tool2"],     // Tools available to the entity
  "output": {                      // Optional output schema
    "field1": "type",
    "field2": "type"
  },
  "history": "none" | "inherit"    // Optional, default is "inherit"
}
\`\`\`

## Sequential Execution
\`\`\`bal
chain {
  entity1
  entity2
  entity3
}
\`\`\`

## Conditional Execution
\`\`\`bal
if ("result.is_good") {
  pass_entity
} else {
  fail_entity
}
\`\`\`

## Parallel Execution
\`\`\`bal
parallel {
  entity1
  entity2
}
\`\`\`

## Loop Execution
\`\`\`bal
loop ("until": "result.quality > 0.9", "max": 5) {
  improver
}
\`\`\`

## Run Input
\`\`\`bal
run("Your input text here")
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
  "tools": ["query_database", "send_notification"],
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
2. For risky tools, include them in tools but expect approval at runtime
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
4. **Safety First**: Only include risky tools when essential; approvals are handled at runtime
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
    const toolNames = [...entity.tools, ...(entity.canRequest ?? [])];

    for (const toolName of toolNames) {
      const category = categorizeToolName(toolName, ctx.workspacePolicies);
      if (category !== 'forbidden') {
        validatedTools.push(toolName);
      }
      // Forbidden tools are dropped
    }

    return {
      ...entity,
      tools: [...new Set(validatedTools)], // Remove duplicates
      canRequest: [],
    };
  });
}

function typeSpecToString(spec: { kind: string; [key: string]: unknown }): string {
  switch (spec.kind) {
    case 'string':
      return 'string';
    case 'number':
      return 'number';
    case 'boolean':
      return 'boolean';
    case 'array':
      return 'array';
    case 'object':
      return 'object';
    case 'optional': {
      const inner = spec.inner as { kind: string; [key: string]: unknown } | undefined;
      return inner ? `${typeSpecToString(inner)}?` : 'optional';
    }
    default:
      return 'string';
  }
}

function outputSchemaToRecord(output: { fields: Array<{ name: string; fieldType: { kind: string } }> }): Record<string, string> {
  const result: Record<string, string> = {};
  for (const field of output.fields) {
    result[field.name] = typeSpecToString(field.fieldType as { kind: string; [key: string]: unknown });
  }
  return result;
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

  try {
    const tokens = tokenize(balCode);
    const ast = parse(tokens, balCode);

    for (const entity of ast.entities.values()) {
      entities.push({
        name: entity.name,
        config: {
          goal: entity.goal,
          model: entity.model,
          tools: entity.tools ?? [],
          output: entity.output ? outputSchemaToRecord(entity.output as { fields: Array<{ name: string; fieldType: { kind: string } }> }) : undefined,
          history: entity.history,
        },
      });
    }

    return { entities, chain: undefined, errors: [] };
  } catch (error) {
    return {
      entities: [],
      chain: undefined,
      errors: [error instanceof Error ? error.message : String(error)],
    };
  }
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

  const { entities, errors: parseErrors } = parseBalCode(balCode);
  errors.push(...parseErrors);

  // Check for at least one entity
  if (entities.length === 0) {
    errors.push('BAL code must define at least one entity');
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
