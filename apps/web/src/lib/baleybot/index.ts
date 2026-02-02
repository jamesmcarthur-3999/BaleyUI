/**
 * BaleyBot Module - BAL-first architecture
 *
 * This module provides the core services for the BaleyBot platform:
 * - Generator: Convert natural language to BAL code
 * - Executor: Run BAL code using Pipeline.from()
 * - Approval: Pattern matching and learning for tool approvals
 * - Reviewer: AI review of execution results
 */

// Types
export * from './types';

// Tool Catalog
export {
  buildToolCatalog,
  categorizeToolName,
  formatToolCatalogForAI,
  getToolAssignmentRationale,
  type ToolCatalog,
  type ToolCategory,
  type ToolCatalogContext,
} from './tool-catalog';

// Generator
export {
  createBalGenerator,
  generateBal,
  parseBalCode,
  validateBalCode,
  formatExistingBaleybots,
} from './generator';

// Executor (to be implemented in Phase 2.2)
// export { executeBaleybot } from './executor';

// Approval Checker (to be implemented in Phase 2.3)
// export { checkApproval } from './approval-checker';

// Pattern Learner (to be implemented in Phase 2.4)
// export { proposePattern, savePattern } from './pattern-learner';

// Reviewer (to be implemented in Phase 7.1)
// export { reviewExecution } from './reviewer';
