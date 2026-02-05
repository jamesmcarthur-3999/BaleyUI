/**
 * Pattern Matcher
 *
 * Analyzes generated code to extract patterns and checks if input matches them.
 * Used in hybrid mode to determine if code can handle the input or if AI fallback is needed.
 */

import { createLogger } from '@/lib/logger';

const logger = createLogger('pattern-matcher');

export interface PatternMatchResult {
  canHandle: boolean;
  matchedPattern?: string;
  confidence: number; // 0-100
}

export interface BlockConfig {
  id: string;
  generatedCode?: string | null;
}

/**
 * Check if the block's generated code can handle the given input
 */
export async function canHandleWithCode(
  block: BlockConfig,
  input: unknown
): Promise<PatternMatchResult> {
  // If no generated code, cannot handle
  if (!block.generatedCode) {
    return {
      canHandle: false,
      confidence: 0,
    };
  }

  try {
    // Extract patterns from the generated code
    const patterns = extractPatternsFromCode(block.generatedCode);

    // If no patterns found, assume code can handle anything with moderate confidence
    if (patterns.length === 0) {
      return {
        canHandle: true,
        confidence: 60,
        matchedPattern: 'default',
      };
    }

    // Check input against each pattern
    for (const pattern of patterns) {
      const matchResult = checkInputAgainstPattern(input, pattern);
      if (matchResult.matches) {
        return {
          canHandle: true,
          matchedPattern: pattern.description,
          confidence: matchResult.confidence,
        };
      }
    }

    // No patterns matched
    return {
      canHandle: false,
      confidence: 0,
    };
  } catch (error: unknown) {
    // On error, be conservative and fall back to AI
    logger.error('Pattern matching error', error);
    return {
      canHandle: false,
      confidence: 0,
    };
  }
}

/**
 * Pattern definition
 */
interface Pattern {
  type: 'condition' | 'switch' | 'validation' | 'transformation';
  description: string;
  conditions: PatternCondition[];
}

interface PatternCondition {
  field?: string;
  operator: 'equals' | 'contains' | 'regex' | 'range' | 'type' | 'exists';
  value?: unknown;
  caseSensitive?: boolean;
}

/**
 * Extract patterns from generated code
 */
function extractPatternsFromCode(code: string): Pattern[] {
  const patterns: Pattern[] = [];

  // Extract if/else conditions
  const ifPatterns = extractIfConditions(code);
  patterns.push(...ifPatterns);

  // Extract switch statements
  const switchPatterns = extractSwitchCases(code);
  patterns.push(...switchPatterns);

  // Extract validation patterns (regex, type checks, etc.)
  const validationPatterns = extractValidations(code);
  patterns.push(...validationPatterns);

  return patterns;
}

/**
 * Extract if/else condition patterns
 */
