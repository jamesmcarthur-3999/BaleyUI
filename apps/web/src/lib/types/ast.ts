/**
 * Type definitions for AST and pattern-related data structures.
 */

/**
 * A node in an abstract syntax tree.
 */
export interface ASTNode {
  type: string;
  name?: string;
  value?: unknown;
  children?: ASTNode[];
  position?: {
    start: { line: number; column: number };
    end: { line: number; column: number };
  };
}

/**
 * A parsed entity from BAL code.
 */
export interface ParsedEntity {
  name: string;
  instructions?: string;
  tools?: string[];
  model?: string;
  provider?: string;
}

/**
 * A condition object for pattern matching.
 */
export interface PatternCondition {
  field?: string;
  operator?: string;
  value?: unknown;
  threshold?: number;
  values?: unknown[];
  conditions?: PatternCondition[];
  [key: string]: unknown;
}

/**
 * Output template for a pattern.
 */
export interface PatternOutputTemplate {
  value?: unknown;
  [key: string]: unknown;
}
