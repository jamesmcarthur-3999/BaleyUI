/**
 * BaleyBots Integration Library
 *
 * This module provides utilities for:
 * - Compiling visual flows to BaleyBots runtime
 * - Validating schema compatibility between nodes
 * - Type definitions for flow builder
 */

// Types
export type {
  FlowNodeType,
  FlowNode,
  FlowEdge,
  FlowNodeData,
  AIBlockNodeData,
  FunctionBlockNodeData,
  RouterNodeData,
  ParallelNodeData,
  LoopNodeData,
  SourceNodeData,
  SinkNodeData,
  FilterNodeData,
  GateNodeData,
  JsonSchema,
  FlowDefinition,
  FlowTrigger,
  FlowExecutionContext,
  NodeExecutionState,
  NodeExecutionStatus,
  CompilationResult,
  CompilationError,
  CompilationWarning,
  SchemaCompatibilityResult,
  SchemaCompatibilityError,
  LoopCondition,
  ManualTriggerConfig,
  WebhookTriggerConfig,
  ScheduleTriggerConfig,
} from './types';

// Compiler
export { compileFlow } from './compiler';

// Schema Validator
export {
  validateSchemaCompatibility,
  isValidJsonSchema,
  describeSchema,
  mergeSchemas,
  getCommonFields,
  createEmptyValue,
} from './schema-validator';
