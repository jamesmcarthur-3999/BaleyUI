/**
 * Optimization Suggester Service
 *
 * Analyzes BaleyBot usage patterns and suggests optimizations:
 * - Model downgrades (use cheaper models for simple tasks)
 * - Condition filters (skip executions that don't need processing)
 * - Batching (group multiple requests)
 * - Caching (reuse results for similar inputs)
 */

import {
  db,
  baleybotUsage,
  baleybots,
  baleybotExecutions,
  eq,
  and,
  gte,
  desc,
  sql,
} from '@baleyui/db';
import { calculateCost } from './usage-tracker';

// ============================================================================
// TYPES
// ============================================================================

export type OptimizationType =
  | 'model_downgrade'
  | 'add_filter'
  | 'batch_processing'
  | 'caching'
  | 'reduce_tokens'
  | 'schedule_optimization';

export interface OptimizationSuggestion {
  type: OptimizationType;
  title: string;
  description: string;
  currentCost: number;
  projectedCost: number;
  savingsPercent: number;
  savingsAmount: number;
  implementation: string;
  confidence: 'high' | 'medium' | 'low';
  impact: 'high' | 'medium' | 'low';
}

export interface UsagePattern {
  baleybotId: string;
  baleybotName: string;
  balCode: string;
  avgTokensPerExecution: number;
  avgDurationMs: number;
  avgCostPerExecution: number;
  totalCost: number;
  executionCount: number;
  primaryModel: string | null;
  toolUsageRate: number;
  failureRate: number;
}

// ============================================================================
// MODEL TIERS
// ============================================================================

interface ModelTier {
  name: string;
  models: string[];
  avgCostPer1kTokens: number;
  capabilities: string[];
}

const MODEL_TIERS: ModelTier[] = [
  {
    name: 'Premium',
    models: [
      'anthropic:claude-3-opus-20240229',
      'openai:gpt-4-turbo',
      'openai:gpt-4o',
    ],
    avgCostPer1kTokens: 0.015,
    capabilities: ['complex_reasoning', 'creative', 'long_context', 'coding'],
  },
  {
    name: 'Standard',
    models: [
      'anthropic:claude-sonnet-4-20250514',
      'openai:gpt-4o',
    ],
    avgCostPer1kTokens: 0.005,
    capabilities: ['reasoning', 'analysis', 'coding', 'structured_output'],
  },
  {
    name: 'Economy',
    models: [
      'anthropic:claude-3-5-haiku-20241022',
      'openai:gpt-4o-mini',
      'openai:gpt-3.5-turbo',
    ],
    avgCostPer1kTokens: 0.0005,
    capabilities: ['simple_tasks', 'classification', 'extraction', 'formatting'],
  },
];

// ============================================================================
// USAGE PATTERN ANALYSIS
// ============================================================================

/**
 * Analyze usage patterns for a BaleyBot
 */
