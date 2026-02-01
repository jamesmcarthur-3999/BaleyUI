/**
 * Code Generation
 *
 * AI decision pattern analysis and code generation.
 */

// Code generator
export {
  generateCode,
  calculateCoverage,
  validateGeneratedCode,
  getPatternStats,
} from './code-generator';

// Historical testing
export {
  testGeneratedCode,
  calculateAccuracyMetrics,
  analyzeMismatches,
} from './historical-tester';

// Template builder
export {
  buildConditionCode,
  buildOutputCode,
  buildPatternBlock,
  buildZodSchema,
} from './template-builder';

// Types
export type {
  PatternType,
  DetectedPattern,
  GeneratedCodeResult,
  HistoricalTestResult,
  CodeGenerationOptions,
} from './types';
