/**
 * Template builder for converting patterns into TypeScript code.
 */

import { DetectedPattern, PatternType } from './types';

/**
 * Convert a pattern to a JavaScript condition string.
 */
export function buildConditionCode(pattern: DetectedPattern): string {
  const ast = pattern.conditionAst as any;

  switch (pattern.type) {
    case 'threshold':
      return buildThresholdCondition(ast);
    case 'set_membership':
      return buildSetMembershipCondition(ast);
    case 'compound':
      return buildCompoundCondition(ast);
    case 'exact_match':
      return buildExactMatchCondition(ast);
    default:
      throw new Error(`Unknown pattern type: ${pattern.type}`);
  }
}

/**
 * Build threshold condition: input.field > value
 */
function buildThresholdCondition(ast: any): string {
  const field = ast.field || 'value';
  const operator = ast.operator || '>';
  const threshold = ast.threshold;

  return `input.${field} ${operator} ${JSON.stringify(threshold)}`;
}

/**
 * Build set membership condition: ['a', 'b'].includes(input.field)
 */
function buildSetMembershipCondition(ast: any): string {
  const field = ast.field || 'value';
  const values = ast.values || [];
  const valuesStr = JSON.stringify(values);

  return `${valuesStr}.includes(input.${field})`;
}

/**
 * Build compound condition: condA && condB
 */
function buildCompoundCondition(ast: any): string {
  const conditions = ast.conditions || [];
  const operator = ast.operator || '&&';

  if (conditions.length === 0) {
    return 'true';
  }

  const conditionStrings = conditions.map((cond: any) => {
    // Recursively build nested conditions
    if (cond.type === 'threshold') {
      return buildThresholdCondition(cond);
    } else if (cond.type === 'set_membership') {
      return buildSetMembershipCondition(cond);
    } else if (cond.type === 'exact_match') {
      return buildExactMatchCondition(cond);
    } else {
      return buildConditionFromAst(cond);
    }
  });

  if (conditionStrings.length === 1) {
    return conditionStrings[0];
  }

  return conditionStrings.map((c: string) => `(${c})`).join(` ${operator} `);
}

/**
 * Build exact match condition: input.field === value
 */
function buildExactMatchCondition(ast: any): string {
  const field = ast.field || 'value';
  const value = ast.value;

  return `input.${field} === ${JSON.stringify(value)}`;
}

/**
 * Generic AST to condition builder (fallback)
 */
function buildConditionFromAst(ast: any): string {
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
