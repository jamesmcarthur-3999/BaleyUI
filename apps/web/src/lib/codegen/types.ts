/**
 * Types for code generation from detected patterns.
 */

export type PatternType = 'threshold' | 'set_membership' | 'compound' | 'exact_match';

export interface DetectedPattern {
  id: string;
  type: PatternType;
  condition: string; // Human-readable description
  conditionAst: object; // Machine-readable AST
  outputValue: unknown;
  confidence: number;
  supportCount: number;
}

export interface GeneratedCodeResult {
  code: string;
  coveredPatterns: number;
  totalPatterns: number;
  generatedAt: Date;
}

export interface HistoricalTestResult {
  accuracy: number;
  totalTested: number;
  correctCount: number;
  mismatches: Array<{
    decisionId: string;
    input: unknown;
    expectedOutput: unknown;
    actualOutput: unknown;
  }>;
}

export interface CodeGenerationOptions {
  blockName: string;
  outputSchema: object;
  includeComments?: boolean;
  minConfidence?: number;
}
