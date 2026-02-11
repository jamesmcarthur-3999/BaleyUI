/**
 * Tool Management Tools for Baley
 */

import type { RuntimeToolDefinition } from '../../executor';
import type { CompanionToolContext } from './index';
import { db, tools as toolsTable, notDeleted, eq, and, softDelete } from '@baleyui/db';
import { BUILT_IN_TOOLS_METADATA, isBuiltInTool } from '../built-in';

export function buildToolTools(
  ctx: CompanionToolContext
): Map<string, RuntimeToolDefinition> {
  const tools = new Map<string, RuntimeToolDefinition>();

  tools.set('list_tools', {
    name: 'list_tools',
    description:
      'List all tools available in the workspace: built-in tools, custom tools, and database tools.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
    async function() {
      // Built-in tools
      const builtIn = BUILT_IN_TOOLS_METADATA.map((meta) => ({
        name: meta.name,
        description: meta.description,
        category: 'built-in' as const,
        approvalRequired: meta.approvalRequired,
      }));

      // Custom tools from DB
      const customTools = await db.query.tools.findMany({
        where: and(
          eq(toolsTable.workspaceId, ctx.workspaceId),
          notDeleted(toolsTable)
        ),
        columns: {
          id: true,
          name: true,
          description: true,
          connectionId: true,
          isGenerated: true,
          createdAt: true,
        },
      });

      return {
        builtIn,
        custom: customTools.map((t) => ({
          id: t.id,
          name: t.name,
          description: t.description,
          category: t.connectionId ? 'database' : 'custom',
          isGenerated: t.isGenerated,
          createdAt: t.createdAt.toISOString(),
        })),
        totalBuiltIn: builtIn.length,
        totalCustom: customTools.filter((t) => !t.connectionId).length,
        totalDatabase: customTools.filter((t) => t.connectionId).length,
      };
    },
  });

  tools.set('create_tool', {
    name: 'create_tool',
    description:
      'Create a new custom tool in the workspace.',
    inputSchema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Tool name (lowercase, underscores)',
        },
        description: {
          type: 'string',
          description: 'What this tool does',
        },
        inputSchema: {
          type: 'object',
          description: 'JSON Schema for tool inputs',
        },
        code: {
          type: 'string',
          description: 'TypeScript function body for the tool implementation',
        },
      },
      required: ['name', 'description', 'inputSchema', 'code'],
    },
    async function(args) {
      const name = args.name as string;

      // Guard against built-in tool names
      if (isBuiltInTool(name)) {
        return {
          success: false,
          error: `"${name}" is a reserved built-in tool name. Choose a different name.`,
        };
      }

      const [created] = await db
        .insert(toolsTable)
        .values({
          workspaceId: ctx.workspaceId,
          name,
          description: args.description as string,
          inputSchema: args.inputSchema as Record<string, unknown>,
          code: args.code as string,
        })
        .returning();

      return {
        success: true,
        tool: {
          id: created!.id,
          name: created!.name,
        },
        message: `Tool "${name}" created successfully.`,
      };
    },
  });

  tools.set('delete_tool', {
    name: 'delete_tool',
    description:
      'Delete a custom tool. This is destructive — Baley should confirm with the user first.',
    inputSchema: {
      type: 'object',
      properties: {
        toolId: {
          type: 'string',
          description: 'The UUID of the tool to delete',
        },
      },
      required: ['toolId'],
    },
    needsApproval: true,
    async function(args) {
      const toolId = args.toolId as string;

      const tool = await db.query.tools.findFirst({
        where: and(
          eq(toolsTable.id, toolId),
          eq(toolsTable.workspaceId, ctx.workspaceId),
          notDeleted(toolsTable)
        ),
      });

      if (!tool) {
        return { success: false, error: 'Tool not found' };
      }

      await softDelete(toolsTable, toolId, ctx.userId);

      return {
        success: true,
        message: `Tool "${tool.name}" has been deleted.`,
      };
    },
  });

  return tools;
}
