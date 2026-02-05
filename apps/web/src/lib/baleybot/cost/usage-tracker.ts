/**
 * Usage Tracking Service
 *
 * Tracks token usage, API calls, tool calls, duration, and estimated costs
 * for BaleyBot executions. Enables cost analysis and optimization suggestions.
 */

import { db, baleybotUsage, baleybotExecutions, eq, and, gte, lte, desc, sql } from '@baleyui/db';
import { createLogger } from '@/lib/logger';

const log = createLogger('usage-tracker');

// ============================================================================
// TYPES
// ============================================================================

export interface UsageRecord {
  workspaceId: string;
  baleybotId: string;
  executionId?: string;
  tokenInput: number;
  tokenOutput: number;
  apiCalls: number;
  toolCalls: number;
  durationMs: number;
  model?: string;
}

export interface UsageSummary {
  totalExecutions: number;
  totalTokenInput: number;
  totalTokenOutput: number;
  totalTokens: number;
  totalApiCalls: number;
  totalToolCalls: number;
  totalDurationMs: number;
  estimatedCost: number;
  avgTokensPerExecution: number;
  avgDurationMs: number;
  avgCostPerExecution: number;
}

export interface UsageTrend {
  date: string;
  executions: number;
  tokens: number;
  cost: number;
}

// ============================================================================
// MODEL PRICING
// ============================================================================

/**
 * Model pricing in dollars per 1M tokens
 * Prices as of early 2026 - should be updated regularly
 */
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  // OpenAI
  'openai:gpt-4o': { input: 2.5, output: 10 },
  'openai:gpt-4o-mini': { input: 0.15, output: 0.6 },
  'openai:gpt-4-turbo': { input: 10, output: 30 },
  'openai:gpt-3.5-turbo': { input: 0.5, output: 1.5 },

  // Anthropic
  'anthropic:claude-sonnet-4-20250514': { input: 3, output: 15 },
  'anthropic:claude-3-5-haiku-20241022': { input: 0.25, output: 1.25 },
  'anthropic:claude-3-opus-20240229': { input: 15, output: 75 },

  // Default fallback
  default: { input: 1, output: 3 },
};

/**
 * Calculate estimated cost for token usage
 */
export function calculateCost(
  tokenInput: number,
  tokenOutput: number,
  model?: string
): number {
  const pricing = MODEL_PRICING[model ?? ''] ?? MODEL_PRICING.default!;

  const inputCost = (tokenInput / 1_000_000) * pricing.input;
  const outputCost = (tokenOutput / 1_000_000) * pricing.output;

  return inputCost + outputCost;
}

// ============================================================================
// USAGE RECORDING
// ============================================================================

/**
 * Record usage for an execution
 */
export async function recordUsage(usage: UsageRecord): Promise<string> {
  const estimatedCost = calculateCost(usage.tokenInput, usage.tokenOutput, usage.model);

  const [record] = await db
    .insert(baleybotUsage)
    .values({
      workspaceId: usage.workspaceId,
      baleybotId: usage.baleybotId,
      executionId: usage.executionId,
      tokenInput: usage.tokenInput,
      tokenOutput: usage.tokenOutput,
      tokenTotal: usage.tokenInput + usage.tokenOutput,
      apiCalls: usage.apiCalls,
      toolCalls: usage.toolCalls,
      durationMs: usage.durationMs,
      estimatedCost,
      model: usage.model,
    })
    .returning({ id: baleybotUsage.id });

  log.debug(`Recorded usage for BB ${usage.baleybotId}`, {
    baleybotId: usage.baleybotId,
    tokens: usage.tokenInput + usage.tokenOutput,
    estimatedCost: `$${estimatedCost.toFixed(6)}`,
  });

  return record!.id;
}

/**
 * Record usage from execution segments (called after execution completes)
 */
export async function recordUsageFromExecution(
  workspaceId: string,
  baleybotId: string,
  executionId: string,
  segments: unknown[],
  durationMs: number
): Promise<string | null> {
  let tokenInput = 0;
  let tokenOutput = 0;
  let apiCalls = 0;
  let toolCalls = 0;
  let model: string | undefined;

  // Extract usage from segments
  for (const segment of segments) {
    const seg = segment as Record<string, unknown>;

    if (seg.type === 'done' && typeof seg.usage === 'object' && seg.usage !== null) {
      const usage = seg.usage as Record<string, number>;
      tokenInput += usage.inputTokens ?? 0;
      tokenOutput += usage.outputTokens ?? 0;
      apiCalls += 1;
    }

    if (seg.type === 'tool_use_start') {
      toolCalls += 1;
    }

    // Try to extract model from response metadata
    if (seg.type === 'start' && typeof seg.model === 'string') {
      model = seg.model;
    }
  }

  // If no tokens recorded, check execution record
  if (tokenInput === 0 && tokenOutput === 0) {
    const execution = await db.query.baleybotExecutions.findFirst({
      where: eq(baleybotExecutions.id, executionId),
    });

    if (execution?.tokenCount) {
      // Assume 70/30 split if we only have total
      tokenInput = Math.round(execution.tokenCount * 0.3);
      tokenOutput = Math.round(execution.tokenCount * 0.7);
    }
  }

  // Don't record if no usage data
  if (tokenInput === 0 && tokenOutput === 0 && apiCalls === 0 && toolCalls === 0) {
    log.debug(`No usage data found for execution ${executionId}`);
    return null;
  }

  return recordUsage({
    workspaceId,
    baleybotId,
    executionId,
    tokenInput,
    tokenOutput,
    apiCalls,
    toolCalls,
    durationMs,
    model,
  });
}

