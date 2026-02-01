/**
 * Pattern Detection
 *
 * AI decision pattern analysis and extraction.
 */

// Pattern analyzer
export {
  analyzeDecisions,
  getPatternSummary,
  getConfidenceColor,
  getConfidenceBackground,
} from './pattern-analyzer';

// Pattern detector
export {
  detectThresholdPatterns,
  detectSetMembershipPatterns,
  detectExactMatchPatterns,
  detectCompoundPatterns,
} from './pattern-detector';

// Types
export type {
  PatternType,
  DetectedPattern,
  PatternAnalysisResult,
  ThresholdPattern,
  SetMembershipPattern,
  CompoundPattern,
  ConditionAst,
} from './types';