async function analyzeUsagePattern(baleybotId: string): Promise<UsagePattern | null> {
  const lookbackDays = 30;
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - lookbackDays);

  // Get BB details
  const bb = await db.query.baleybots.findFirst({
    where: eq(baleybots.id, baleybotId),
    columns: { name: true, balCode: true },
  });

  if (!bb) return null;

  // Get usage statistics
  const usageStats = await db
    .select({
      avgTokens: sql<number>`avg(${baleybotUsage.tokenTotal})`,
      avgDuration: sql<number>`avg(${baleybotUsage.durationMs})`,
      avgCost: sql<number>`avg(${baleybotUsage.estimatedCost})`,
      totalCost: sql<number>`sum(${baleybotUsage.estimatedCost})`,
      executionCount: sql<number>`count(*)`,
      avgToolCalls: sql<number>`avg(${baleybotUsage.toolCalls})`,
    })
    .from(baleybotUsage)
    .where(
      and(
        eq(baleybotUsage.baleybotId, baleybotId),
        gte(baleybotUsage.timestamp, startDate)
      )
    );

  // Get primary model
  const modelUsage = await db
    .select({
      model: baleybotUsage.model,
      count: sql<number>`count(*)`,
    })
    .from(baleybotUsage)
    .where(
      and(
        eq(baleybotUsage.baleybotId, baleybotId),
        gte(baleybotUsage.timestamp, startDate)
      )
    )
    .groupBy(baleybotUsage.model)
    .orderBy(desc(sql`count(*)`))
    .limit(1);

  // Get failure rate
  const failureStats = await db
    .select({
      total: sql<number>`count(*)`,
      failed: sql<number>`sum(case when ${baleybotExecutions.status} = 'failed' then 1 else 0 end)`,
    })
    .from(baleybotExecutions)
    .where(
      and(
        eq(baleybotExecutions.baleybotId, baleybotId),
        gte(baleybotExecutions.createdAt, startDate)
      )
    );

  const stats = usageStats[0];
  const failStats = failureStats[0];

  if (!stats || Number(stats.executionCount) === 0) {
    return null;
  }

  return {
    baleybotId,
    baleybotName: bb.name,
    balCode: bb.balCode,
    avgTokensPerExecution: Number(stats.avgTokens) || 0,
    avgDurationMs: Number(stats.avgDuration) || 0,
    avgCostPerExecution: Number(stats.avgCost) || 0,
    totalCost: Number(stats.totalCost) || 0,
    executionCount: Number(stats.executionCount) || 0,
    primaryModel: modelUsage[0]?.model ?? null,
    toolUsageRate: Number(stats.avgToolCalls) || 0,
    failureRate: failStats
      ? (Number(failStats.failed) || 0) / (Number(failStats.total) || 1)
      : 0,
  };
}

// ============================================================================
// OPTIMIZATION GENERATORS
// ============================================================================

/**
 * Check if a model downgrade is viable
 */
function suggestModelDowngrade(pattern: UsagePattern): OptimizationSuggestion | null {
  if (!pattern.primaryModel) return null;

  // Find current tier
  const currentTierIndex = MODEL_TIERS.findIndex((tier) =>
    tier.models.includes(pattern.primaryModel!)
  );

  if (currentTierIndex === -1 || currentTierIndex === MODEL_TIERS.length - 1) {
    return null; // Already on cheapest tier or unknown model
  }

  const currentTier = MODEL_TIERS[currentTierIndex]!;
  const cheaperTier = MODEL_TIERS[currentTierIndex + 1]!;

  // Estimate if simpler model would work based on heuristics
  const avgTokens = pattern.avgTokensPerExecution;
  const toolUsage = pattern.toolUsageRate;

  // Simple tasks: low tokens, low tool usage
  const isSimpleTask = avgTokens < 2000 && toolUsage < 2;

  if (!isSimpleTask) return null;

  // Calculate savings
  const currentCostPer1k = currentTier.avgCostPer1kTokens;
  const cheaperCostPer1k = cheaperTier.avgCostPer1kTokens;
  const savingsRatio = 1 - cheaperCostPer1k / currentCostPer1k;

  const projectedCost = pattern.totalCost * (1 - savingsRatio);
  const savingsAmount = pattern.totalCost - projectedCost;

  const suggestedModel = cheaperTier.models[0]!;

  return {
    type: 'model_downgrade',
    title: `Switch to ${cheaperTier.name} Model`,
    description:
      `Your BaleyBot "${pattern.baleybotName}" uses an average of ${Math.round(avgTokens)} tokens ` +
      `per execution with ${toolUsage.toFixed(1)} tool calls. This suggests simpler tasks that ` +
      `could be handled by a more cost-effective model.`,
    currentCost: pattern.totalCost,
    projectedCost,
    savingsPercent: savingsRatio * 100,
    savingsAmount,
    implementation:
      `Change model from "${pattern.primaryModel}" to "${suggestedModel}" in your BAL code:\n\n` +
      `"model": "${suggestedModel}"`,
    confidence: isSimpleTask ? 'high' : 'medium',
    impact: savingsRatio > 0.5 ? 'high' : savingsRatio > 0.2 ? 'medium' : 'low',
  };
}

/**
 * Suggest adding input filtering
 */
