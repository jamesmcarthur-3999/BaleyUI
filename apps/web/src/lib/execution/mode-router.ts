/**
 * Mode Router
 *
 * Determines which execution path to use for a block based on its execution mode.
 * Routes between AI-only, code-only, hybrid, and A/B test modes.
 */

import type { canHandleWithCode } from './pattern-matcher';

export type ExecutionMode = 'ai_only' | 'code_only' | 'hybrid' | 'ab_test';
export type ExecutionPath = 'ai' | 'code';

export interface ExecutionRoutingResult {
  mode: ExecutionPath;
  reason: string;
  confidence?: number;
  matchedPattern?: string;
}

export interface BlockConfig {
  id: string;
  executionMode: ExecutionMode;
  generatedCode?: string | null;
  hybridThreshold: string; // Stored as decimal string
  codeAccuracy?: string | null;
}

/**
 * Route execution based on block configuration and input
 */
export async function routeExecution(
  block: BlockConfig,
  input: unknown,
  patternMatcher?: typeof canHandleWithCode
): Promise<ExecutionRoutingResult> {
  const mode = block.executionMode || 'ai_only';

  switch (mode) {
    case 'ai_only':
      return {
        mode: 'ai',
        reason: 'Block configured for AI-only execution',
      };

    case 'code_only':
      if (!block.generatedCode) {
        return {
          mode: 'ai',
          reason: 'Code-only mode selected but no generated code available, falling back to AI',
        };
      }
      return {
        mode: 'code',
        reason: 'Block configured for code-only execution',
      };

    case 'hybrid':
      return await routeHybridExecution(block, input, patternMatcher);

    case 'ab_test':
      return routeABTestExecution(block);

    default:
      return {
        mode: 'ai',
        reason: `Unknown execution mode: ${mode}, defaulting to AI`,
      };
  }
}

/**
 * Route hybrid execution based on pattern matching and confidence
 */
async function routeHybridExecution(
  block: BlockConfig,
  input: unknown,
  patternMatcher?: typeof canHandleWithCode
): Promise<ExecutionRoutingResult> {
  // If no generated code, fall back to AI
  if (!block.generatedCode) {
    return {
      mode: 'ai',
      reason: 'Hybrid mode selected but no generated code available',
    };
  }

  // If no pattern matcher provided, default to AI
  if (!patternMatcher) {
    return {
      mode: 'ai',
      reason: 'Pattern matcher not available for hybrid routing',
    };
  }

  // Check if code can handle the input
  const matchResult = await patternMatcher(block, input);

  // Get threshold (default to 80 if not set)
  const threshold = parseFloat(block.hybridThreshold || '80.00');

  // If pattern matches with high confidence, use code
  if (matchResult.canHandle && matchResult.confidence >= threshold) {
    return {
      mode: 'code',
      reason: `Pattern matched with ${matchResult.confidence.toFixed(1)}% confidence (threshold: ${threshold}%)`,
      confidence: matchResult.confidence,
      matchedPattern: matchResult.matchedPattern,
    };
  }

  // Otherwise fall back to AI
  return {
    mode: 'ai',
    reason: matchResult.canHandle
      ? `Pattern matched but confidence ${matchResult.confidence.toFixed(1)}% below threshold ${threshold}%`
      : 'No matching patterns found in generated code',
    confidence: matchResult.confidence,
  };
}

/**
 * Simple deterministic hash function for A/B test bucketing
 * Uses djb2 algorithm to convert string to a number
 */
function hashString(str: string): number {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 33) ^ str.charCodeAt(i);
  }
  return hash >>> 0; // Convert to unsigned 32-bit integer
}

/**
 * Route A/B test execution with deterministic 50/50 split based on block ID
 * Uses a hash of the block ID to ensure consistent routing for the same block
 */
function routeABTestExecution(block: BlockConfig): ExecutionRoutingResult {
  // Deterministic 50/50 split based on block ID hash
  const hash = hashString(block.id);
  const useCode = hash % 2 === 0;

  // If code path selected but no code available, fall back to AI
  if (useCode && !block.generatedCode) {
    return {
      mode: 'ai',
      reason: 'A/B test selected code path but no generated code available',
    };
  }

  return {
    mode: useCode ? 'code' : 'ai',
    reason: `A/B test assigned ${useCode ? 'code' : 'AI'} path (bucket: ${hash % 2})`,
  };
}

/**
 * Determine if a block should use code execution
 */
export function shouldUseCode(routingResult: ExecutionRoutingResult): boolean {
  return routingResult.mode === 'code';
}

/**
 * Get execution mode display name
 */
export function getExecutionModeDisplayName(mode: ExecutionMode): string {
  switch (mode) {
    case 'ai_only':
      return 'AI Only';
    case 'code_only':
      return 'Code Only';
    case 'hybrid':
      return 'Hybrid';
    case 'ab_test':
      return 'A/B Test';
    default:
      return 'Unknown';
  }
}

/**
 * Get execution mode description
 */
export function getExecutionModeDescription(mode: ExecutionMode): string {
  switch (mode) {
    case 'ai_only':
      return 'Always use AI model for execution. Best for complex, variable inputs.';
    case 'code_only':
      return 'Always use generated code. Fast and cost-effective for known patterns.';
    case 'hybrid':
      return 'Use code for known patterns, fall back to AI for edge cases. Best of both worlds.';
    case 'ab_test':
      return 'Deterministic 50/50 split between AI and code based on block ID. Use for comparing performance.';
    default:
      return '';
  }
}
