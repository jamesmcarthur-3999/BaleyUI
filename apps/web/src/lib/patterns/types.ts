/**
 * Pattern extraction types for BaleyUI.
 * Defines the structure for detected patterns from AI decision history.
 */

export type PatternType = 'threshold' | 'set_membership' | 'compound' | 'exact_match';

/**
 * A detected pattern from decision analysis.
 */
export interface DetectedPattern {
  id: string;
  type: PatternType;
  condition: string; // Human-readable condition (e.g., "IF amount > 1000 → 'high'")
  conditionAst: object; // Machine-readable for code generation
  outputValue: unknown;
  confidence: number; // 0-100
  supportCount: number; // How many decisions match this pattern
  samples: Array<{
    input: unknown;
    output: unknown;
    decisionId: string;
  }>;
}

/**
 * Result of pattern analysis for a block.
 */
export interface PatternAnalysisResult {
  blockId: string;
  totalDecisions: number;
  outputDistribution: Record<string, number>; // outputValue -> count
  patterns: DetectedPattern[];
  edgeCaseCount: number; // Decisions that don't match any pattern
  analyzedAt: Date;
}

/**
 * Input pattern for threshold detection.
 */
export interface ThresholdPattern {
  field: string;
  operator: '>' | '<' | '>=' | '<=';
  value: number;
  outputValue: unknown;
}

/**
 * Input pattern for set membership detection.
 */
export interface SetMembershipPattern {
  field: string;
  values: unknown[];
  outputValue: unknown;
}

/**
 * Input pattern for compound conditions.
 */
export interface CompoundPattern {
  conditions: Array<{
    field: string;
    operator: '>' | '<' | '>=' | '<=' | '==' | '!=';
    value: unknown;
  }>;
  logic: 'AND' | 'OR';
  outputValue: unknown;
}

/**
 * AST node types for machine-readable conditions.
 */
export type ConditionAst =
  | {
      type: 'threshold';
      field: string;
      operator: '>' | '<' | '>=' | '<=';
      value: number;
    }
  | {
      type: 'set_membership';
      field: string;
      values: unknown[];
    }
  | {
      type: 'exact_match';
      field: string;
      value: unknown;
    }
  | {
      type: 'compound';
      logic: 'AND' | 'OR';
      conditions: Array<{
        field: string;
        operator: '>' | '<' | '>=' | '<=' | '==' | '!=';
        value: unknown;
      }>;
    };
