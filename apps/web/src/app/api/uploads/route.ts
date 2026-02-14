/**
 * General File Upload API Route
 *
 * Accepts multipart/form-data with files and persists them to Vercel Blob
 * storage. Unlike the design-calibration upload endpoint, this does NOT
 * insert into the database — it's a lightweight blob-only upload for use
 * by chat interfaces (companion, creator).
 */

import { auth } from '@/lib/auth/server';
import { headers } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { put } from '@vercel/blob';
import { checkRateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { createLogger } from '@/lib/logger';
import { apiErrors } from '@/lib/api/error-response';
import { getAuthenticatedWorkspace } from '@/lib/auth/workspace-lookup';

const log = createLogger('uploads');

const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/svg+xml',
  'application/pdf',
]);

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB per file
const MAX_FILES_PER_REQUEST = 5;

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    const userId = session?.user?.id ?? null;
    if (!userId) {
      return apiErrors.unauthorized();
    }

    const workspace = await getAuthenticatedWorkspace(userId);
    if (!workspace) {
      return apiErrors.notFound('Workspace');
    }

    await checkRateLimit(
      `uploads:${workspace.id}:${userId}`,
      RATE_LIMITS.api
    );

    const formData = await req.formData();

    const files: File[] = [];
    for (const [key, value] of formData.entries()) {
      if (key === 'files' && value instanceof File) {
        files.push(value);
      }
    }

    if (files.length === 0) {
      return apiErrors.badRequest('No files provided');
    }

    if (files.length > MAX_FILES_PER_REQUEST) {
      return apiErrors.badRequest(`Maximum ${MAX_FILES_PER_REQUEST} files per request`);
    }

    // Validate all files before uploading any
    for (const file of files) {
      if (!ALLOWED_MIME_TYPES.has(file.type)) {
        return apiErrors.badRequest(
          `File "${file.name}" has unsupported type "${file.type}". Allowed: ${[...ALLOWED_MIME_TYPES].join(', ')}`
        );
      }
      if (file.size > MAX_FILE_SIZE) {
        return apiErrors.badRequest(
          `File "${file.name}" exceeds ${MAX_FILE_SIZE / 1024 / 1024}MB limit`
        );
      }
    }

    const uploads: Array<{
      fileName: string;
      mimeType: string;
      fileSize: number;
      url: string;
      downloadUrl: string;
    }> = [];

    for (const file of files) {
      const blobPath = `chat-uploads/${workspace.id}/${Date.now()}-${file.name}`;
      const blob = await put(blobPath, file, {
        access: 'public',
        contentType: file.type,
      });

      uploads.push({
        fileName: file.name,
        mimeType: file.type,
        fileSize: file.size,
        url: blob.url,
        downloadUrl: blob.downloadUrl,
      });
    }

    log.info('Files uploaded', {
      workspaceId: workspace.id,
      count: uploads.length,
    });

    return NextResponse.json({ uploads });
  } catch (error) {
    log.error('File upload failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    return apiErrors.internal(error);
  }
}