function extractIfConditions(code: string): Pattern[] {
  const patterns: Pattern[] = [];

  // Match if statements with field comparisons
  // Example: if (input.type === 'email')
  const ifRegex = /if\s*\(\s*(\w+(?:\.\w+)*)\s*(===|!==|==|!=|>|<|>=|<=|includes|startsWith|endsWith)\s*['"`]?([^'"`\)]+)['"`]?\s*\)/g;

  let match;
  while ((match = ifRegex.exec(code)) !== null) {
    const [, field, operator, value] = match;

    const condition: PatternCondition = {
      field: field?.trim(),
      operator: mapOperator(operator?.trim() || ''),
      value: value?.trim().replace(/['"]/g, ''),
    };

    patterns.push({
      type: 'condition',
      description: `${field} ${operator} ${value}`,
      conditions: [condition],
    });
  }

  return patterns;
}

/**
 * Extract switch statement patterns
 */
function extractSwitchCases(code: string): Pattern[] {
  const patterns: Pattern[] = [];

  // Match switch statements
  // Example: switch(input.type) { case 'email': ... }
  const switchRegex = /switch\s*\(\s*(\w+(?:\.\w+)*)\s*\)\s*{([^}]+)}/g;

  let match;
  while ((match = switchRegex.exec(code)) !== null) {
    const [, field, caseBlock] = match;

    // Extract case values
    const caseRegex = /case\s+['"`]?([^'"`:\s]+)['"`]?\s*:/g;
    const values: string[] = [];

    let caseMatch;
    while ((caseMatch = caseRegex.exec(caseBlock || '')) !== null) {
      values.push(caseMatch[1] || '');
    }

    if (values.length > 0) {
      patterns.push({
        type: 'switch',
        description: `${field} is one of: ${values.join(', ')}`,
        conditions: values.map(value => ({
          field,
          operator: 'equals',
          value,
        })),
      });
    }
  }

  return patterns;
}

/**
 * Extract validation patterns (regex, typeof, etc.)
 */
function extractValidations(code: string): Pattern[] {
  const patterns: Pattern[] = [];

  // Match regex validations
  // Example: /^[a-z]+$/.test(input.value)
  const regexValidation = /\/([^\/]+)\/\.(test|exec)\s*\(\s*(\w+(?:\.\w+)*)\s*\)/g;

  let match;
  while ((match = regexValidation.exec(code)) !== null) {
    const [, pattern, , field] = match;

    patterns.push({
      type: 'validation',
      description: `${field} matches pattern /${pattern}/`,
      conditions: [{
        field,
        operator: 'regex',
        value: pattern,
      }],
    });
  }

  // Match typeof checks
  // Example: typeof input.value === 'string'
  const typeofRegex = /typeof\s+(\w+(?:\.\w+)*)\s*===\s*['"`](\w+)['"`]/g;

  while ((match = typeofRegex.exec(code)) !== null) {
    const [, field, type] = match;

    patterns.push({
      type: 'validation',
      description: `${field} is type ${type}`,
      conditions: [{
        field,
        operator: 'type',
        value: type,
      }],
    });
  }

  return patterns;
}

/**
 * Map code operators to pattern operators
 */
function mapOperator(operator: string): PatternCondition['operator'] {
  switch (operator) {
    case '===':
    case '==':
    case '!==':
    case '!=':
      return 'equals';
    case 'includes':
      return 'contains';
    case '>':
    case '<':
    case '>=':
    case '<=':
      return 'range';
    default:
      return 'equals';
  }
}

/**
 * Check if input matches a pattern
 */
function checkInputAgainstPattern(
  input: unknown,
  pattern: Pattern
): { matches: boolean; confidence: number } {
  let matchedConditions = 0;
  const totalConditions = pattern.conditions.length;

  for (const condition of pattern.conditions) {
    if (checkCondition(input, condition)) {
      matchedConditions++;
    }
  }

  // For switch patterns, any matching case is a full match
  if (pattern.type === 'switch' && matchedConditions > 0) {
    return { matches: true, confidence: 95 };
  }

  // For other patterns, all conditions must match
  const allMatched = matchedConditions === totalConditions;
  const confidence = allMatched ? 90 : (matchedConditions / totalConditions) * 50;

  return { matches: allMatched, confidence };
}

/**
 * Check if input satisfies a single condition
 */
function checkCondition(input: unknown, condition: PatternCondition): boolean {
  try {
    // Get the field value from input
    const value = condition.field ? getNestedValue(input, condition.field) : input;

    switch (condition.operator) {
      case 'equals':
        return value === condition.value || String(value) === String(condition.value);

      case 'contains':
        return String(value).includes(String(condition.value));

      case 'regex':
        if (typeof condition.value === 'string') {
          const regex = new RegExp(condition.value);
          return regex.test(String(value));
        }
        return false;

      case 'type':
        return typeof value === condition.value;

      case 'exists':
        return value !== undefined && value !== null;

      case 'range':
        // Simple numeric range check
        const numValue = Number(value);
        const numCondition = Number(condition.value);
        return !isNaN(numValue) && !isNaN(numCondition);

      default:
        return false;
    }
  } catch {
    return false;
  }
}

/**
 * Get nested value from object using dot notation
 */
function getNestedValue(obj: unknown, path: string): unknown {
  if (!obj || typeof obj !== 'object') {
    return undefined;
  }

  const parts = path.split('.');
  let current: unknown = obj;

  for (const part of parts) {
    if (current === undefined || current === null) {
      return undefined;
    }
    if (typeof current !== 'object') {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }

  return current;
}

/**
 * Calculate overall confidence based on pattern complexity
 */
export function calculatePatternConfidence(
  patterns: Pattern[],
  matchedPattern?: string
): number {
  if (!matchedPattern || patterns.length === 0) {
    return 0;
  }

  // More patterns = more confidence in the match
  const baseConfidence = 85;
  const patternBonus = Math.min(patterns.length * 2, 15);

  return Math.min(baseConfidence + patternBonus, 100);
}
