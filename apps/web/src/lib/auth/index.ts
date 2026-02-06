/**
 * Authentication utilities for API routes
 */

import { auth } from '@clerk/nextjs/server';
import { db, notDeleted } from '@baleyui/db';

export interface Workspace {
  id: string;
  name: string;
  slug: string;
  ownerId: string;
  version: number;
}

export interface AuthResult {
  userId: string;
  workspace: Workspace;
}

/**
 * Get the current authenticated user and their workspace
 * Throws an error if not authenticated or no workspace found
 */
export async function getCurrentAuth(): Promise<AuthResult> {
  const { userId } = await auth();

  if (!userId) {
    throw new Error('Not authenticated');
  }

  const workspace = await db.query.workspaces.findFirst({
    where: (ws, { eq, and }) =>
      and(eq(ws.ownerId, userId), notDeleted(ws)),
  });

  if (!workspace) {
    throw new Error('No workspace found');
  }

  return {
    userId,
    workspace: {
      id: workspace.id,
      name: workspace.name,
      slug: workspace.slug,
      ownerId: workspace.ownerId,
      version: workspace.version,
    },
  };
}

/**
 * Get the current workspace ID
 * Returns null if not authenticated or no workspace
 */
export async function getCurrentWorkspaceId(): Promise<string | null> {
  try {
    const { workspace } = await getCurrentAuth();
    return workspace.id;
  } catch {
    return null;
  }
}

/**
 * Verify that the authenticated user owns the specified workspace
 * Returns the workspace if owned, null if not authenticated or not owned
 */
export async function verifyWorkspaceOwnership(
  workspaceId: string
): Promise<Workspace | null> {
  const { userId } = await auth();

  if (!userId) {
    return null;
  }

  const workspace = await db.query.workspaces.findFirst({
    where: (ws, { eq, and }) =>
      and(
        eq(ws.id, workspaceId),
        eq(ws.ownerId, userId),
        notDeleted(ws)
      ),
  });

  if (!workspace) {
    return null;
  }

  return {
    id: workspace.id,
    name: workspace.name,
    slug: workspace.slug,
    ownerId: workspace.ownerId,
    version: workspace.version,
  };
}
