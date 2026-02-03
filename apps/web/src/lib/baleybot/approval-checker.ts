/**
 * Approval Checker Service
 *
 * Checks if tool calls can be auto-approved based on learned patterns.
 * Implements the pattern matching logic for approval decisions.
 */

import type {
  ApprovalRequest,
  ApprovalCheckResult,
  ApprovalPattern,
  WorkspacePolicies,
  TrustLevel,
} from './types';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Pattern matching result with details
 */
export interface PatternMatchResult {
  matches: boolean;
  patternId?: string;
  trustLevel?: TrustLevel;
  matchDetails?: {
    toolMatch: boolean;
    actionMatch: boolean;
    goalMatch: boolean;
  };
}

/**
 * Context for checking approvals
 */
export interface ApprovalCheckContext {
  workspaceId: string;
  patterns: ApprovalPattern[];
  policies: WorkspacePolicies | null;
}

// ============================================================================
// PATTERN MATCHING
// ============================================================================

/**
 * Check if a value matches a pattern expression
 * Supports: exact match, wildcards (*), comparison operators (<=, >=, <, >, =)
 */
function matchesPatternValue(
  actual: unknown,
  pattern: string | number | boolean | null | undefined
): boolean {
  // Null/undefined patterns match anything
  if (pattern === null || pattern === undefined) {
    return true;
  }

  // Wildcard matches anything
  if (pattern === '*') {
    return true;
  }

  // Handle comparison operators for numbers
  if (typeof pattern === 'string' && typeof actual === 'number') {
    const operators = ['<=', '>=', '<', '>', '='];
    for (const op of operators) {
      if (pattern.startsWith(op)) {
        const threshold = parseFloat(pattern.slice(op.length));
        if (isNaN(threshold)) continue;

        switch (op) {
          case '<=':
            return actual <= threshold;
          case '>=':
            return actual >= threshold;
          case '<':
            return actual < threshold;
          case '>':
            return actual > threshold;
          case '=':
            return actual === threshold;
        }
      }
    }
  }

  // Handle regex patterns for strings (enclosed in /.../)
  if (
    typeof pattern === 'string' &&
    typeof actual === 'string' &&
    pattern.startsWith('/') &&
    pattern.endsWith('/')
  ) {
    try {
      const regex = new RegExp(pattern.slice(1, -1));
      return regex.test(actual);
    } catch {
      // Invalid regex, fall through to exact match
    }
  }

  // Exact match
  return actual === pattern;
}

/**
 * Check if arguments match an action pattern
 */
function matchesActionPattern(
  args: Record<string, unknown>,
  actionPattern: Record<string, unknown>
): boolean {
  // Empty pattern matches anything
  if (Object.keys(actionPattern).length === 0) {
    return true;
  }

  // Check each field in the pattern
  for (const [key, patternValue] of Object.entries(actionPattern)) {
    const actualValue = args[key];

    // Handle nested objects
    if (
      typeof patternValue === 'object' &&
      patternValue !== null &&
      typeof actualValue === 'object' &&
      actualValue !== null
    ) {
      if (
        !matchesActionPattern(
          actualValue as Record<string, unknown>,
          patternValue as Record<string, unknown>
        )
      ) {
        return false;
      }
      continue;
    }

    // Handle primitive values
    if (
      !matchesPatternValue(
        actualValue,
        patternValue as string | number | boolean | null
      )
    ) {
      return false;
    }
  }

  return true;
}

/**
 * Check if an entity goal matches a goal pattern (regex)
 */
function matchesGoalPattern(
  entityGoal: string,
  goalPattern: string | null
): boolean {
  // No goal pattern matches everything
  if (!goalPattern) {
    return true;
  }

  try {
    const regex = new RegExp(goalPattern, 'i');
    return regex.test(entityGoal);
  } catch {
    // Invalid regex, try exact match
    return entityGoal.toLowerCase().includes(goalPattern.toLowerCase());
  }
}

/**
 * Check if a pattern is still valid (not expired, not revoked)
 */
function isPatternValid(pattern: ApprovalPattern): boolean {
  // Check if revoked
  if (pattern.revokedAt !== null) {
    return false;
  }

  // Check if expired
  if (pattern.expiresAt !== null && pattern.expiresAt < new Date()) {
    return false;
  }

  return true;
}

/**
 * Match a request against a single pattern
 */
function matchPattern(
  request: ApprovalRequest,
  pattern: ApprovalPattern
): PatternMatchResult {
  // Check validity first
  if (!isPatternValid(pattern)) {
    return { matches: false };
  }

  // Check tool name
  const toolMatch =
    pattern.tool.toLowerCase() === request.tool.toLowerCase() ||
    pattern.tool === '*';

  // Check action pattern
  const actionMatch = matchesActionPattern(
    request.arguments,
    pattern.actionPattern as Record<string, unknown>
  );

  // Check entity goal pattern
  const goalMatch = matchesGoalPattern(
    request.entityGoal,
    pattern.entityGoalPattern
  );

  const matches = toolMatch && actionMatch && goalMatch;

  return {
    matches,
    patternId: matches ? pattern.id : undefined,
    trustLevel: matches ? pattern.trustLevel : undefined,
    matchDetails: {
      toolMatch,
      actionMatch,
      goalMatch,
    },
  };
}

// ============================================================================
// MAIN CHECKER
// ============================================================================

/**
 * Check if a tool call request can be auto-approved
 */
