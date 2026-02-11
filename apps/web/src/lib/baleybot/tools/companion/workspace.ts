/**
 * Workspace & Profile Tools for Baley
 */

import type { RuntimeToolDefinition } from '../../executor';
import type { CompanionToolContext } from './index';
import { db, workspaces, notDeleted, eq, and } from '@baleyui/db';

export function buildWorkspaceTools(
  ctx: CompanionToolContext
): Map<string, RuntimeToolDefinition> {
  const tools = new Map<string, RuntimeToolDefinition>();

  tools.set('get_workspace_info', {
    name: 'get_workspace_info',
    description:
      'Get workspace information: name, slug, owner, and creation date.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
    async function() {
      const workspace = await db.query.workspaces.findFirst({
        where: and(
          eq(workspaces.id, ctx.workspaceId),
          notDeleted(workspaces)
        ),
      });

      if (!workspace) {
        return { success: false, error: 'Workspace not found' };
      }

      return {
        id: workspace.id,
        name: workspace.name,
        slug: workspace.slug,
        ownerId: workspace.ownerId,
        createdAt: workspace.createdAt.toISOString(),
      };
    },
  });

  tools.set('update_workspace', {
    name: 'update_workspace',
    description: 'Update the workspace name.',
    inputSchema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'New workspace name',
        },
      },
      required: ['name'],
    },
    async function(args) {
      const name = args.name as string;

      const workspace = await db.query.workspaces.findFirst({
        where: and(
          eq(workspaces.id, ctx.workspaceId),
          notDeleted(workspaces)
        ),
      });

      if (!workspace) {
        return { success: false, error: 'Workspace not found' };
      }

      await db
        .update(workspaces)
        .set({ name, updatedAt: new Date() })
        .where(eq(workspaces.id, ctx.workspaceId));

      return {
        success: true,
        message: `Workspace renamed to "${name}".`,
      };
    },
  });

  return tools;
}
