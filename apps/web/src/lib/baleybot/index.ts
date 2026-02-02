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

// Executor
export {
  executeBaleybot,
  canExecute,
  getEntityNames,
  getStructure,
  type ExecutorContext,
  type RuntimeToolDefinition,
} from './executor';

// Approval Checker
export {
  checkApproval,
  findMatchingPatterns,
  createPatternFromRequest,
  generalizePattern,
  type PatternMatchResult,
  type ApprovalCheckContext,
} from './approval-checker';

// Pattern Learner
export {
  proposePattern,
  analyzeRequestHistory,
  suggestGeneralization,
  validatePattern,
  describePattern,
  type PatternSuggestion,
  type LearnPatternResult,
  type LearnerContext,
} from './pattern-learner';

// Reviewer (to be implemented in Phase 7.1)
// export { reviewExecution } from './reviewer';

// Creator Bot - Conversational BaleyBot creation
export {
  createCreatorBot,
  processCreatorMessage,
  streamCreatorMessage,
  type CreatorBotOptions,
  type CreatorStreamChunk,
} from './creator-bot';

// Creator Types (selective exports to avoid conflicts with types.ts)
export {
  // Visual entity types
  type EntityStatus,
  type EntityPosition,
  type VisualEntity,
  // Connection types (using different names to avoid conflict)
  type ConnectionStatus,
  type Connection as VisualConnection,
  // Message types
  type MessageRole,
  type CreatorMessage,
  // Canvas state types
  type CreationStatus,
  type CanvasState,
  // Session types
  type CreationSession,
  // Streaming types
  type CreatorStreamChunkType,
  type CreatorStreamChunk as CreatorStreamChunkData,
  // AI output
  creatorOutputSchema,
  type CreatorOutput,
  // Helper functions
  createInitialCanvasState,
  createSession,
} from './creator-types';
