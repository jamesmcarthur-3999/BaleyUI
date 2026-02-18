/**
 * Canvas Session Persistence
 *
 * CRUD operations for canvas sessions in the database.
 */

import { db, canvasSessions } from '@baleyui/db';
import { eq, and } from 'drizzle-orm';
import { CanvasSessionState, type CanvasFileEntry } from './session-state';
import { getScaffoldTemplate } from './scaffold-templates';

// ============================================================================
// QUERIES
// ============================================================================

/**
 * Get or create a canvas session. If the session exists, hydrates state from DB.
 * If not, creates a new one with scaffold template files pre-populated.
 */
export async function getOrCreateCanvasSession(opts: {
  workspaceId: string;
  sessionId: string;
  scaffoldTemplate?: string;
  designPackageId?: string;
  userId?: string;
}): Promise<CanvasSessionState> {
  // Check for existing session
  const existing = await db.query.canvasSessions.findFirst({
    where: and(
      eq(canvasSessions.sessionId, opts.sessionId),
      eq(canvasSessions.workspaceId, opts.workspaceId),
    ),
  });

  if (existing) {
    return CanvasSessionState.fromJSON(
      opts.sessionId,
      opts.workspaceId,
      {
        files: (existing.files ?? {}) as Record<string, CanvasFileEntry>,
        fileOpsLog: (existing.fileOpsLog ?? []) as CanvasSessionState extends { fileOpsLog: infer T } ? T : never,
        commandsLog: (existing.commandsLog ?? []) as CanvasSessionState extends { commandsLog: infer T } ? T : never,
      },
    );
  }

  // Create new session with scaffold template
  const template = opts.scaffoldTemplate ?? 'nextjs-shadcn';
  const scaffoldFiles = getScaffoldTemplate(template);

  const state = new CanvasSessionState(opts.sessionId, opts.workspaceId);
  for (const [path, content] of Object.entries(scaffoldFiles)) {
    state.writeFile(path, content);
  }

  await db.insert(canvasSessions).values({
    workspaceId: opts.workspaceId,
    sessionId: opts.sessionId,
    scaffoldTemplate: template,
    designPackageId: opts.designPackageId,
    files: state.toJSON().files,
    fileOpsLog: state.toJSON().fileOpsLog,
    commandsLog: [],
    conversationHistory: [],
    createdBy: opts.userId,
  });

  return state;
}

/**
 * Persist the current canvas session state to the database.
 */
export async function updateCanvasSession(
  sessionId: string,
  workspaceId: string,
  state: CanvasSessionState,
  conversationHistory?: unknown[],
): Promise<void> {
  const data = state.toJSON();

  await db
    .update(canvasSessions)
    .set({
      files: data.files,
      fileOpsLog: data.fileOpsLog,
      commandsLog: data.commandsLog,
      ...(conversationHistory !== undefined && { conversationHistory }),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(canvasSessions.sessionId, sessionId),
        eq(canvasSessions.workspaceId, workspaceId),
      ),
    );
}
