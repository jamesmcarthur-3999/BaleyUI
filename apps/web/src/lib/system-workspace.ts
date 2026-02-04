/**
 * System Workspace
 *
 * A special workspace that owns all internal BaleyBots.
 * This workspace is not visible to users and is created automatically.
 */

import { db, workspaces, eq, notDeleted } from '@baleyui/db';

export const SYSTEM_WORKSPACE_SLUG = '__system__';
export const SYSTEM_WORKSPACE_NAME = 'System';
export const SYSTEM_OWNER_ID = '__system__';

// Cache the system workspace ID
let cachedSystemWorkspaceId: string | null = null;

/**
 * Get or create the system workspace.
 * Returns the workspace ID.
 */
export async function getOrCreateSystemWorkspace(): Promise<string> {
  // Return cached value if available
  if (cachedSystemWorkspaceId) {
    return cachedSystemWorkspaceId;
  }

  // Try to find existing system workspace
  const existing = await db.query.workspaces.findFirst({
    where: (ws, { and }) =>
      and(eq(ws.slug, SYSTEM_WORKSPACE_SLUG), notDeleted(ws)),
  });

  if (existing) {
    cachedSystemWorkspaceId = existing.id;
    return existing.id;
  }

  // Create the system workspace
  const [created] = await db
    .insert(workspaces)
    .values({
      name: SYSTEM_WORKSPACE_NAME,
      slug: SYSTEM_WORKSPACE_SLUG,
      ownerId: SYSTEM_OWNER_ID,
    })
    .returning();

  if (!created) {
    throw new Error('Failed to create system workspace');
  }

  cachedSystemWorkspaceId = created.id;
  return created.id;
}

/**
 * Check if a workspace ID is the system workspace
 */
export function isSystemWorkspace(workspaceId: string): boolean {
  return workspaceId === cachedSystemWorkspaceId;
}

/**
 * Clear the cached system workspace ID (for testing)
 */
export function clearSystemWorkspaceCache(): void {
  cachedSystemWorkspaceId = null;
}