function suggestInputFilter(pattern: UsagePattern): OptimizationSuggestion | null {
  // If high failure rate, suggest filtering
  if (pattern.failureRate < 0.1) return null;

  const estimatedFilterableRate = pattern.failureRate * 0.7; // Assume 70% of failures could be filtered
  const projectedCost = pattern.totalCost * (1 - estimatedFilterableRate);
  const savingsAmount = pattern.totalCost - projectedCost;

  return {
    type: 'add_filter',
    title: 'Add Input Validation Filter',
    description:
      `Your BaleyBot "${pattern.baleybotName}" has a ${(pattern.failureRate * 100).toFixed(1)}% failure rate. ` +
      `Adding input validation before execution could skip invalid requests and reduce costs.`,
    currentCost: pattern.totalCost,
    projectedCost,
    savingsPercent: estimatedFilterableRate * 100,
    savingsAmount,
    implementation:
      `Add a validation check before your BaleyBot:\n\n` +
      `1. Create a "validator" entity that checks input validity\n` +
      `2. Use "when" directive to only proceed if valid:\n\n` +
      `validator {\n  "goal": "Check if input is valid for processing"\n}\n\n` +
      `when validator {\n  "pass": "${pattern.baleybotName.toLowerCase().replace(/\s+/g, '_')}"\n}`,
    confidence: 'medium',
    impact: pattern.failureRate > 0.2 ? 'high' : 'medium',
  };
}

/**
 * Suggest batching for high-frequency BBs
 */
function suggestBatching(pattern: UsagePattern): OptimizationSuggestion | null {
  // High frequency: more than 100 executions in 30 days
  if (pattern.executionCount < 100) return null;

  // Batching typically saves 20-40% due to reduced overhead
  const batchingSavings = 0.25;
  const projectedCost = pattern.totalCost * (1 - batchingSavings);
  const savingsAmount = pattern.totalCost - projectedCost;

  return {
    type: 'batch_processing',
    title: 'Enable Batch Processing',
    description:
      `Your BaleyBot "${pattern.baleybotName}" executed ${pattern.executionCount} times in the last 30 days. ` +
      `Batching similar requests together can reduce API overhead and costs.`,
    currentCost: pattern.totalCost,
    projectedCost,
    savingsPercent: batchingSavings * 100,
    savingsAmount,
    implementation:
      `Consider these batching strategies:\n\n` +
      `1. **Time-based batching**: Collect requests over a short window (e.g., 5 seconds) and process together\n` +
      `2. **Count-based batching**: Wait until N requests are collected before processing\n` +
      `3. **Scheduled batching**: Process all pending requests on a schedule (e.g., every hour)\n\n` +
      `Implementation example with scheduled batching:\n\n` +
      `batch_processor {\n  "goal": "Process all queued items",\n  "trigger": "schedule:*/15 * * * *"\n}`,
    confidence: 'medium',
    impact: 'medium',
  };
}

/**
 * Suggest caching for repetitive inputs
 */
function suggestCaching(pattern: UsagePattern): OptimizationSuggestion | null {
  // Only suggest if execution count is high
  if (pattern.executionCount < 50) return null;

  // Estimate 30% cache hit rate for repetitive tasks
  const estimatedCacheHitRate = 0.3;
  const projectedCost = pattern.totalCost * (1 - estimatedCacheHitRate);
  const savingsAmount = pattern.totalCost - projectedCost;

  return {
    type: 'caching',
    title: 'Implement Response Caching',
    description:
      `With ${pattern.executionCount} executions, your BaleyBot "${pattern.baleybotName}" ` +
      `may benefit from caching responses for similar inputs.`,
    currentCost: pattern.totalCost,
    projectedCost,
    savingsPercent: estimatedCacheHitRate * 100,
    savingsAmount,
    implementation:
      `Add caching using the store_memory tool:\n\n` +
      `1. Before processing, check if a cached result exists:\n` +
      `   - Generate a hash of the input\n` +
      `   - Look up in memory with that hash as key\n\n` +
      `2. If cache hit, return cached result\n\n` +
      `3. If cache miss, process and store result:\n` +
      `   - Use store_memory to save the result\n` +
      `   - Include TTL for automatic expiration`,
    confidence: 'low',
    impact: 'medium',
  };
}

/**
 * Suggest reducing token usage
 */
