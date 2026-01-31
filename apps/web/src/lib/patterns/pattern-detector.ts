/**
 * Pattern detector for BaleyUI.
 * Detects specific types of patterns from decision data.
 */

import { DetectedPattern, ConditionAst } from './types';
import { randomUUID } from 'crypto';

interface Decision {
  id: string;
  input: unknown;
  output: unknown;
}

/**
 * Detect threshold patterns: IF field > X → output
 */
export function detectThresholdPatterns(
  decisions: Decision[],
  outputValue: unknown
): DetectedPattern[] {
  const patterns: DetectedPattern[] = [];
  const matchingDecisions = decisions.filter((d) => d.output === outputValue);

  if (matchingDecisions.length === 0) return patterns;

  // Get numeric fields from inputs
  const numericFields = getNumericFields(matchingDecisions);

  for (const field of numericFields) {
    // Try to find a threshold
    const values = matchingDecisions
      .map((d) => getNestedValue(d.input, field))
      .filter((v): v is number => typeof v === 'number')
      .sort((a, b) => a - b);

    if (values.length === 0) continue;

    // Try different threshold values (min, max, median)
    const thresholds = [
      { operator: '>' as const, value: Math.min(...values) },
      { operator: '<' as const, value: Math.max(...values) },
      { operator: '>=' as const, value: Math.min(...values) },
      { operator: '<=' as const, value: Math.max(...values) },
    ];

    for (const { operator, value } of thresholds) {
      const matches = decisions.filter((d) => {
        const fieldValue = getNestedValue(d.input, field);
        if (typeof fieldValue !== 'number') return false;

        switch (operator) {
          case '>':
            return fieldValue > value && d.output === outputValue;
          case '<':
            return fieldValue < value && d.output === outputValue;
          case '>=':
            return fieldValue >= value && d.output === outputValue;
          case '<=':
            return fieldValue <= value && d.output === outputValue;
          default:
            return false;
        }
      });

      const confidence = (matches.length / decisions.length) * 100;

      // Only include patterns with reasonable confidence
      if (confidence >= 50 && matches.length >= 2) {
        const conditionAst: ConditionAst = {
          type: 'threshold',
          field,
          operator,
          value,
        };

        patterns.push({
          id: randomUUID(),
          type: 'threshold',
          condition: `IF ${field} ${operator} ${value} → ${JSON.stringify(outputValue)}`,
          conditionAst,
          outputValue,
          confidence,
          supportCount: matches.length,
          samples: matches.slice(0, 3).map((d) => ({
            input: d.input,
            output: d.output,
            decisionId: d.id,
          })),
        });
      }
    }
  }

  return patterns;
}

/**
 * Detect set membership patterns: IF field IN [list] → output
 */
export function detectSetMembershipPatterns(
  decisions: Decision[],
  outputValue: unknown
): DetectedPattern[] {
  const patterns: DetectedPattern[] = [];
  const matchingDecisions = decisions.filter((d) => d.output === outputValue);

  if (matchingDecisions.length === 0) return patterns;

  // Get categorical fields
  const categoricalFields = getCategoricalFields(matchingDecisions);

  for (const field of categoricalFields) {
    // Get unique values for this field in matching decisions
    const values = Array.from(
      new Set(
        matchingDecisions
          .map((d) => getNestedValue(d.input, field))
          .filter((v) => v !== undefined && v !== null)
      )
    );

    if (values.length === 0 || values.length > 10) continue; // Skip if too many values

    // Check how many decisions match this pattern
    const matches = decisions.filter((d) => {
      const fieldValue = getNestedValue(d.input, field);
      return (values as unknown[]).includes(fieldValue) && d.output === outputValue;
    });

    const confidence = (matches.length / decisions.length) * 100;

    if (confidence >= 50 && matches.length >= 2) {
      const conditionAst: ConditionAst = {
        type: 'set_membership',
        field,
        values,
      };

      patterns.push({
        id: randomUUID(),
        type: 'set_membership',
        condition: `IF ${field} IN [${values.map((v) => JSON.stringify(v)).join(', ')}] → ${JSON.stringify(outputValue)}`,
        conditionAst,
        outputValue,
        confidence,
        supportCount: matches.length,
        samples: matches.slice(0, 3).map((d) => ({
          input: d.input,
          output: d.output,
          decisionId: d.id,
        })),
      });
    }
  }

  return patterns;
}

