/**
 * Canvas Export API Route
 *
 * Exports a canvas session's files as a ZIP archive.
 * GET /api/canvas/export?sessionId=<id>
 */

import { auth } from '@/lib/auth/server';
import { headers } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { db, canvasSessions } from '@baleyui/db';
import { eq, and } from 'drizzle-orm';
import { getAuthenticatedWorkspace } from '@/lib/auth/workspace-lookup';
import { apiErrors } from '@/lib/api/error-response';
import archiver from 'archiver';
import { PassThrough } from 'stream';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  // 1. Auth
  const session = await auth.api.getSession({ headers: await headers() });
  const userId = session?.user?.id ?? null;
  if (!userId) {
    return apiErrors.unauthorized();
  }

  const workspace = await getAuthenticatedWorkspace(userId);
  if (!workspace) {
    return apiErrors.notFound('Workspace');
  }

  // 2. Get session ID from query
  const sessionId = req.nextUrl.searchParams.get('sessionId');
  if (!sessionId) {
    return apiErrors.badRequest('sessionId query parameter is required');
  }

  // 3. Fetch canvas session
  const canvasSession = await db.query.canvasSessions.findFirst({
    where: and(
      eq(canvasSessions.sessionId, sessionId),
      eq(canvasSessions.workspaceId, workspace.id),
    ),
  });

  if (!canvasSession) {
    return apiErrors.notFound('Canvas session');
  }

  const files = (canvasSession.files ?? {}) as Record<
    string,
    { content: string }
  >;

  // 4. Build ZIP
  const passThrough = new PassThrough();
  const archive = archiver('zip', { zlib: { level: 9 } });
  archive.pipe(passThrough);

  for (const [path, entry] of Object.entries(files)) {
    const content = typeof entry === 'string' ? entry : entry.content;
    if (content) {
      archive.append(content, { name: path });
    }
  }

  await archive.finalize();

  // 5. Collect into buffer
  const chunks: Buffer[] = [];
  for await (const chunk of passThrough) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const zipBuffer = Buffer.concat(chunks);

  const projectName = canvasSession.name ?? 'canvas-project';
  const safeName = projectName.replace(/[^a-zA-Z0-9-_]/g, '-').toLowerCase();

  return new NextResponse(zipBuffer, {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${safeName}.zip"`,
      'Content-Length': String(zipBuffer.length),
    },
  });
}