export function checkApproval(
  request: ApprovalRequest,
  ctx: ApprovalCheckContext
): ApprovalCheckResult {
  // First check workspace policies
  if (ctx.policies) {
    // If tool is forbidden, never approve
    if (ctx.policies.forbiddenTools?.includes(request.tool)) {
      return {
        approved: false,
        needsPrompt: false, // Silently reject, no point prompting
      };
    }

    // If tool explicitly requires approval and no patterns exist
    if (ctx.policies.requiresApprovalTools?.includes(request.tool)) {
      // Continue to check patterns - they can override
    }

    // Check financial limits
    if (ctx.policies.maxAutoApproveAmount !== null) {
      const amount = extractAmount(request.arguments);
      if (amount !== null && amount > ctx.policies.maxAutoApproveAmount) {
        return {
          approved: false,
          needsPrompt: true,
        };
      }
    }
  }

  // Check each pattern for a match
  const sortedPatterns = sortPatternsByPriority(ctx.patterns);

  for (const pattern of sortedPatterns) {
    const result = matchPattern(request, pattern);

    if (result.matches) {
      // Check if pattern has exceeded auto-fire limit
      if (ctx.policies?.maxAutoFiresBeforeReview) {
        if (pattern.timesUsed >= ctx.policies.maxAutoFiresBeforeReview) {
          // Pattern needs review, don't auto-approve
          return {
            approved: false,
            patternId: pattern.id,
            needsPrompt: true,
          };
        }
      }

      return {
        approved: true,
        patternId: pattern.id,
        needsPrompt: false,
      };
    }
  }

  // No matching pattern found
  return {
    approved: false,
    needsPrompt: true,
  };
}

/**
 * Sort patterns by priority (permanent > trusted > provisional)
 */
function sortPatternsByPriority(patterns: ApprovalPattern[]): ApprovalPattern[] {
  const trustOrder: Record<TrustLevel, number> = {
    permanent: 3,
    trusted: 2,
    provisional: 1,
  };

  return [...patterns].sort((a, b) => {
    const aOrder = trustOrder[a.trustLevel] || 0;
    const bOrder = trustOrder[b.trustLevel] || 0;
    return bOrder - aOrder;
  });
}

/**
 * Try to extract an amount from tool arguments (for financial limits)
 */
function extractAmount(args: Record<string, unknown>): number | null {
  // Common field names for amounts
  const amountFields = ['amount', 'value', 'total', 'price', 'cost'];

  for (const field of amountFields) {
    const value = args[field];
    if (typeof value === 'number') {
      return value;
    }
    if (typeof value === 'string') {
      const parsed = parseFloat(value.replace(/[^0-9.-]/g, ''));
      if (!isNaN(parsed)) {
        return parsed;
      }
    }
  }

  // Check nested objects
  for (const value of Object.values(args)) {
    if (typeof value === 'object' && value !== null) {
      const nested = extractAmount(value as Record<string, unknown>);
      if (nested !== null) {
        return nested;
      }
    }
  }

  return null;
}

/**
 * Find all patterns that match a request (for debugging/auditing)
 */
export function findMatchingPatterns(
  request: ApprovalRequest,
  patterns: ApprovalPattern[]
): Array<{ pattern: ApprovalPattern; matchDetails: PatternMatchResult['matchDetails'] }> {
  const matches: Array<{
    pattern: ApprovalPattern;
    matchDetails: PatternMatchResult['matchDetails'];
  }> = [];

  for (const pattern of patterns) {
    const result = matchPattern(request, pattern);
    if (result.matches && result.matchDetails) {
      matches.push({
        pattern,
        matchDetails: result.matchDetails,
      });
    }
  }

  return matches;
}

/**
 * Create an approval pattern from a request (for "Approve & Remember")
 */
export function createPatternFromRequest(
  request: ApprovalRequest,
  options: {
    trustLevel?: TrustLevel;
    expiresInDays?: number;
    specificFields?: string[];
  } = {}
): Omit<ApprovalPattern, 'id' | 'workspaceId' | 'timesUsed' | 'approvedAt' | 'approvedBy' | 'createdAt' | 'expiresAt' | 'revokedAt' | 'revokedBy' | 'revokeReason'> & {
  expiresAt: Date | null;
} {
  const { trustLevel = 'provisional', expiresInDays, specificFields } = options;

  // Build action pattern from arguments
  let actionPattern: Record<string, unknown>;

  if (specificFields && specificFields.length > 0) {
    // Only include specific fields in pattern
    actionPattern = {};
    for (const field of specificFields) {
      if (field in request.arguments) {
        actionPattern[field] = request.arguments[field];
      }
    }
  } else {
    // Include all arguments in pattern (exact match)
    actionPattern = { ...request.arguments };
  }

  // Calculate expiration
  let expiresAt: Date | null = null;
  if (expiresInDays) {
    expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + expiresInDays);
  }

  return {
    tool: request.tool,
    actionPattern,
    entityGoalPattern: null, // Can be set manually for more flexible patterns
    trustLevel,
    expiresAt,
  };
}

/**
 * Generalize a pattern to be less specific (for broader matching)
 */
export function generalizePattern(
  pattern: ApprovalPattern,
  options: {
    removeFields?: string[];
    wildcardFields?: string[];
    maxAmountField?: string;
    maxAmount?: number;
  }
): Record<string, unknown> {
  const actionPattern = { ...(pattern.actionPattern as Record<string, unknown>) };

  // Remove specified fields
  if (options.removeFields) {
    for (const field of options.removeFields) {
      delete actionPattern[field];
    }
  }

  // Convert specified fields to wildcards
  if (options.wildcardFields) {
    for (const field of options.wildcardFields) {
      if (field in actionPattern) {
        actionPattern[field] = '*';
      }
    }
  }

  // Add max amount constraint
  if (options.maxAmountField && options.maxAmount !== undefined) {
    actionPattern[options.maxAmountField] = `<=${options.maxAmount}`;
  }

  return actionPattern;
}
