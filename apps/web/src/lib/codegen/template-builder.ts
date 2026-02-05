/**
 * Template builder for converting patterns into TypeScript code.
 */

import { DetectedPattern, PatternType } from './types';

// ============================================================================
// AST Type Definitions
// ============================================================================

/**
 * Base AST node interface
 */
interface BaseConditionAst {
  type?: PatternType;
}

/**
 * AST for threshold conditions: input.field > value
 */
interface ThresholdConditionAst extends BaseConditionAst {
  type?: 'threshold';
  field?: string;
  operator?: string;
  threshold: unknown;
}

/**
 * AST for set membership conditions: ['a', 'b'].includes(input.field)
 */
interface SetMembershipConditionAst extends BaseConditionAst {
  type?: 'set_membership';
  field?: string;
  values?: unknown[];
}

/**
 * AST for exact match conditions: input.field === value
 */
interface ExactMatchConditionAst extends BaseConditionAst {
  type?: 'exact_match';
  field?: string;
  value: unknown;
}

/**
 * AST for compound conditions: condA && condB
 */
interface CompoundConditionAst extends BaseConditionAst {
  type?: 'compound';
  conditions?: ConditionAst[];
  operator?: string;
}

/**
 * Generic AST with field, operator, and value (fallback)
 */
interface GenericConditionAst extends BaseConditionAst {
  field?: string;
  operator?: string;
  value?: unknown;
}

/**
 * Union type for all condition AST variants
 */
type ConditionAst =
  | ThresholdConditionAst
  | SetMembershipConditionAst
  | ExactMatchConditionAst
  | CompoundConditionAst
  | GenericConditionAst;

// ============================================================================
// Type Guards
// ============================================================================

function isThresholdAst(ast: ConditionAst): ast is ThresholdConditionAst {
  return ast.type === 'threshold' || 'threshold' in ast;
}

function isSetMembershipAst(ast: ConditionAst): ast is SetMembershipConditionAst {
  return ast.type === 'set_membership' || 'values' in ast;
}

function isExactMatchAst(ast: ConditionAst): ast is ExactMatchConditionAst {
  return ast.type === 'exact_match' || ('value' in ast && !('operator' in ast && ast.operator));
}

function isCompoundAst(ast: ConditionAst): ast is CompoundConditionAst {
  return ast.type === 'compound' || 'conditions' in ast;
}

/**
 * Convert a pattern to a JavaScript condition string.
 */
export function buildConditionCode(pattern: DetectedPattern): string {
  const ast = pattern.conditionAst as ConditionAst;

  switch (pattern.type) {
    case 'threshold':
      return buildThresholdCondition(ast as ThresholdConditionAst);
    case 'set_membership':
      return buildSetMembershipCondition(ast as SetMembershipConditionAst);
    case 'compound':
      return buildCompoundCondition(ast as CompoundConditionAst);
    case 'exact_match':
      return buildExactMatchCondition(ast as ExactMatchConditionAst);
    default:
      throw new Error(`Unknown pattern type: ${pattern.type}`);
  }
}

/**
 * Build threshold condition: input.field > value
 */
function buildThresholdCondition(ast: ThresholdConditionAst): string {
  const field = ast.field || 'value';
  const operator = ast.operator || '>';
  const threshold = ast.threshold;

  return `input.${field} ${operator} ${JSON.stringify(threshold)}`;
}

/**
 * Build set membership condition: ['a', 'b'].includes(input.field)
 */
function buildSetMembershipCondition(ast: SetMembershipConditionAst): string {
  const field = ast.field || 'value';
  const values = ast.values || [];
  const valuesStr = JSON.stringify(values);

  return `${valuesStr}.includes(input.${field})`;
}

/**
 * Build compound condition: condA && condB
 */
function buildCompoundCondition(ast: CompoundConditionAst): string {
  const conditions = ast.conditions || [];
  const operator = ast.operator || '&&';

  if (conditions.length === 0) {
    return 'true';
  }

  const conditionStrings = conditions.map((cond: ConditionAst) => {
    // Recursively build nested conditions
    if (cond.type === 'threshold' || isThresholdAst(cond)) {
      return buildThresholdCondition(cond as ThresholdConditionAst);
    } else if (cond.type === 'set_membership' || isSetMembershipAst(cond)) {
      return buildSetMembershipCondition(cond as SetMembershipConditionAst);
    } else if (cond.type === 'exact_match' || isExactMatchAst(cond)) {
      return buildExactMatchCondition(cond as ExactMatchConditionAst);
    } else {
      return buildConditionFromAst(cond as GenericConditionAst);
    }
  });

  if (conditionStrings.length === 1) {
    return conditionStrings[0] ?? 'true';
  }

  return conditionStrings.map((c: string) => `(${c})`).join(` ${operator} `);
}

