/**
 * Code generator service that converts detected patterns into TypeScript code.
 */

import {
  DetectedPattern,
  GeneratedCodeResult,
  CodeGenerationOptions,
} from './types';
import {
  buildPatternBlock,
  buildZodSchema,
} from './template-builder';

/**
 * Generate TypeScript code from detected patterns.
 */
export function generateCode(
  patterns: DetectedPattern[],
  options: CodeGenerationOptions
): GeneratedCodeResult {
  const { blockName, outputSchema, includeComments = true, minConfidence = 0 } = options;

  // Filter patterns by minimum confidence
  const filteredPatterns = patterns.filter(
    p => p.confidence >= minConfidence
  );

  // Sort patterns by confidence (highest first)
  const sortedPatterns = [...filteredPatterns].sort(
    (a, b) => b.confidence - a.confidence
  );

  // Generate header comments
  const header = generateHeader(sortedPatterns);

  // Generate imports
  const imports = generateImports();

  // Generate Zod schema
  const schemaCode = buildZodSchema(outputSchema, 'outputSchema');

  // Generate pattern blocks
  const patternBlocks = sortedPatterns
    .map(pattern => buildPatternBlock(pattern, { includeComments }))
    .join('\n');

  // Generate the complete code
  const code = `${header}

${imports}

${schemaCode}

export const ${blockName} = Deterministic.create({
  name: '${blockName}-generated',
  processFn: (input: any) => {
${patternBlocks}
    // No pattern matched - return null to trigger AI fallback
    return null;
  },
  schema: outputSchema
});
`;

  return {
    code,
    coveredPatterns: sortedPatterns.length,
    totalPatterns: patterns.length,
    generatedAt: new Date(),
  };
}

/**
 * Generate header comments with metadata.
 */
function generateHeader(patterns: DetectedPattern[]): string {
  const totalSupport = patterns.reduce((sum, p) => sum + p.supportCount, 0);
  const avgConfidence = patterns.length > 0
    ? patterns.reduce((sum, p) => sum + p.confidence, 0) / patterns.length
    : 0;

  const header = `/**
 * AUTO-GENERATED CODE - DO NOT EDIT MANUALLY
 *
 * Generated from ${patterns.length} AI decisions
 * Coverage: ${totalSupport} historical cases
 * Average confidence: ${Math.round(avgConfidence * 100)}%
 *
 * This code was automatically extracted from AI decision patterns.
 * When patterns don't match, execution falls back to AI.
 *
 * Generated at: ${new Date().toISOString()}
 */`;

  return header;
}

/**
 * Generate import statements.
 */
function generateImports(): string {
  return `import { Deterministic } from '@baleybots/core';
import { z } from 'zod';`;
}

/**
 * Calculate coverage percentage for generated code.
 */
export function calculateCoverage(
  patterns: DetectedPattern[],
  totalDecisions: number
): number {
  if (totalDecisions === 0) return 0;

  const coveredCases = patterns.reduce((sum, p) => sum + p.supportCount, 0);
  return Math.round((coveredCases / totalDecisions) * 100);
}

/**
 * Validate that generated code is syntactically correct (basic check).
 */
export function validateGeneratedCode(code: string): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  // Basic validation checks
  if (!code.includes('export const')) {
    errors.push('Missing export statement');
  }

  if (!code.includes('Deterministic.create')) {
    errors.push('Missing Deterministic.create call');
  }

  if (!code.includes('processFn:')) {
    errors.push('Missing processFn');
  }

  if (!code.includes('schema:')) {
    errors.push('Missing schema definition');
  }

  // Check for balanced braces
  const openBraces = (code.match(/{/g) || []).length;
  const closeBraces = (code.match(/}/g) || []).length;
  if (openBraces !== closeBraces) {
    errors.push('Unbalanced braces');
  }

  // Check for balanced parentheses
  const openParens = (code.match(/\(/g) || []).length;
  const closeParens = (code.match(/\)/g) || []).length;
  if (openParens !== closeParens) {
    errors.push('Unbalanced parentheses');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Get statistics about generated patterns.
 */
export function getPatternStats(patterns: DetectedPattern[]): {
  byType: Record<string, number>;
  totalSupport: number;
  avgConfidence: number;
  highConfidenceCount: number;
} {
  const byType: Record<string, number> = {};
  let totalSupport = 0;
  let totalConfidence = 0;
  let highConfidenceCount = 0;

  patterns.forEach(pattern => {
    // Count by type
    byType[pattern.type] = (byType[pattern.type] || 0) + 1;

    // Sum support
    totalSupport += pattern.supportCount;

    // Sum confidence
    totalConfidence += pattern.confidence;

    // Count high confidence (>= 0.8)
    if (pattern.confidence >= 0.8) {
      highConfidenceCount++;
    }
  });

  return {
    byType,
    totalSupport,
    avgConfidence: patterns.length > 0 ? totalConfidence / patterns.length : 0,
    highConfidenceCount,
  };
}
