/**
 * File Upload Trigger API Route
 *
 * POST /api/triggers/file-upload/[workspaceId]/[baleybotId]
 *
 * Executes a BaleyBot when files are uploaded and the target bot is configured
 * with a file_upload trigger.
 */

import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import {
  and,
  baleybotExecutions,
  baleybotTriggers,
  baleybots,
  db,
  eq,
  notDeleted,
} from '@baleyui/db';
import { createLogger } from '@/lib/logger';
import { executeBaleybot } from '@/lib/baleybot/executor';
import type { BuiltInToolContext } from '@/lib/baleybot/tools/built-in';
import { loadExecutionTools } from '@/lib/baleybot/services/execution-tools-loader';
import { checkApiRateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { createErrorResponse } from '@/lib/api/error-response';

const log = createLogger('file-upload-trigger');

interface FileUploadTriggerConfig {
  type: 'file_upload';
  acceptedMimeTypes?: string[];
  maxFileSizeMb?: number;
  multiple?: boolean;
  payloadMode?: 'metadata' | 'inline_base64';
  enabled?: boolean;
}

function getClientIp(request: NextRequest): string | undefined {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    undefined
  );
}

function normalizeTriggerConfig(input: unknown): FileUploadTriggerConfig | null {
  if (!input || typeof input !== 'object') return null;
  const config = input as Record<string, unknown>;
  if (config.type !== 'file_upload') return null;
  return {
    type: 'file_upload',
    acceptedMimeTypes: Array.isArray(config.acceptedMimeTypes)
      ? config.acceptedMimeTypes.filter((value): value is string => typeof value === 'string')
      : undefined,
    maxFileSizeMb:
      typeof config.maxFileSizeMb === 'number' && Number.isFinite(config.maxFileSizeMb)
        ? config.maxFileSizeMb
        : undefined,
    multiple: typeof config.multiple === 'boolean' ? config.multiple : undefined,
    payloadMode:
      config.payloadMode === 'inline_base64' || config.payloadMode === 'metadata'
        ? config.payloadMode
        : undefined,
    enabled: typeof config.enabled === 'boolean' ? config.enabled : undefined,
  };
}

function getFormFields(formData: FormData): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (typeof value === 'string') {
      fields[key] = value;
    }
  }
  return fields;
}