// ============================================================================
// USAGE QUERIES
// ============================================================================

/**
 * Get usage summary for a BaleyBot
 */
export async function getUsageSummary(
  baleybotId: string,
  options?: {
    startDate?: Date;
    endDate?: Date;
  }
): Promise<UsageSummary> {
  const conditions = [eq(baleybotUsage.baleybotId, baleybotId)];

  if (options?.startDate) {
    conditions.push(gte(baleybotUsage.timestamp, options.startDate));
  }
  if (options?.endDate) {
    conditions.push(lte(baleybotUsage.timestamp, options.endDate));
  }

  const result = await db
    .select({
      totalExecutions: sql<number>`count(*)`,
      totalTokenInput: sql<number>`coalesce(sum(${baleybotUsage.tokenInput}), 0)`,
      totalTokenOutput: sql<number>`coalesce(sum(${baleybotUsage.tokenOutput}), 0)`,
      totalTokens: sql<number>`coalesce(sum(${baleybotUsage.tokenTotal}), 0)`,
      totalApiCalls: sql<number>`coalesce(sum(${baleybotUsage.apiCalls}), 0)`,
      totalToolCalls: sql<number>`coalesce(sum(${baleybotUsage.toolCalls}), 0)`,
      totalDurationMs: sql<number>`coalesce(sum(${baleybotUsage.durationMs}), 0)`,
      estimatedCost: sql<number>`coalesce(sum(${baleybotUsage.estimatedCost}), 0)`,
    })
    .from(baleybotUsage)
    .where(and(...conditions));

  const row = result[0]!;
  const totalExecutions = Number(row.totalExecutions) || 0;

  return {
    totalExecutions,
    totalTokenInput: Number(row.totalTokenInput) || 0,
    totalTokenOutput: Number(row.totalTokenOutput) || 0,
    totalTokens: Number(row.totalTokens) || 0,
    totalApiCalls: Number(row.totalApiCalls) || 0,
    totalToolCalls: Number(row.totalToolCalls) || 0,
    totalDurationMs: Number(row.totalDurationMs) || 0,
    estimatedCost: Number(row.estimatedCost) || 0,
    avgTokensPerExecution: totalExecutions > 0 ? Number(row.totalTokens) / totalExecutions : 0,
    avgDurationMs: totalExecutions > 0 ? Number(row.totalDurationMs) / totalExecutions : 0,
    avgCostPerExecution: totalExecutions > 0 ? Number(row.estimatedCost) / totalExecutions : 0,
  };
}

/**
 * Get usage summary for a workspace
 */
export async function getWorkspaceUsageSummary(
  workspaceId: string,
  options?: {
    startDate?: Date;
    endDate?: Date;
  }
): Promise<UsageSummary> {
  const conditions = [eq(baleybotUsage.workspaceId, workspaceId)];

  if (options?.startDate) {
    conditions.push(gte(baleybotUsage.timestamp, options.startDate));
  }
  if (options?.endDate) {
    conditions.push(lte(baleybotUsage.timestamp, options.endDate));
  }

  const result = await db
    .select({
      totalExecutions: sql<number>`count(*)`,
      totalTokenInput: sql<number>`coalesce(sum(${baleybotUsage.tokenInput}), 0)`,
      totalTokenOutput: sql<number>`coalesce(sum(${baleybotUsage.tokenOutput}), 0)`,
      totalTokens: sql<number>`coalesce(sum(${baleybotUsage.tokenTotal}), 0)`,
      totalApiCalls: sql<number>`coalesce(sum(${baleybotUsage.apiCalls}), 0)`,
      totalToolCalls: sql<number>`coalesce(sum(${baleybotUsage.toolCalls}), 0)`,
      totalDurationMs: sql<number>`coalesce(sum(${baleybotUsage.durationMs}), 0)`,
      estimatedCost: sql<number>`coalesce(sum(${baleybotUsage.estimatedCost}), 0)`,
    })
    .from(baleybotUsage)
    .where(and(...conditions));

  const row = result[0]!;
  const totalExecutions = Number(row.totalExecutions) || 0;

  return {
    totalExecutions,
    totalTokenInput: Number(row.totalTokenInput) || 0,
    totalTokenOutput: Number(row.totalTokenOutput) || 0,
    totalTokens: Number(row.totalTokens) || 0,
    totalApiCalls: Number(row.totalApiCalls) || 0,
    totalToolCalls: Number(row.totalToolCalls) || 0,
    totalDurationMs: Number(row.totalDurationMs) || 0,
    estimatedCost: Number(row.estimatedCost) || 0,
    avgTokensPerExecution: totalExecutions > 0 ? Number(row.totalTokens) / totalExecutions : 0,
    avgDurationMs: totalExecutions > 0 ? Number(row.totalDurationMs) / totalExecutions : 0,
    avgCostPerExecution: totalExecutions > 0 ? Number(row.estimatedCost) / totalExecutions : 0,
  };
}

