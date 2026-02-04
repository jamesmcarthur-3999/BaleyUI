/**
 * Chain Type Compatibility Validator
 *
 * Validates type compatibility between entities in a chain composition.
 * This helps catch potential issues where one entity's output may not
 * match what the next entity expects as input.
 *
 * Note: This is a best-effort validation. BaleyBots accept any input via
 * their goal/prompt, so we generate warnings rather than blocking errors.
 */

import {
  tokenize,
  parse,
  type ProgramNode,
  type EntityDefNode,
  type ExprNode,
  type OutputSchemaNode,
} from '@baleybots/tools';

/**
 * Warning about potential type incompatibility in a chain
 */
export interface ChainWarning {
  /** The entity producing the output */
  producerEntity: string;
  /** The entity consuming the output */
  consumerEntity: string;
  /** Description of the potential issue */
  message: string;
  /** Severity level */
  severity: 'info' | 'warning';
}

/**
 * Result of chain validation
 */
export interface ChainValidationResult {
  /** Whether the chain is valid (warnings don't make it invalid) */
  valid: boolean;
  /** Warnings about potential type mismatches */
  warnings: ChainWarning[];
}

/**
 * Validate type compatibility in a BAL chain composition
 *
 * @param balCode - The BAL code to validate
 * @returns Validation result with any warnings
 */
export function validateChainCompatibility(balCode: string): ChainValidationResult {
  try {
    const tokens = tokenize(balCode);
    const program = parse(tokens, balCode);
    const warnings: ChainWarning[] = [];

    // Process the root expression if it exists
    if (program.root) {
      const rootWarnings = validateExpression(program.root, program.entities);
      warnings.push(...rootWarnings);
    }

    return {
      valid: true,
      warnings,
    };
  } catch {
    // Parse errors are handled elsewhere, just return empty result
    return {
      valid: false,
      warnings: [],
    };
  }
}

/**
 * Recursively validate an expression node
 */
function validateExpression(
  expr: ExprNode,
  entities: Map<string, EntityDefNode>
): ChainWarning[] {
  const warnings: ChainWarning[] = [];

  switch (expr.type) {
    case 'ChainExpr': {
      // Chain expressions pass output from one entity to the next
      const steps = expr.body;
      for (let i = 0; i < steps.length - 1; i++) {
        const producer = steps[i];
        const consumer = steps[i + 1];

        // Get entity names from the steps
        const producerName = getEntityNameFromExpr(producer);
        const consumerName = getEntityNameFromExpr(consumer);

        if (producerName && consumerName) {
          const producerEntity = entities.get(producerName);
          const consumerEntity = entities.get(consumerName);

          if (producerEntity && consumerEntity) {
            // Validate compatibility
            const stepWarnings = validateEntityPair(
              producerName,
              producerEntity,
              consumerName,
              consumerEntity
            );
            warnings.push(...stepWarnings);
          }
        }

        // Recursively validate nested expressions
        if (producer) {
          warnings.push(...validateExpression(producer, entities));
        }
      }

      // Validate the last step
      const lastStep = steps[steps.length - 1];
      if (lastStep) {
        warnings.push(...validateExpression(lastStep, entities));
      }
      break;
    }

    case 'ParallelExpr': {
      // Parallel expressions don't need cross-validation
      // Just validate each branch independently
      for (const branch of expr.body) {
        warnings.push(...validateExpression(branch, entities));
      }
      break;
    }

    case 'IfExpr': {
      // Validate both branches
      warnings.push(...validateExpression(expr.thenBranch, entities));
      if (expr.elseBranch) {
        warnings.push(...validateExpression(expr.elseBranch, entities));
      }
      break;
    }

    case 'LoopExpr': {
      // Validate the loop body
      warnings.push(...validateExpression(expr.body, entities));
      break;
    }

    case 'EntityRef':
    case 'EntityRefWithContext': {
      // Single entity reference, no chain validation needed
      break;
    }

    case 'SelectExpr':
    case 'MergeExpr':
    case 'MapExpr': {
      // These are transformation expressions, validate their body if applicable
      if ('body' in expr && expr.body) {
        warnings.push(...validateExpression(expr.body, entities));
      }
      break;
    }
  }

  return warnings;
}

/**
 * Extract entity name from an expression
 */
function getEntityNameFromExpr(expr: ExprNode | undefined): string | null {
  if (!expr) return null;

  if (expr.type === 'EntityRef') {
    return expr.name;
  }

  if (expr.type === 'EntityRefWithContext') {
    return expr.name;
  }

  // For nested expressions, get the first entity in the chain
  if (expr.type === 'ChainExpr' && expr.body.length > 0) {
    return getEntityNameFromExpr(expr.body[0]);
  }

  if (expr.type === 'ParallelExpr' && expr.body.length > 0) {
    return getEntityNameFromExpr(expr.body[0]);
  }

  return null;
}

/**
 * Validate compatibility between a producer and consumer entity
 */
function validateEntityPair(
  producerName: string,
  producer: EntityDefNode,
  consumerName: string,
  consumer: EntityDefNode
): ChainWarning[] {
  const warnings: ChainWarning[] = [];

  // If producer has no defined output schema, we can't validate
  if (!producer.output || producer.output.fields.length === 0) {
    warnings.push({
      producerEntity: producerName,
      consumerEntity: consumerName,
      message: `'${producerName}' has no output schema defined. Consider adding one for better type safety.`,
      severity: 'info',
    });
    return warnings;
  }

  // Note: BaleyBots don't have explicit input schemas - they receive
  // data through their goal/prompt context. This is an informational
  // validation to help developers understand the data flow.

  // We can provide hints based on the producer's output structure
  const outputFields = producer.output.fields.map((f) => f.name);

  if (outputFields.length > 0) {
    // Check if consumer's goal references any of the output fields
    // This is a heuristic - if the consumer doesn't reference the fields,
    // it might not be using the output effectively
    const consumerGoal = consumer.goal.toLowerCase();
    const unreferencedFields = outputFields.filter(
      (field) => !consumerGoal.includes(field.toLowerCase())
    );

    if (unreferencedFields.length === outputFields.length) {
      // None of the output fields are mentioned in the consumer's goal
      warnings.push({
        producerEntity: producerName,
        consumerEntity: consumerName,
        message: `'${consumerName}' may not be using the output from '${producerName}'. Consider referencing the output fields (${outputFields.join(', ')}) in the goal.`,
        severity: 'info',
      });
    }
  }

  return warnings;
}

/**
 * Format warnings for display
 */
export function formatChainWarnings(warnings: ChainWarning[]): string {
  if (warnings.length === 0) {
    return '';
  }

  const lines = warnings.map((w) => {
    const icon = w.severity === 'warning' ? '⚠️' : 'ℹ️';
    return `${icon} ${w.message}`;
  });

  return lines.join('\n');
}

/**
 * Get a summary of chain validation
 */
export function getChainValidationSummary(result: ChainValidationResult): string {
  if (!result.valid) {
    return 'Chain validation failed (parse error)';
  }

  const warningCount = result.warnings.filter((w) => w.severity === 'warning').length;
  const infoCount = result.warnings.filter((w) => w.severity === 'info').length;

  if (warningCount === 0 && infoCount === 0) {
    return 'Chain validated successfully';
  }

  const parts: string[] = [];
  if (warningCount > 0) {
    parts.push(`${warningCount} warning${warningCount > 1 ? 's' : ''}`);
  }
  if (infoCount > 0) {
    parts.push(`${infoCount} suggestion${infoCount > 1 ? 's' : ''}`);
  }

  return `Chain validated with ${parts.join(' and ')}`;
}