async function toInlinePayload(files: File[]) {
  const payload: Array<{
    name: string;
    type: string;
    size: number;
    lastModified: number;
    base64: string;
  }> = [];

  for (const file of files) {
    const bytes = await file.arrayBuffer();
    payload.push({
      name: file.name,
      type: file.type || 'application/octet-stream',
      size: file.size,
      lastModified: file.lastModified,
      base64: Buffer.from(bytes).toString('base64'),
    });
  }

  return payload;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ workspaceId: string; baleybotId: string }> }
) {
  const { workspaceId, baleybotId } = await params;
  const requestId = crypto.randomUUID();
  const ipAddress = getClientIp(request);

  const rateLimitKey = `file-upload:${workspaceId}:${ipAddress ?? 'unknown'}`;
  const rateLimitResult = await checkApiRateLimit(rateLimitKey, RATE_LIMITS.webhookPerMinute);
  if (rateLimitResult.limited) {
    return NextResponse.json(
      {
        success: false,
        error: `Rate limit exceeded. Retry after ${rateLimitResult.retryAfter} seconds.`,
      },
      {
        status: 429,
        headers: {
          'Retry-After': String(rateLimitResult.retryAfter),
          'X-RateLimit-Limit': String(RATE_LIMITS.webhookPerMinute.maxRequests),
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': String(Math.ceil(rateLimitResult.resetAt / 1000)),
        },
      }
    );
  }

  try {
    const baleybot = await db.query.baleybots.findFirst({
      where: and(
        eq(baleybots.id, baleybotId),
        eq(baleybots.workspaceId, workspaceId),
        notDeleted(baleybots)
      ),
      columns: {
        id: true,
        workspaceId: true,
        balCode: true,
        status: true,
        name: true,
      },
    });

    if (!baleybot) {
      return NextResponse.json({ success: false, error: 'BaleyBot not found' }, { status: 404 });
    }
    if (baleybot.status !== 'active' && baleybot.status !== 'draft') {
      return NextResponse.json(
        { success: false, error: `BaleyBot is not executable in status "${baleybot.status}"` },
        { status: 400 }
      );
    }

    const triggerRow = await db.query.baleybotTriggers.findFirst({
      where: and(
        eq(baleybotTriggers.workspaceId, workspaceId),
        eq(baleybotTriggers.targetBaleybotId, baleybotId),
        eq(baleybotTriggers.enabled, true)
      ),
    });

    const triggerConfig = normalizeTriggerConfig(triggerRow?.staticInput);
    if (!triggerConfig) {
      return NextResponse.json(
        { success: false, error: 'File upload trigger is not configured for this BaleyBot' },
        { status: 400 }
      );
    }

    const formData = await request.formData();
    const uploadedFiles = Array.from(formData.values()).filter(
      (value): value is File => typeof value !== 'string' && value instanceof File
    );

    if (uploadedFiles.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No files were uploaded' },
        { status: 400 }
      );
    }
    if (!triggerConfig.multiple && uploadedFiles.length > 1) {
      return NextResponse.json(
        { success: false, error: 'Trigger only allows a single file upload' },
        { status: 400 }
      );
    }

    const acceptedTypes = triggerConfig.acceptedMimeTypes ?? [];
    const maxBytes = Math.max(1, (triggerConfig.maxFileSizeMb ?? 10)) * 1024 * 1024;
    for (const file of uploadedFiles) {
      if (acceptedTypes.length > 0 && !acceptedTypes.includes(file.type)) {
        return NextResponse.json(
          {
            success: false,
            error: `File type "${file.type || 'unknown'}" is not allowed`,
          },
          { status: 400 }
        );
      }
      if (file.size > maxBytes) {
        return NextResponse.json(
          {
            success: false,
            error: `File "${file.name}" exceeds max size of ${triggerConfig.maxFileSizeMb ?? 10}MB`,
          },
          { status: 400 }
        );
      }
    }

    const [execution] = await db
      .insert(baleybotExecutions)
      .values({
        baleybotId,
        status: 'running',
        triggeredBy: 'webhook',
        triggerSource: ipAddress ?? 'file-upload',
        startedAt: new Date(),
      })
      .returning({ id: baleybotExecutions.id });

    if (!execution) {
      throw new Error('Failed to create execution record');
    }

    const payloadMode = triggerConfig.payloadMode ?? 'metadata';
    const filesPayload =
      payloadMode === 'inline_base64'
        ? await toInlinePayload(uploadedFiles)
        : uploadedFiles.map((file) => ({
            name: file.name,
            type: file.type || 'application/octet-stream',
            size: file.size,
            lastModified: file.lastModified,
          }));

    const executionInput = {
      source: 'file_upload',
      payloadMode,
      files: filesPayload,
      fields: getFormFields(formData),
    };

    const startedAt = Date.now();
    const toolCtx: BuiltInToolContext = {
      workspaceId,
      baleybotId,
      executionId: execution.id,
      userId: 'file_upload_trigger',
    };

    const { runtimeTools } = await loadExecutionTools({
      workspaceId,
      toolCtx,
    });

    const result = await executeBaleybot(
      baleybot.balCode,
      JSON.stringify(executionInput),
      {
        workspaceId,
        baleybotId,
        availableTools: runtimeTools,
        workspacePolicies: null,
        triggeredBy: 'webhook',
        triggerSource: ipAddress ?? 'file_upload',
      }
    );

    const finalStatus = result.status === 'completed' ? 'completed' : 'failed';
    const durationMs = Date.now() - startedAt;

    await db
      .update(baleybotExecutions)
      .set({
        status: finalStatus,
        output: (result.output ?? null) as Record<string, unknown> | null,
        error: result.error,
        completedAt: new Date(),
        durationMs,
      })
      .where(eq(baleybotExecutions.id, execution.id));

    log.info('File upload trigger executed', {
      requestId,
      baleybotId,
      executionId: execution.id,
      files: uploadedFiles.length,
      status: finalStatus,
    });

    return NextResponse.json({
      success: finalStatus === 'completed',
      status: finalStatus,
      executionId: execution.id,
    });
  } catch (error) {
    log.error('File upload trigger failed', {
      requestId,
      baleybotId,
      workspaceId,
      error: error instanceof Error ? error.message : String(error),
    });
    return createErrorResponse(500, error, {
      requestId,
      message: 'File upload trigger execution failed',
    });
  }
}

export const runtime = 'nodejs';
export const maxDuration = 60;