/**
 * Detect exact match patterns: IF field == value → output
 */
export function detectExactMatchPatterns(
  decisions: Decision[],
  outputValue: unknown
): DetectedPattern[] {
  const patterns: DetectedPattern[] = [];
  const matchingDecisions = decisions.filter((d) => d.output === outputValue);

  if (matchingDecisions.length === 0) return patterns;

  const fields = getAllFields(matchingDecisions);

  for (const field of fields) {
    // Group by exact value
    const valueGroups = new Map<unknown, Decision[]>();

    for (const decision of matchingDecisions) {
      const value = getNestedValue(decision.input, field);
      const key = JSON.stringify(value);

      if (!valueGroups.has(key)) {
        valueGroups.set(key, []);
      }
      valueGroups.get(key)!.push(decision);
    }

    // Create patterns for values that appear frequently
    for (const [key, matches] of valueGroups) {
      if (matches.length < 2) continue;

      const value: unknown = JSON.parse(key as string);
      const confidence = (matches.length / decisions.length) * 100;

      if (confidence >= 50) {
        const conditionAst: ConditionAst = {
          type: 'exact_match',
          field,
          value,
        };

        patterns.push({
          id: randomUUID(),
          type: 'exact_match',
          condition: `IF ${field} == ${JSON.stringify(value)} → ${JSON.stringify(outputValue)}`,
          conditionAst,
          outputValue,
          confidence,
          supportCount: matches.length,
          samples: matches.slice(0, 3).map((d) => ({
            input: d.input,
            output: d.output,
            decisionId: d.id,
          })),
        });
      }
    }
  }

  return patterns;
}

/**
 * Detect compound patterns: IF A AND B → output
 */
export function detectCompoundPatterns(
  decisions: Decision[],
  outputValue: unknown
): DetectedPattern[] {
  // Simplified compound pattern detection
  // In a real implementation, this would try combinations of conditions
  const patterns: DetectedPattern[] = [];
  const matchingDecisions = decisions.filter((d) => d.output === outputValue);

  if (matchingDecisions.length < 3) return patterns;

  // For now, we'll skip complex compound patterns
  // This would require more sophisticated analysis
  return patterns;
}

/**
 * Helper: Get numeric fields from decisions
 */
function getNumericFields(decisions: Decision[]): string[] {
  const fields = new Set<string>();

  for (const decision of decisions) {
    const inputFields = flattenObject(decision.input);
    for (const [key, value] of Object.entries(inputFields)) {
      if (typeof value === 'number') {
        fields.add(key);
      }
    }
  }

  return Array.from(fields);
}

/**
 * Helper: Get categorical fields from decisions
 */
function getCategoricalFields(decisions: Decision[]): string[] {
  const fields = new Set<string>();

  for (const decision of decisions) {
    const inputFields = flattenObject(decision.input);
    for (const [key, value] of Object.entries(inputFields)) {
      if (typeof value === 'string' || typeof value === 'boolean') {
        fields.add(key);
      }
    }
  }

  return Array.from(fields);
}

/**
 * Helper: Get all fields from decisions
 */
function getAllFields(decisions: Decision[]): string[] {
  const fields = new Set<string>();

  for (const decision of decisions) {
    const inputFields = flattenObject(decision.input);
    for (const key of Object.keys(inputFields)) {
      fields.add(key);
    }
  }

  return Array.from(fields);
}

/**
 * Helper: Flatten nested object to dot notation
 */
function flattenObject(obj: unknown, prefix = ''): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  if (!obj || typeof obj !== 'object') {
    return result;
  }

  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;

    if (value && typeof value === 'object' && !Array.isArray(value)) {
      Object.assign(result, flattenObject(value, fullKey));
    } else {
      result[fullKey] = value;
    }
  }

  return result;
}

/**
 * Helper: Get nested value from object using dot notation
 */
function getNestedValue(obj: unknown, path: string): unknown {
  if (!obj || typeof obj !== 'object') return undefined;

  const parts = path.split('.');
  let current: any = obj;

  for (const part of parts) {
    if (current && typeof current === 'object' && part in current) {
      current = current[part];
    } else {
      return undefined;
    }
  }

  return current;
}