/**
 * Build exact match condition: input.field === value
 */
function buildExactMatchCondition(ast: ExactMatchConditionAst): string {
  const field = ast.field || 'value';
  const value = ast.value;

  return `input.${field} === ${JSON.stringify(value)}`;
}

/**
 * Generic AST to condition builder (fallback)
 */
function buildConditionFromAst(ast: GenericConditionAst): string {
  if (ast.field && ast.operator && ast.value !== undefined) {
    return `input.${ast.field} ${ast.operator} ${JSON.stringify(ast.value)}`;
  }
  return 'true';
}

/**
 * Generate return statement for output value.
 */
export function buildOutputCode(outputValue: unknown, indent = 2): string {
  const indentStr = ' '.repeat(indent);

  if (outputValue === null || outputValue === undefined) {
    return `${indentStr}return null;`;
  }

  // Format the output nicely
  const jsonStr = JSON.stringify(outputValue, null, 2);
  const lines = jsonStr.split('\n');

  if (lines.length === 1) {
    return `${indentStr}return ${jsonStr};`;
  }

  // Multi-line object/array - indent each line
  const indentedLines = lines.map((line, idx) => {
    if (idx === 0) {
      return `${indentStr}return ${line}`;
    }
    return `${indentStr}${line}`;
  });

  indentedLines[indentedLines.length - 1] += ';';
  return indentedLines.join('\n');
}

/**
 * Build a complete if-statement block for a pattern.
 */
export function buildPatternBlock(
  pattern: DetectedPattern,
  options: { includeComments?: boolean } = {}
): string {
  const { includeComments = true } = options;

  const condition = buildConditionCode(pattern);
  const output = buildOutputCode(pattern.outputValue, 4);

  let block = '';

  if (includeComments) {
    const confidencePercent = Math.round(pattern.confidence * 100);
    block += `  // Pattern: ${pattern.condition} (${confidencePercent}% confidence, ${pattern.supportCount} cases)\n`;
  }

  block += `  if (${condition}) {\n`;
  block += `${output}\n`;
  block += `  }\n`;

  return block;
}

/**
 * Infer Zod schema from a sample output object.
 */
export function buildZodSchema(sampleOutput: unknown, schemaName = 'outputSchema'): string {
  if (sampleOutput === null || sampleOutput === undefined) {
    return `const ${schemaName} = z.unknown();`;
  }

  if (typeof sampleOutput === 'string') {
    return `const ${schemaName} = z.string();`;
  }

  if (typeof sampleOutput === 'number') {
    return `const ${schemaName} = z.number();`;
  }

  if (typeof sampleOutput === 'boolean') {
    return `const ${schemaName} = z.boolean();`;
  }

  if (Array.isArray(sampleOutput)) {
    if (sampleOutput.length === 0) {
      return `const ${schemaName} = z.array(z.unknown());`;
    }
    const firstItem = sampleOutput[0];
    const itemSchema = inferZodType(firstItem);
    return `const ${schemaName} = z.array(${itemSchema});`;
  }

  if (typeof sampleOutput === 'object') {
    const obj = sampleOutput as Record<string, unknown>;
    const fields = Object.keys(obj).map(key => {
      const value = obj[key];
      const zodType = inferZodType(value);
      return `    ${key}: ${zodType}`;
    });

    return `const ${schemaName} = z.object({\n${fields.join(',\n')}\n  });`;
  }

  return `const ${schemaName} = z.unknown();`;
}

/**
 * Infer Zod type string from a value.
 */
function inferZodType(value: unknown): string {
  if (value === null || value === undefined) {
    return 'z.unknown().nullable()';
  }

  if (typeof value === 'string') {
    return 'z.string()';
  }

  if (typeof value === 'number') {
    return 'z.number()';
  }

  if (typeof value === 'boolean') {
    return 'z.boolean()';
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return 'z.array(z.unknown())';
    }
    const itemType = inferZodType(value[0]);
    return `z.array(${itemType})`;
  }

  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const fields = Object.keys(obj).map(key => {
      const val = obj[key];
      const zodType = inferZodType(val);
      return `${key}: ${zodType}`;
    });
    return `z.object({ ${fields.join(', ')} })`;
  }

  return 'z.unknown()';
}
