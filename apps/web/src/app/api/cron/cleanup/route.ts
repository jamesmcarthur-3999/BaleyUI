/**
 * Vercel Cron Endpoint: Cleanup Old Executions & Events
 *
 * Runs daily to delete old execution records, segments, and events
 * that are no longer needed. Prevents unbounded table growth.
 *
 * Security: Requires CRON_SECRET authorization header
 */

import { timingSafeEqual } from 'crypto';
import { NextResponse } from 'next/server';
import { db, sql } from '@baleyui/db';
import { createLogger } from '@/lib/logger';
import { requireEnv } from '@/lib/env';
import { apiErrors, createErrorResponse } from '@/lib/api/error-response';

const log = createLogger('cron-cleanup');

/** Retention period in days for each table */
const RETENTION_DAYS = {
  baleybotExecutions: 30,
  executionEvents: 14,
  builderEvents: 30,
  auditLogs: 90,
  backgroundJobs: 7,
  companionConversations: 30,
} as const;

/** Max rows to delete per table per invocation to avoid long-running queries */
const BATCH_LIMIT = 5000;

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function GET(request: Request): Promise<Response> {
  const authHeader = request.headers.get('authorization');
  const requestId = request.headers.get('x-request-id') ?? undefined;

  let cronSecret: string;
  try {
    cronSecret = requireEnv('CRON_SECRET', 'cron job authorization');
  } catch {
    log.error('CRON_SECRET environment variable not set');
    return createErrorResponse(500, null, { message: 'Cron not configured', requestId });
  }

  const expectedHeader = `Bearer ${cronSecret}`;
  const headersMatch =
    authHeader !== null &&
    authHeader.length === expectedHeader.length &&
    timingSafeEqual(
      Buffer.from(authHeader, 'utf-8'),
      Buffer.from(expectedHeader, 'utf-8')
    );

  if (!headersMatch) {
    log.warn('Unauthorized cleanup cron request');
    return apiErrors.unauthorized();
  }

  const startTime = Date.now();
  log.info('Starting cleanup cron');

  const results: Record<string, number> = {};

  try {
    // 1. Clean up old baleybot execution segments (null out large segments column)
    //    Keep the execution metadata but drop the heavyweight replay data
    const segmentResult = await db.execute(sql`
      UPDATE baleybot_executions
      SET segments = NULL
      WHERE segments IS NOT NULL
        AND created_at < NOW() - INTERVAL '${sql.raw(String(RETENTION_DAYS.baleybotExecutions))} days'
      LIMIT ${sql.raw(String(BATCH_LIMIT))}
    `.append(sql``));
    results.segmentsCleared = Number(segmentResult.count ?? 0);

    // 2. Delete old completed/failed executions beyond retention
    const execResult = await db.execute(sql`
      DELETE FROM baleybot_executions
      WHERE status IN ('completed', 'failed', 'cancelled')
        AND created_at < NOW() - INTERVAL '${sql.raw(String(RETENTION_DAYS.baleybotExecutions * 2))} days'
        AND id IN (
          SELECT id FROM baleybot_executions
          WHERE status IN ('completed', 'failed', 'cancelled')
            AND created_at < NOW() - INTERVAL '${sql.raw(String(RETENTION_DAYS.baleybotExecutions * 2))} days'
          LIMIT ${sql.raw(String(BATCH_LIMIT))}
        )
    `);
    results.executionsDeleted = Number(execResult.count ?? 0);

    // 3. Delete old execution events (block execution events)
    const eventResult = await db.execute(sql`
      DELETE FROM execution_events
      WHERE id IN (
        SELECT ee.id FROM execution_events ee
        JOIN block_executions be ON ee.execution_id = be.id
        WHERE be.created_at < NOW() - INTERVAL '${sql.raw(String(RETENTION_DAYS.executionEvents))} days'
        LIMIT ${sql.raw(String(BATCH_LIMIT))}
      )
    `);
    results.executionEventsDeleted = Number(eventResult.count ?? 0);

    // 4. Delete old completed background jobs
    const jobResult = await db.execute(sql`
      DELETE FROM background_jobs
      WHERE status IN ('completed', 'failed', 'cancelled')
        AND created_at < NOW() - INTERVAL '${sql.raw(String(RETENTION_DAYS.backgroundJobs))} days'
        AND id IN (
          SELECT id FROM background_jobs
          WHERE status IN ('completed', 'failed', 'cancelled')
            AND created_at < NOW() - INTERVAL '${sql.raw(String(RETENTION_DAYS.backgroundJobs))} days'
          LIMIT ${sql.raw(String(BATCH_LIMIT))}
        )
    `);
    results.backgroundJobsDeleted = Number(jobResult.count ?? 0);

    // 5. Delete old companion conversations
    const convResult = await db.execute(sql`
      DELETE FROM companion_conversations
      WHERE created_at < NOW() - INTERVAL '${sql.raw(String(RETENTION_DAYS.companionConversations))} days'
        AND id IN (
          SELECT id FROM companion_conversations
          WHERE created_at < NOW() - INTERVAL '${sql.raw(String(RETENTION_DAYS.companionConversations))} days'
          LIMIT ${sql.raw(String(BATCH_LIMIT))}
        )
    `);
    results.companionConversationsDeleted = Number(convResult.count ?? 0);

    const durationMs = Date.now() - startTime;
    log.info('Cleanup cron completed', { ...results, durationMs });

    return NextResponse.json({
      status: 'ok',
      results,
      durationMs,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    log.error('Cleanup cron failed', { error: message });
    return apiErrors.internal(error, { requestId });
  }
}
