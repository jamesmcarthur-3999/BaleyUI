/**
 * Fallback Tracker
 *
 * Tracks when hybrid/code execution falls back to AI.
 * Stores metadata in blockExecutions table for analysis and improvement.
 */

import { db, blockExecutions, eq } from '@baleyui/db';
import { createLogger } from '@/lib/logger';

const logger = createLogger('fallback-tracker');

export interface FallbackData {
  blockId: string;
  executionId: string;
  input: unknown;
  reason: string;
  confidence?: number;
  attemptedPattern?: string;
}

/**
 * Track a fallback from code to AI execution
 */
export async function trackFallback(data: FallbackData): Promise<void> {
  try {
    // Update the block execution record with fallback metadata
    // Note: matchConfidence is decimal(5,2), stored as string representation
    await db
      .update(blockExecutions)
      .set({
        executionPath: 'ai',
        fallbackReason: data.reason,
        patternMatched: data.attemptedPattern || null,
        matchConfidence: data.confidence !== undefined ? data.confidence.toFixed(2) : null,
      })
      .where(eq(blockExecutions.id, data.executionId));

    // Log for analytics (optional: could send to external service)
    logger.info('Tracked fallback', {
      blockId: data.blockId,
      executionId: data.executionId,
      reason: data.reason,
      confidence: data.confidence,
    });
  } catch (error: unknown) {
    // Don't fail execution if fallback tracking fails
    logger.error('Failed to track fallback', error);
  }
}

/**
 * Track successful code execution (no fallback)
 */
export async function trackCodeExecution(
  executionId: string,
  matchedPattern: string,
  confidence: number
): Promise<void> {
  try {
    // Note: matchConfidence is decimal(5,2), stored as string representation
    await db
      .update(blockExecutions)
      .set({
        executionPath: 'code',
        fallbackReason: null,
        patternMatched: matchedPattern,
        matchConfidence: confidence.toFixed(2),
      })
      .where(eq(blockExecutions.id, executionId));
  } catch (error: unknown) {
    logger.error('Failed to track code execution', error);
  }
}

/**
 * Track A/B test execution
 */
export async function trackABTestExecution(
  executionId: string,
  path: 'ai' | 'code',
  reason: string
): Promise<void> {
  try {
    await db
      .update(blockExecutions)
      .set({
        executionPath: path,
        fallbackReason: reason,
      })
      .where(eq(blockExecutions.id, executionId));
  } catch (error: unknown) {
    logger.error('Failed to track A/B test execution', error);
  }
}

/**
 * Get fallback statistics for a block
 */
export async function getFallbackStats(blockId: string): Promise<{
  totalExecutions: number;
  codeExecutions: number;
  aiExecutions: number;
  fallbackRate: number;
  commonReasons: Array<{ reason: string; count: number }>;
}> {
  try {
    // Get all executions for this block
    const executions = await db.query.blockExecutions.findMany({
      where: eq(blockExecutions.blockId, blockId),
      columns: {
        executionPath: true,
        fallbackReason: true,
      },
    });

    const totalExecutions = executions.length;
    const codeExecutions = executions.filter(e => e.executionPath === 'code').length;
    const aiExecutions = executions.filter(e => e.executionPath === 'ai').length;
    const fallbackRate = totalExecutions > 0 ? (aiExecutions / totalExecutions) * 100 : 0;

    // Count fallback reasons
    const reasonCounts = new Map<string, number>();
    for (const execution of executions) {
      if (execution.executionPath === 'ai' && execution.fallbackReason) {
        const count = reasonCounts.get(execution.fallbackReason) || 0;
        reasonCounts.set(execution.fallbackReason, count + 1);
      }
    }

    const commonReasons = Array.from(reasonCounts.entries())
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5); // Top 5 reasons

    return {
      totalExecutions,
      codeExecutions,
      aiExecutions,
      fallbackRate,
      commonReasons,
    };
  } catch (error: unknown) {
    logger.error('Failed to get fallback stats', error);
    return {
      totalExecutions: 0,
      codeExecutions: 0,
      aiExecutions: 0,
      fallbackRate: 0,
      commonReasons: [],
    };
  }
}

/**
 * Get recent fallback logs for a block
 */
export async function getRecentFallbacks(
  blockId: string,
  limit: number = 20
): Promise<Array<{
  id: string;
  input: unknown;
  reason: string;
  confidence?: number;
  createdAt: Date;
}>> {
  try {
    const executions = await db.query.blockExecutions.findMany({
      where: eq(blockExecutions.blockId, blockId),
      columns: {
        id: true,
        input: true,
        fallbackReason: true,
        matchConfidence: true,
        createdAt: true,
      },
      orderBy: (executions, { desc }) => [desc(executions.createdAt)],
      limit,
    });

    return executions
      .filter(e => e.fallbackReason) // Only fallbacks
      .map(e => ({
        id: e.id,
        input: e.input,
        reason: e.fallbackReason || 'Unknown',
        confidence: e.matchConfidence ? parseFloat(e.matchConfidence) : undefined,
        createdAt: e.createdAt,
      }));
  } catch (error: unknown) {
    logger.error('Failed to get recent fallbacks', error);
    return [];
  }
}

/**
 * Analyze fallback patterns to suggest improvements
 */
export async function analyzeFallbackPatterns(blockId: string): Promise<{
  suggestions: string[];
  confidence: number;
}> {
  try {
    const stats = await getFallbackStats(blockId);

    const suggestions: string[] = [];

    // High fallback rate suggests code coverage issues
    if (stats.fallbackRate > 50) {
      suggestions.push(
        `High fallback rate (${stats.fallbackRate.toFixed(1)}%). Consider generating more comprehensive code patterns.`
      );
    }

    // Analyze common reasons
    for (const { reason, count } of stats.commonReasons) {
      if (reason.includes('pattern') && count > 5) {
        suggestions.push(
          `Frequently falling back due to missing patterns. Add patterns for: ${reason}`
        );
      }
      if (reason.includes('confidence') && count > 5) {
        suggestions.push(
          `Low confidence matches. Consider lowering hybrid threshold or improving pattern matching.`
        );
      }
    }

    // Calculate confidence in suggestions
    const confidence = Math.min(stats.totalExecutions * 2, 100);

    return {
      suggestions,
      confidence,
    };
  } catch (error: unknown) {
    logger.error('Failed to analyze fallback patterns', error);
    return {
      suggestions: [],
      confidence: 0,
    };
  }
}
