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

// Tool Catalog Service (new)
export {
  getToolCatalog,
  getRuntimeTools,
  formatToolCatalogForCreatorBot,
  getToolSummary,
  isToolAvailable,
  getToolByName,
  toolRequiresApproval,
  isToolForbidden,
  setSpawnBaleybotExecutor,
  setNotificationSender,
  setTaskScheduler,
  setMemoryStorage,
  isBuiltInTool,
  getApprovalRequiredTools,
  getBuiltInToolDefinitions,
  BUILT_IN_TOOLS_METADATA,
  type CatalogContext,
  type FullToolCatalog,
  type BuiltInToolMetadata,
  type BuiltInToolContext,
} from './tools/catalog-service';

// Built-in Tool Runtime
export {
  getBuiltInRuntimeTools,
} from './tools/built-in/implementations';

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
  type CreatorStreamChunk,
  // AI output
  creatorOutputSchema,
  type CreatorOutput,
  // Helper functions
  createInitialCanvasState,
  createSession,
} from './creator-types';
