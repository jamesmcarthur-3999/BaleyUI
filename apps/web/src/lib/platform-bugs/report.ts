/**
 * Platform Bug Reporting Service
 *
 * Captures, deduplicates, and triages platform-level errors.
 * Uses the platform_bug_triage internal BaleyBot for AI analysis.
 */

import { createHash } from 'crypto';
import { db, platformBugs, eq, and, gt, sql, notDeleted } from '@baleyui/db';
import { createLogger } from '@/lib/logger';

const log = createLogger('platform-bugs');

// ============================================================================
// TYPES
// ============================================================================

export interface PlatformErrorReport {
  errorMessage: string;
  stackTrace?: string;
  source: 'client' | 'server' | 'streaming';
  category: string;
  route?: string;
  workspaceId?: string;
  environment: string;
  metadata?: Record<string, unknown>;
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Compute a stable hash of an error message for deduplication.
 * Normalizes the message by removing dynamic parts like timestamps, IDs, etc.
 */
function computeErrorHash(errorMessage: string): string {
  const normalized = errorMessage
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '<UUID>')
    .replace(/\b\d{10,13}\b/g, '<TIMESTAMP>')
    .replace(/at .*:\d+:\d+/g, '<STACK_LINE>')
    .replace(/\/[a-zA-Z0-9._/-]+\.(?:ts|tsx|js|jsx)/g, '<FILE>')
    .trim()
    .toLowerCase();

  return createHash('sha256').update(normalized).digest('hex').slice(0, 64);
}

/** Errors to silently ignore — dev noise, expected failures */
const IGNORED_PATTERNS = [
  /hot-update/i,
  /hmr/i,
  /webpack.*chunk/i,
  /NEXT_NOT_FOUND/i,
  /aborted/i,
  /cancelled/i,
  /ResizeObserver/i,
];

function shouldIgnore(errorMessage: string): boolean {
  return IGNORED_PATTERNS.some((p) => p.test(errorMessage));
}

// ============================================================================
// MAIN API
// ============================================================================

/**
 * Report a platform error for triage and tracking.
 *
 * This function NEVER throws — bug tracking must not cause bugs.
 */
