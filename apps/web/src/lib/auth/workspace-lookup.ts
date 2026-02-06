/**
 * Workspace Lookup Helper
 *
 * Shared helper for looking up a user's workspace in API routes.
 * Replaces inline workspace lookups that used isNull(ws.deletedAt)
 * instead of the notDeleted() helper.
 */

import { db, notDeleted } from '@baleyui/db';

/**
 * Get the authenticated user's workspace.
 * Returns the first workspace owned by the user that hasn't been soft-deleted.
 */
export async function getAuthenticatedWorkspace(userId: string) {
  return db.query.workspaces.findFirst({
    where: (ws, { eq, and }) =>
      and(eq(ws.ownerId, userId), notDeleted(ws)),
  });
}
