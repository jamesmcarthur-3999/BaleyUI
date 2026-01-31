/**
 * Pattern analyzer for BaleyUI.
 * Main service for analyzing AI decision history and detecting patterns.
 */

import { PatternAnalysisResult, DetectedPattern } from './types';
import {
  detectThresholdPatterns,
  detectSetMembershipPatterns,
  detectExactMatchPatterns,
  detectCompoundPatterns,
} from './pattern-detector';

interface Decision {
  id: string;
  input: unknown;
  output: unknown;
}

/**
 * Analyze decisions for a block and detect patterns.
 */
export async function analyzeDecisions(
  decisions: Decision[]
): Promise<PatternAnalysisResult> {
  if (decisions.length === 0) {
    return {
      blockId: '',
      totalDecisions: 0,
      outputDistribution: {},
      patterns: [],
      edgeCaseCount: 0,
      analyzedAt: new Date(),
    };
  }

  // Calculate output distribution
  const outputDistribution = calculateOutputDistribution(decisions);

  // Detect patterns for each output value
  const allPatterns: DetectedPattern[] = [];

  for (const [outputValue, count] of Object.entries(outputDistribution)) {
    // Skip if too few occurrences
    if (count < 2) continue;

    // Parse the output value back to its original type
    const parsedOutput = JSON.parse(outputValue);

    // Detect different types of patterns
    const thresholdPatterns = detectThresholdPatterns(decisions, parsedOutput);
    const setMembershipPatterns = detectSetMembershipPatterns(
      decisions,
      parsedOutput
    );
    const exactMatchPatterns = detectExactMatchPatterns(decisions, parsedOutput);
    const compoundPatterns = detectCompoundPatterns(decisions, parsedOutput);

    allPatterns.push(
      ...thresholdPatterns,
      ...setMembershipPatterns,
      ...exactMatchPatterns,
      ...compoundPatterns
    );
  }

  // Sort patterns by confidence and support count
  allPatterns.sort((a, b) => {
    if (Math.abs(a.confidence - b.confidence) > 5) {
      return b.confidence - a.confidence;
    }
    return b.supportCount - a.supportCount;
  });

  // Remove duplicate or overlapping patterns
  const uniquePatterns = deduplicatePatterns(allPatterns);

  // Calculate edge cases (decisions not covered by any pattern)
  const edgeCaseCount = calculateEdgeCases(decisions, uniquePatterns);

  return {
    blockId: decisions[0]?.id || '',
    totalDecisions: decisions.length,
    outputDistribution,
    patterns: uniquePatterns,
    edgeCaseCount,
    analyzedAt: new Date(),
  };
}

/**
 * Calculate the distribution of output values.
 */
function calculateOutputDistribution(
  decisions: Decision[]
): Record<string, number> {
  const distribution: Record<string, number> = {};

  for (const decision of decisions) {
    const key = JSON.stringify(decision.output);
    distribution[key] = (distribution[key] || 0) + 1;
  }

  return distribution;
}

/**
 * Remove duplicate or overlapping patterns.
 */
function deduplicatePatterns(patterns: DetectedPattern[]): DetectedPattern[] {
  const seen = new Set<string>();
  const unique: DetectedPattern[] = [];

  for (const pattern of patterns) {
    // Create a unique key for the pattern
    const key = `${pattern.type}:${pattern.condition}`;

    if (!seen.has(key)) {
      seen.add(key);
      unique.push(pattern);
    }
  }

  return unique;
}

/**
 * Calculate how many decisions are not covered by any pattern.
 */
function calculateEdgeCases(
  decisions: Decision[],
  patterns: DetectedPattern[]
): number {
  const coveredDecisionIds = new Set<string>();

  for (const pattern of patterns) {
    for (const sample of pattern.samples) {
      coveredDecisionIds.add(sample.decisionId);
    }
  }

  // Count decisions not in any pattern's samples
  let edgeCases = 0;
  for (const decision of decisions) {
    if (!coveredDecisionIds.has(decision.id)) {
      edgeCases++;
    }
  }

  return edgeCases;
}

/**
 * Get pattern summary for display.
 */
export function getPatternSummary(pattern: DetectedPattern): string {
  const confidenceLabel =
    pattern.confidence >= 90
      ? 'Very High'
      : pattern.confidence >= 70
        ? 'High'
        : pattern.confidence >= 50
          ? 'Medium'
          : 'Low';

  return `${confidenceLabel} confidence (${pattern.confidence.toFixed(1)}%) with ${pattern.supportCount} supporting decisions`;
}

/**
 * Get confidence color class for UI.
 */
export function getConfidenceColor(confidence: number): string {
  if (confidence >= 90) return 'text-green-600 dark:text-green-400';
  if (confidence >= 70) return 'text-yellow-600 dark:text-yellow-400';
  return 'text-red-600 dark:text-red-400';
}

/**
 * Get confidence background color class for UI.
 */
export function getConfidenceBackground(confidence: number): string {
  if (confidence >= 90) return 'bg-green-100 dark:bg-green-900/20';
  if (confidence >= 70) return 'bg-yellow-100 dark:bg-yellow-900/20';
  return 'bg-red-100 dark:bg-red-900/20';
}