function suggestTokenReduction(pattern: UsagePattern): OptimizationSuggestion | null {
  // High token usage: more than 3000 tokens average
  if (pattern.avgTokensPerExecution < 3000) return null;

  // Estimate 25% reduction possible through optimization
  const reductionRate = 0.25;
  const projectedCost = pattern.totalCost * (1 - reductionRate);
  const savingsAmount = pattern.totalCost - projectedCost;

  return {
    type: 'reduce_tokens',
    title: 'Optimize Token Usage',
    description:
      `Your BaleyBot "${pattern.baleybotName}" uses an average of ${Math.round(pattern.avgTokensPerExecution)} ` +
      `tokens per execution. Optimizing prompts and output schemas can reduce this.`,
    currentCost: pattern.totalCost,
    projectedCost,
    savingsPercent: reductionRate * 100,
    savingsAmount,
    implementation:
      `Token reduction strategies:\n\n` +
      `1. **Shorter goal**: Make the goal concise but specific\n` +
      `2. **Structured output**: Define an output schema to avoid verbose responses:\n` +
      `   "output": { "result": "string", "confidence": "number" }\n\n` +
      `3. **Limit history**: Use "history": "none" if conversation history isn't needed\n\n` +
      `4. **Split complex tasks**: Break into smaller, focused BBs`,
    confidence: 'medium',
    impact: pattern.avgTokensPerExecution > 5000 ? 'high' : 'medium',
  };
}

// ============================================================================
// MAIN API
// ============================================================================

/**
 * Generate optimization suggestions for a BaleyBot
 */
export async function generateOptimizations(
  baleybotId: string
): Promise<OptimizationSuggestion[]> {
  const pattern = await analyzeUsagePattern(baleybotId);

  if (!pattern) {
    console.log(`[optimization-suggester] No usage data for BB ${baleybotId}`);
    return [];
  }

  const suggestions: OptimizationSuggestion[] = [];

  // Generate all applicable suggestions
  const generators = [
    suggestModelDowngrade,
    suggestInputFilter,
    suggestBatching,
    suggestCaching,
    suggestTokenReduction,
  ];

  for (const generator of generators) {
    const suggestion = generator(pattern);
    if (suggestion) {
      suggestions.push(suggestion);
    }
  }

  // Sort by savings amount (highest first)
  suggestions.sort((a, b) => b.savingsAmount - a.savingsAmount);

  console.log(
    `[optimization-suggester] Generated ${suggestions.length} suggestions for BB ${baleybotId}`
  );

  return suggestions;
}

/**
 * Generate optimization suggestions for all BBs in a workspace
 */
export async function generateWorkspaceOptimizations(
  workspaceId: string
): Promise<Map<string, OptimizationSuggestion[]>> {
  const results = new Map<string, OptimizationSuggestion[]>();

  // Get all BBs with usage data
  const lookbackDays = 30;
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - lookbackDays);

  const bbsWithUsage = await db
    .selectDistinct({ baleybotId: baleybotUsage.baleybotId })
    .from(baleybotUsage)
    .where(
      and(
        eq(baleybotUsage.workspaceId, workspaceId),
        gte(baleybotUsage.timestamp, startDate)
      )
    );

  for (const { baleybotId } of bbsWithUsage) {
    const suggestions = await generateOptimizations(baleybotId);
    if (suggestions.length > 0) {
      results.set(baleybotId, suggestions);
    }
  }

  return results;
}

/**
 * Get total potential savings for a workspace
 */
export async function getTotalPotentialSavings(
  workspaceId: string
): Promise<{
  totalCurrentCost: number;
  totalProjectedCost: number;
  totalSavings: number;
  savingsPercent: number;
  suggestionCount: number;
}> {
  const optimizations = await generateWorkspaceOptimizations(workspaceId);

  let totalCurrentCost = 0;
  let totalSavings = 0;
  let suggestionCount = 0;

  for (const [, suggestions] of optimizations) {
    // Only count the top suggestion per BB to avoid double-counting
    if (suggestions.length > 0) {
      const topSuggestion = suggestions[0]!;
      totalCurrentCost += topSuggestion.currentCost;
      totalSavings += topSuggestion.savingsAmount;
      suggestionCount += suggestions.length;
    }
  }

  const totalProjectedCost = totalCurrentCost - totalSavings;
  const savingsPercent =
    totalCurrentCost > 0 ? (totalSavings / totalCurrentCost) * 100 : 0;

  return {
    totalCurrentCost,
    totalProjectedCost,
    totalSavings,
    savingsPercent,
    suggestionCount,
  };
}