/**
 * Get daily usage trend for a BaleyBot
 */
export async function getUsageTrend(
  baleybotId: string,
  days: number = 30
): Promise<UsageTrend[]> {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  const result = await db
    .select({
      date: sql<string>`date_trunc('day', ${baleybotUsage.timestamp})::date::text`,
      executions: sql<number>`count(*)`,
      tokens: sql<number>`coalesce(sum(${baleybotUsage.tokenTotal}), 0)`,
      cost: sql<number>`coalesce(sum(${baleybotUsage.estimatedCost}), 0)`,
    })
    .from(baleybotUsage)
    .where(
      and(
        eq(baleybotUsage.baleybotId, baleybotId),
        gte(baleybotUsage.timestamp, startDate)
      )
    )
    .groupBy(sql`date_trunc('day', ${baleybotUsage.timestamp})`)
    .orderBy(sql`date_trunc('day', ${baleybotUsage.timestamp})`);

  return result.map((row) => ({
    date: row.date,
    executions: Number(row.executions) || 0,
    tokens: Number(row.tokens) || 0,
    cost: Number(row.cost) || 0,
  }));
}

/**
 * Get top BBs by usage in a workspace
 */
export async function getTopBBsByUsage(
  workspaceId: string,
  options?: {
    startDate?: Date;
    endDate?: Date;
    limit?: number;
    metric?: 'tokens' | 'cost' | 'executions';
  }
): Promise<
  Array<{
    baleybotId: string;
    totalTokens: number;
    totalCost: number;
    totalExecutions: number;
  }>
> {
  const conditions = [eq(baleybotUsage.workspaceId, workspaceId)];

  if (options?.startDate) {
    conditions.push(gte(baleybotUsage.timestamp, options.startDate));
  }
  if (options?.endDate) {
    conditions.push(lte(baleybotUsage.timestamp, options.endDate));
  }

  const metric = options?.metric ?? 'cost';
  const orderColumn =
    metric === 'tokens'
      ? sql`sum(${baleybotUsage.tokenTotal})`
      : metric === 'executions'
        ? sql`count(*)`
        : sql`sum(${baleybotUsage.estimatedCost})`;

  const result = await db
    .select({
      baleybotId: baleybotUsage.baleybotId,
      totalTokens: sql<number>`coalesce(sum(${baleybotUsage.tokenTotal}), 0)`,
      totalCost: sql<number>`coalesce(sum(${baleybotUsage.estimatedCost}), 0)`,
      totalExecutions: sql<number>`count(*)`,
    })
    .from(baleybotUsage)
    .where(and(...conditions))
    .groupBy(baleybotUsage.baleybotId)
    .orderBy(desc(orderColumn))
    .limit(options?.limit ?? 10);

  return result.map((row) => ({
    baleybotId: row.baleybotId,
    totalTokens: Number(row.totalTokens) || 0,
    totalCost: Number(row.totalCost) || 0,
    totalExecutions: Number(row.totalExecutions) || 0,
  }));
}

/**
 * Get recent executions with usage for a BaleyBot
 */
export async function getRecentUsage(
  baleybotId: string,
  limit: number = 20
): Promise<
  Array<{
    id: string;
    executionId: string | null;
    tokenInput: number;
    tokenOutput: number;
    tokenTotal: number;
    apiCalls: number;
    toolCalls: number;
    durationMs: number | null;
    estimatedCost: number | null;
    model: string | null;
    timestamp: Date;
  }>
> {
  const result = await db
    .select({
      id: baleybotUsage.id,
      executionId: baleybotUsage.executionId,
      tokenInput: baleybotUsage.tokenInput,
      tokenOutput: baleybotUsage.tokenOutput,
      tokenTotal: baleybotUsage.tokenTotal,
      apiCalls: baleybotUsage.apiCalls,
      toolCalls: baleybotUsage.toolCalls,
      durationMs: baleybotUsage.durationMs,
      estimatedCost: baleybotUsage.estimatedCost,
      model: baleybotUsage.model,
      timestamp: baleybotUsage.timestamp,
    })
    .from(baleybotUsage)
    .where(eq(baleybotUsage.baleybotId, baleybotId))
    .orderBy(desc(baleybotUsage.timestamp))
    .limit(limit);

  return result.map((row) => ({
    id: row.id,
    executionId: row.executionId,
    tokenInput: row.tokenInput ?? 0,
    tokenOutput: row.tokenOutput ?? 0,
    tokenTotal: row.tokenTotal ?? 0,
    apiCalls: row.apiCalls ?? 0,
    toolCalls: row.toolCalls ?? 0,
    durationMs: row.durationMs,
    estimatedCost: row.estimatedCost,
    model: row.model,
    timestamp: row.timestamp,
  }));
}