export async function reportPlatformError(params: PlatformErrorReport): Promise<void> {
  try {
    // Filter out known noise
    if (shouldIgnore(params.errorMessage)) {
      return;
    }

    const errorHash = computeErrorHash(params.errorMessage);
    const now = new Date();
    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    // Dedup check: if same hash seen in last 24h, just bump occurrence count
    const existing = await db.query.platformBugs.findFirst({
      where: and(
        eq(platformBugs.errorHash, errorHash),
        gt(platformBugs.lastSeenAt, twentyFourHoursAgo),
        notDeleted(platformBugs)
      ),
    });

    if (existing) {
      // Increment occurrence count and update last seen
      const newWorkspaces = existing.affectedWorkspaces ?? [];
      if (params.workspaceId && !newWorkspaces.includes(params.workspaceId)) {
        newWorkspaces.push(params.workspaceId);
      }
      const newRoutes = existing.affectedRoutes ?? [];
      if (params.route && !newRoutes.includes(params.route)) {
        newRoutes.push(params.route);
      }

      await db
        .update(platformBugs)
        .set({
          occurrenceCount: sql`${platformBugs.occurrenceCount} + 1`,
          lastSeenAt: now,
          affectedWorkspaces: newWorkspaces,
          affectedRoutes: newRoutes,
          updatedAt: now,
        })
        .where(eq(platformBugs.id, existing.id));

      log.debug('Platform bug occurrence incremented', {
        bugId: existing.id,
        hash: errorHash,
        count: (existing.occurrenceCount ?? 1) + 1,
      });
      return;
    }

    // New error — insert a basic record first, then triage async
    const [inserted] = await db
      .insert(platformBugs)
      .values({
        errorHash,
        errorMessage: params.errorMessage.slice(0, 10000), // cap at 10k chars
        stackTrace: params.stackTrace?.slice(0, 50000),
        source: params.source,
        category: params.category,
        environment: params.environment,
        affectedWorkspaces: params.workspaceId ? [params.workspaceId] : [],
        affectedRoutes: params.route ? [params.route] : [],
        metadata: params.metadata ?? {},
        firstSeenAt: now,
        lastSeenAt: now,
      })
      .returning({ id: platformBugs.id });

    if (!inserted) {
      log.warn('Failed to insert platform bug record');
      return;
    }

    log.info('New platform bug recorded', {
      bugId: inserted.id,
      hash: errorHash,
      source: params.source,
      category: params.category,
    });

    // Run AI triage async (fire-and-forget)
    triagePlatformBug(inserted.id, params, errorHash).catch((err) => {
      log.warn('Platform bug triage failed', {
        bugId: inserted.id,
        error: err instanceof Error ? err.message : String(err),
      });
    });
  } catch (err) {
    // Bug tracking must NEVER cause bugs
    log.error('reportPlatformError failed silently', {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

// ============================================================================
// AI TRIAGE
// ============================================================================

async function triagePlatformBug(
  bugId: string,
  params: PlatformErrorReport,
  errorHash: string
): Promise<void> {
  try {
    // Dynamically import to avoid circular deps and to keep the cold path light
    const { executeInternalBaleybot } = await import('@/lib/baleybot/internal-baleybots');
    const { normalizeOutputCandidate } = await import('@/lib/baleybot/internal-bb/contract-gateway');

    // Gather recent similar bugs for context
    const recentBugs = await db.query.platformBugs.findMany({
      where: notDeleted(platformBugs),
      orderBy: (bugs, { desc }) => [desc(bugs.lastSeenAt)],
      limit: 10,
      columns: {
        errorHash: true,
        title: true,
        category: true,
        severity: true,
        status: true,
      },
    });

    const triageInput = JSON.stringify({
      errorMessage: params.errorMessage,
      stackTrace: params.stackTrace ?? null,
      source: params.source,
      category: params.category,
      route: params.route ?? null,
      environment: params.environment,
      recentKnownBugs: recentBugs.map((b) => ({
        hash: b.errorHash,
        title: b.title,
        category: b.category,
        severity: b.severity,
        status: b.status,
      })),
    });

    const { output } = await executeInternalBaleybot(
      'platform_bug_triage',
      triageInput,
      { triggeredBy: 'internal' }
    );

    const resolved = normalizeOutputCandidate(output);
    const result = resolved as Record<string, unknown>;

    if (!result || typeof result !== 'object') {
      log.warn('Triage returned non-object', { bugId });
      return;
    }

    const isPlatformBug = result.isPlatformBug === true;

    if (!isPlatformBug) {
      // Not a platform bug — soft delete the record
      await db
        .update(platformBugs)
        .set({
          deletedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(platformBugs.id, bugId));

      log.info('Triage classified as non-platform bug, removed', { bugId });
      return;
    }

    // Update with triage results
    await db
      .update(platformBugs)
      .set({
        title: typeof result.title === 'string' ? result.title : null,
        severity: typeof result.severity === 'string' ? result.severity : 'medium',
        rootCause: typeof result.rootCause === 'string' ? result.rootCause : null,
        suggestedFix: typeof result.suggestedFix === 'string' ? result.suggestedFix : null,
        triageConfidence: typeof result.confidence === 'number' ? result.confidence : null,
        updatedAt: new Date(),
      })
      .where(eq(platformBugs.id, bugId));

    log.info('Platform bug triaged', {
      bugId,
      severity: result.severity,
      confidence: result.confidence,
      isDuplicate: result.isDuplicate,
    });

    // If duplicate detected, merge occurrence
    if (result.isDuplicate === true && typeof result.existingBugHash === 'string' && result.existingBugHash !== errorHash) {
      const existingBug = await db.query.platformBugs.findFirst({
        where: and(
          eq(platformBugs.errorHash, result.existingBugHash),
          notDeleted(platformBugs)
        ),
      });

      if (existingBug) {
        await db
          .update(platformBugs)
          .set({
            occurrenceCount: sql`${platformBugs.occurrenceCount} + 1`,
            lastSeenAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(platformBugs.id, existingBug.id));

        // Remove the duplicate
        await db
          .update(platformBugs)
          .set({ deletedAt: new Date() })
          .where(eq(platformBugs.id, bugId));
      }
    }
  } catch (err) {
    log.warn('triagePlatformBug failed', {
      bugId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
