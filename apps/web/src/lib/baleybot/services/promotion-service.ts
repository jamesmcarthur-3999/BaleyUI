/**
 * Promotion Service
 *
 * Promotes ephemeral agents and tools to permanent workspace items.
 * This allows users to save useful dynamically-created items for reuse.
 */

import { db, tools, baleybots, eq, and, sql } from '@baleyui/db';
import type { EphemeralAgentConfig } from './ephemeral-agent-service';
import type { EphemeralToolConfig } from './ephemeral-tool-service';

// ============================================================================
// TYPES
// ============================================================================

export type PromotableItemType = 'agent' | 'tool';

export interface PromotableItem {
  type: PromotableItemType;
  config: EphemeralAgentConfig | EphemeralToolConfig;
  executionId?: string;
  usageCount?: number;
  createdAt?: Date;
}

export interface PromoteOptions {
  /** Override the name for the promoted item */
  name?: string;
  /** Override or add description */
  description?: string;
  /** Icon for the item (emoji or icon name) */
  icon?: string;
}

export interface PromotionResult {
  success: boolean;
  id: string;
  type: PromotableItemType;
  name: string;
  message: string;
}

// ============================================================================
// PROMOTION FUNCTIONS
// ============================================================================

/**
 * Promote an ephemeral tool to a permanent workspace tool
 */
export async function promoteToolToWorkspace(
  workspaceId: string,
  toolConfig: EphemeralToolConfig,
  options: PromoteOptions = {}
): Promise<PromotionResult> {
  const name = options.name ?? toolConfig.name;
  const description = options.description ?? toolConfig.description;

  // Check if tool with same name already exists
  const existing = await db.query.tools.findFirst({
    where: and(
      eq(tools.workspaceId, workspaceId),
      eq(tools.name, name),
      sql`${tools.deletedAt} IS NULL`
    ),
  });

  if (existing) {
    return {
      success: false,
      id: '',
      type: 'tool',
      name,
      message: `A tool named "${name}" already exists in this workspace`,
    };
  }

  // Create the permanent tool
  // For NL-implemented tools, we store the implementation as the code
  // with a special marker so we know to interpret it
  const code = `// @nl-implementation
// This tool was promoted from an ephemeral tool
// Implementation: ${toolConfig.implementation}

async function execute(args) {
  // This code is interpreted by AI at runtime
  throw new Error('NL-implemented tools require AI interpretation');
}`;

  const [promotedTool] = await db
    .insert(tools)
    .values({
      workspaceId,
      name,
      description,
      inputSchema: toolConfig.inputSchema ?? {
        type: 'object',
        properties: {
          input: { type: 'string', description: 'Input to the tool' },
        },
      },
      code,
      isGenerated: false,
    })
    .returning({ id: tools.id });

  console.log(
    `[promotion-service] Promoted ephemeral tool "${toolConfig.name}" to workspace tool "${name}" (id: ${promotedTool!.id})`
  );

  return {
    success: true,
    id: promotedTool!.id,
    type: 'tool',
    name,
    message: `Tool "${name}" has been promoted and is now available in your workspace`,
  };
}

/**
 * Promote an ephemeral agent to a permanent BaleyBot
 */
export async function promoteAgentToWorkspace(
  workspaceId: string,
  agentConfig: EphemeralAgentConfig,
  options: PromoteOptions = {}
): Promise<PromotionResult> {
  const name = options.name ?? agentConfig.name;
  const description = options.description ?? agentConfig.goal;

  // Check if BB with same name already exists
  const existing = await db.query.baleybots.findFirst({
    where: and(
      eq(baleybots.workspaceId, workspaceId),
      eq(baleybots.name, name),
      sql`${baleybots.deletedAt} IS NULL`
    ),
  });

  if (existing) {
    return {
      success: false,
      id: '',
      type: 'agent',
      name,
      message: `A BaleyBot named "${name}" already exists in this workspace`,
    };
  }

  // Generate BAL code from agent config
  const toolsList = agentConfig.tools && agentConfig.tools.length > 0
    ? `  "tools": [${agentConfig.tools.map((t) => `"${t}"`).join(', ')}],\n`
    : '';

  const modelLine = agentConfig.model
    ? `  "model": "${agentConfig.model}",\n`
    : '';

  const balCode = `${name.toLowerCase().replace(/[^a-z0-9]+/g, '_')} {
  "goal": "${agentConfig.goal.replace(/"/g, '\\"')}",
${modelLine}${toolsList}}`;

  // Create the BaleyBot
  const [promotedBot] = await db
    .insert(baleybots)
    .values({
      workspaceId,
      name,
      description,
      icon: options.icon ?? '🤖',
      status: 'draft',
      balCode,
      entityNames: [name.toLowerCase().replace(/[^a-z0-9]+/g, '_')],
    })
    .returning({ id: baleybots.id });

  console.log(
    `[promotion-service] Promoted ephemeral agent "${agentConfig.name}" to BaleyBot "${name}" (id: ${promotedBot!.id})`
  );

  return {
    success: true,
    id: promotedBot!.id,
    type: 'agent',
    name,
    message: `Agent "${name}" has been promoted to a BaleyBot and is now available in your workspace`,
  };
}

/**
 * Promote any promotable item to workspace
 */
export async function promoteToWorkspace(
  workspaceId: string,
  item: PromotableItem,
  options: PromoteOptions = {}
): Promise<PromotionResult> {
  if (item.type === 'tool') {
    return promoteToolToWorkspace(
      workspaceId,
      item.config as EphemeralToolConfig,
      options
    );
  } else {
    return promoteAgentToWorkspace(
      workspaceId,
      item.config as EphemeralAgentConfig,
      options
    );
  }
}

// ============================================================================
// QUERY FUNCTIONS
// ============================================================================

/**
 * Get all promotable items from a specific execution
 * (Would need to be called during/after execution to capture ephemeral items)
 */
export function getPromotableItemsFromExecution(
  ephemeralAgents: EphemeralAgentConfig[],
  ephemeralTools: EphemeralToolConfig[],
  executionId: string
): PromotableItem[] {
  const items: PromotableItem[] = [];

  for (const agent of ephemeralAgents) {
    items.push({
      type: 'agent',
      config: agent,
      executionId,
      createdAt: new Date(),
    });
  }

  for (const tool of ephemeralTools) {
    items.push({
      type: 'tool',
      config: tool,
      executionId,
      createdAt: new Date(),
    });
  }

  return items;
}

/**
 * Check if an item can be promoted (no name conflicts)
 */
export async function canPromote(
  workspaceId: string,
  item: PromotableItem
): Promise<{ canPromote: boolean; reason?: string }> {
  const name = item.type === 'tool'
    ? (item.config as EphemeralToolConfig).name
    : (item.config as EphemeralAgentConfig).name;

  if (item.type === 'tool') {
    const existing = await db.query.tools.findFirst({
      where: and(
        eq(tools.workspaceId, workspaceId),
        eq(tools.name, name),
        sql`${tools.deletedAt} IS NULL`
      ),
    });

    if (existing) {
      return {
        canPromote: false,
        reason: `A tool named "${name}" already exists`,
      };
    }
  } else {
    const existing = await db.query.baleybots.findFirst({
      where: and(
        eq(baleybots.workspaceId, workspaceId),
        eq(baleybots.name, name),
        sql`${baleybots.deletedAt} IS NULL`
      ),
    });

    if (existing) {
      return {
        canPromote: false,
        reason: `A BaleyBot named "${name}" already exists`,
      };
    }
  }

  return { canPromote: true };
}
