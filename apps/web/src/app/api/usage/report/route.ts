/**
 * Usage Report API — authenticated endpoint for the local runtime's UsageReporter.
 *
 * POST /api/usage/report
 * Auth: Bearer API key (from apiKeys table)
 * Body: { reports: [{ baleybotId, tokenInput, tokenOutput, model, durationMs }] }
 */

import { NextResponse } from 'next/server';
import { db, eq, and } from '@baleyui/db';
import { apiKeys, baleybotUsage } from '@baleyui/db';
import { createHash } from 'node:crypto';

interface UsageReportItem {
  baleybotId: string;
  executionId?: string;
  tokenInput: number;
  tokenOutput: number;
  model: string;
  durationMs: number;
}

export async function POST(req: Request) {
  // Authenticate via API key
  const authHeader = req.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Missing authorization' }, { status: 401 });
  }

  const apiKey = authHeader.slice(7);
  const keyHash = createHash('sha256').update(apiKey).digest('hex');

  // Look up the API key
  const key = await db.query.apiKeys.findFirst({
    where: and(eq(apiKeys.keyHash, keyHash), eq(apiKeys.revokedAt, null as unknown as Date)),
  });

  if (!key) {
    return NextResponse.json({ error: 'Invalid API key' }, { status: 401 });
  }

  // Update last used
  await db
    .update(apiKeys)
    .set({ lastUsedAt: new Date() })
    .where(eq(apiKeys.id, key.id));

  // Parse body
  let body: { reports: UsageReportItem[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!Array.isArray(body.reports) || body.reports.length === 0) {
    return NextResponse.json({ error: 'reports array required' }, { status: 400 });
  }

  // Cap batch size to prevent abuse
  const reports = body.reports.slice(0, 100);

  // Insert usage records
  const values = reports.map((r) => ({
    workspaceId: key.workspaceId,
    baleybotId: r.baleybotId,
    tokenInput: r.tokenInput || 0,
    tokenOutput: r.tokenOutput || 0,
    tokenTotal: (r.tokenInput || 0) + (r.tokenOutput || 0),
    apiCalls: 1,
    toolCalls: 0,
    durationMs: r.durationMs || 0,
    model: r.model || 'unknown',
    timestamp: new Date(),
  }));

  try {
    // Insert without executionId reference since these come from external runtime
    for (const v of values) {
      await db.insert(baleybotUsage).values({
        workspaceId: v.workspaceId,
        baleybotId: v.baleybotId as unknown as string,
        tokenInput: v.tokenInput,
        tokenOutput: v.tokenOutput,
        tokenTotal: v.tokenTotal,
        apiCalls: v.apiCalls,
        toolCalls: v.toolCalls,
        durationMs: v.durationMs,
        model: v.model,
        timestamp: v.timestamp,
      });
    }

    return NextResponse.json({ received: reports.length });
  } catch (err) {
    console.error('[usage-report]', err instanceof Error ? err.message : String(err));
    return NextResponse.json({ error: 'Failed to record usage' }, { status: 500 });
  }
}
