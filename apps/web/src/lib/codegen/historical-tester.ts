/**
 * Historical tester for validating generated code against past decisions.
 */

import type { Database } from '@baleyui/db';
import { HistoricalTestResult } from './types';
import { evaluateSafeExpression, isSafeExpression } from '../utils/safe-eval';

/**
 * Test generated code against historical decisions.
 */
export async function testGeneratedCode(
  blockId: string,
  generatedCode: string,
  db: Database
): Promise<HistoricalTestResult> {
  // Import decisions table
  const { decisions, blocks, eq, and } = await import('@baleyui/db');

  // Fetch historical decisions for this block
  const historicalDecisions = await db
    .select({
      id: decisions.id,
      input: decisions.input,
      output: decisions.output,
    })
    .from(decisions)
    .innerJoin(blocks, eq(decisions.blockId, blocks.id))
    .where(eq(decisions.blockId, blockId))
    .orderBy(decisions.createdAt)
    .limit(1000); // Test against up to 1000 recent decisions

  if (historicalDecisions.length === 0) {
    return {
      accuracy: 0,
      totalTested: 0,
      correctCount: 0,
      mismatches: [],
    };
  }

  // Create a sandboxed function from the generated code
  const testFunction = createTestFunction(generatedCode);

  const mismatches: HistoricalTestResult['mismatches'] = [];
  let correctCount = 0;

  // Test each historical decision
  for (const decision of historicalDecisions) {
    try {
      const actualOutput = testFunction(decision.input);
      const expectedOutput = decision.output;

      // Compare outputs (deep equality)
      if (areOutputsEqual(actualOutput, expectedOutput)) {
        correctCount++;
      } else {
        // Only track mismatches where the generated code returned a value
        // (null means fallback to AI, which is acceptable)
        if (actualOutput !== null) {
          mismatches.push({
            decisionId: decision.id,
            input: decision.input,
            expectedOutput,
            actualOutput,
          });
        }
      }
    } catch (error) {
      // If execution fails, count as mismatch
      mismatches.push({
        decisionId: decision.id,
        input: decision.input,
        expectedOutput: decision.output,
        actualOutput: { error: (error as Error).message },
      });
    }
  }

  const totalTested = historicalDecisions.length;
  const accuracy = totalTested > 0 ? (correctCount / totalTested) * 100 : 0;

  return {
    accuracy: Math.round(accuracy * 100) / 100, // Round to 2 decimal places
    totalTested,
    correctCount,
    mismatches: mismatches.slice(0, 50), // Return first 50 mismatches
  };
}

/**
 * Create a test function from generated code.
 *
 * This function parses simple generated code patterns and creates a safe evaluator.
 * For complex generated code, consider using a proper sandboxed runtime.
 */
function createTestFunction(generatedCode: string): (input: unknown) => unknown {
  // Extract the processFn from the generated code
  const processFnMatch = generatedCode.match(/processFn:\s*\((input:[^)]*)\)\s*=>\s*{([\s\S]*?)},\s*schema:/);

  if (!processFnMatch || !processFnMatch[2]) {
    throw new Error('Could not extract processFn from generated code');
  }

  const functionBody = processFnMatch[2].trim();

  // Parse simple return statements that we can safely evaluate
  // Supports patterns like: return input.field; return input.field === value;
  const returnMatch = functionBody.match(/^\s*return\s+(.+?);?\s*$/);

  if (!returnMatch || !returnMatch[1]) {
    throw new Error('Generated code must be a simple return statement for safe evaluation');
  }

  const expression = returnMatch[1].trim();

  // Validate the expression is safe
  if (!isSafeExpression(expression)) {
    throw new Error(`Generated code contains unsafe expression: ${expression}`);
  }

  // Return a function that safely evaluates the expression
  return (input: unknown): unknown => {
    try {
      return evaluateSafeExpression(expression, { input });
    } catch (error) {
      throw new Error(`Failed to evaluate expression: ${(error as Error).message}`);
    }
  };
}

/**
 * Deep equality comparison for outputs.
 */
function areOutputsEqual(a: unknown, b: unknown): boolean {
  // Handle null/undefined
  if (a === null && b === null) return true;
  if (a === undefined && b === undefined) return true;
  if (a === null || b === null) return false;
  if (a === undefined || b === undefined) return false;

  // Handle primitives
  if (typeof a !== 'object' || typeof b !== 'object') {
    return a === b;
  }

  // Handle arrays
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((item, index) => areOutputsEqual(item, b[index]));
  }

  if (Array.isArray(a) !== Array.isArray(b)) {
    return false;
  }

  // Handle objects
  const aObj = a as Record<string, unknown>;
  const bObj = b as Record<string, unknown>;

  const aKeys = Object.keys(aObj).sort();
  const bKeys = Object.keys(bObj).sort();

  if (aKeys.length !== bKeys.length) return false;
  if (!aKeys.every((key, i) => key === bKeys[i])) return false;

  return aKeys.every(key => areOutputsEqual(aObj[key], bObj[key]));
}

/**
 * Calculate accuracy metrics for a set of patterns.
 */
export function calculateAccuracyMetrics(testResult: HistoricalTestResult): {
  accuracy: number;
  successRate: number;
  failureRate: number;
  coverage: number;
} {
  const { accuracy, totalTested, correctCount, mismatches } = testResult;

  const successRate = totalTested > 0 ? (correctCount / totalTested) * 100 : 0;
  const failureRate = totalTested > 0 ? ((totalTested - correctCount) / totalTested) * 100 : 0;

  // Coverage is the percentage of cases where the code returned a non-null result
  const nonNullResults = totalTested - mismatches.filter(m => m.actualOutput === null).length;
  const coverage = totalTested > 0 ? (nonNullResults / totalTested) * 100 : 0;

  return {
    accuracy,
    successRate,
    failureRate,
    coverage,
  };
}

/**
 * Get a summary of mismatch types.
 */
export function analyzeMismatches(mismatches: HistoricalTestResult['mismatches']): {
  typeErrors: number;
  valueErrors: number;
  structureErrors: number;
  nullResults: number;
} {
  let typeErrors = 0;
  let valueErrors = 0;
  let structureErrors = 0;
  let nullResults = 0;

  mismatches.forEach(mismatch => {
    if (mismatch.actualOutput === null) {
      nullResults++;
      return;
    }

    const expectedType = typeof mismatch.expectedOutput;
    const actualType = typeof mismatch.actualOutput;

    if (expectedType !== actualType) {
      typeErrors++;
    } else if (Array.isArray(mismatch.expectedOutput) !== Array.isArray(mismatch.actualOutput)) {
      structureErrors++;
    } else if (typeof mismatch.expectedOutput === 'object' && typeof mismatch.actualOutput === 'object') {
      const expectedKeys = Object.keys(mismatch.expectedOutput as object);
      const actualKeys = Object.keys(mismatch.actualOutput as object);
      if (expectedKeys.length !== actualKeys.length) {
        structureErrors++;
      } else {
        valueErrors++;
      }
    } else {
      valueErrors++;
    }
  });

  return {
    typeErrors,
    valueErrors,
    structureErrors,
    nullResults,
  };
}
