/**
 * Pattern Learner Service
 *
 * AI-powered service that helps users create and refine approval patterns.
 * Analyzes tool usage to suggest patterns and helps generalize specific approvals.
 * Uses the internal pattern_learner BaleyBot.
 */

import { z } from 'zod';
import { executeInternalBaleybot } from './internal-baleybots';
import type {
  ApprovalRequest,
  ApprovalPattern,
  TrustLevel,
  WorkspacePolicies,
} from './types';

// ============================================================================
// SCHEMAS
// ============================================================================

/**
 * Schema for pattern suggestions
 */
const patternSuggestionSchema = z.object({
  tool: z.string().describe('The tool name for this pattern'),
  actionPattern: z
    .record(z.string(), z.unknown())
    .describe('The action pattern with wildcards or constraints'),
  entityGoalPattern: z
    .string()
    .nullable()
    .describe('Optional regex pattern for entity goals'),
  trustLevel: z
    .enum(['provisional', 'trusted', 'permanent'])
    .describe('Suggested trust level'),
  explanation: z
    .string()
    .describe('Why this pattern is appropriate'),
  riskAssessment: z
    .enum(['low', 'medium', 'high'])
    .describe('Risk level of auto-approving this pattern'),
  suggestedExpirationDays: z
    .number()
    .nullable()
    .describe('Suggested expiration in days, null for no expiration'),
});

const learnPatternResultSchema = z.object({
  suggestions: z.array(patternSuggestionSchema),
  warnings: z.array(z.string()),
  recommendations: z.array(z.string()),
});

// ============================================================================
// TYPES
// ============================================================================

export interface PatternSuggestion {
  tool: string;
  actionPattern: Record<string, unknown>;
  entityGoalPattern: string | null;
  trustLevel: TrustLevel;
  explanation: string;
  riskAssessment: 'low' | 'medium' | 'high';
  suggestedExpirationDays: number | null;
}

export interface LearnPatternResult {
  suggestions: PatternSuggestion[];
  warnings: string[];
  recommendations: string[];
}

export interface LearnerContext {
  workspaceId: string;
  existingPatterns: ApprovalPattern[];
  policies: WorkspacePolicies | null;
  learningManual?: string;
}

// ============================================================================
// CONTEXT BUILDING
// ============================================================================

function buildLearnerContext(ctx: LearnerContext): string {
  const lines: string[] = [];

  // Add workspace policies context
  if (ctx.policies) {
    lines.push('## Workspace Policies');
    if (ctx.policies.maxAutoApproveAmount !== null) {
      lines.push(`- Max auto-approve amount: $${ctx.policies.maxAutoApproveAmount}`);
    }
    if (ctx.policies.reapprovalIntervalDays) {
      lines.push(`- Pattern reapproval interval: ${ctx.policies.reapprovalIntervalDays} days`);
    }
    if (ctx.policies.maxAutoFiresBeforeReview) {
      lines.push(`- Max auto-fires before review: ${ctx.policies.maxAutoFiresBeforeReview}`);
    }
    if (ctx.policies.requiresApprovalTools?.length) {
      lines.push(`- Tools requiring approval: ${ctx.policies.requiresApprovalTools.join(', ')}`);
    }
  }

  // Add learning manual if provided
  if (ctx.learningManual) {
    lines.push('');
    lines.push('## Workspace-Specific Guidelines');
    lines.push(ctx.learningManual);
  }

  // Add existing patterns context
  if (ctx.existingPatterns.length > 0) {
    lines.push('');
    lines.push(`## Existing Patterns`);
    lines.push(`There are ${ctx.existingPatterns.length} existing patterns. Avoid suggesting duplicates.`);
  }

  return lines.join('\n');
}

// ============================================================================
// PATTERN LEARNER FUNCTIONS
// ============================================================================

/**
 * Analyze a tool request and suggest patterns.
 * Executes via the internal pattern_learner BaleyBot.
 */
export async function proposePattern(
  request: ApprovalRequest,
  ctx: LearnerContext
): Promise<LearnPatternResult> {
  const context = buildLearnerContext(ctx);

  const input = `A user has approved the following tool call and wants to "Approve & Remember" it.
Please analyze and suggest pattern(s) for auto-approving similar requests in the future.

## Tool Call Details

**Tool**: ${request.tool}
**Entity**: ${request.entityName}
**Entity Goal**: ${request.entityGoal}
**Reason Given**: ${request.reason}

**Arguments**:
\`\`\`json
${JSON.stringify(request.arguments, null, 2)}
\`\`\`

## Your Task

1. Analyze the request for potential patterns
2. Consider what should be constrained vs wildcarded
3. Assess the risk level
4. Suggest appropriate trust level and expiration
5. Provide clear explanations

Remember to be conservative - it's better to require approval than to auto-approve something dangerous.`;

  const { output } = await executeInternalBaleybot('pattern_learner', input, {
    userWorkspaceId: ctx.workspaceId,
    context,
    triggeredBy: 'internal',
  });

  return learnPatternResultSchema.parse(output);
}

/**
 * Analyze multiple historical requests to find patterns
 */
export async function analyzeRequestHistory(
  requests: ApprovalRequest[],
  ctx: LearnerContext
): Promise<LearnPatternResult> {
  if (requests.length === 0) {
    return { suggestions: [], warnings: [], recommendations: [] };
  }

  const context = buildLearnerContext(ctx);

  const requestSummaries = requests.map((r, i) => `
### Request ${i + 1}
- Tool: ${r.tool}
- Entity: ${r.entityName}
- Goal: ${r.entityGoal}
- Arguments: ${JSON.stringify(r.arguments)}
`).join('\n');

  const input = `Analyze these ${requests.length} approved tool calls to identify patterns.

${requestSummaries}

## Your Task

1. Find common patterns across the requests
2. Suggest generalized patterns that would cover multiple requests
3. Be conservative with generalizations
4. Consider whether patterns should be combined or kept separate`;

  const { output } = await executeInternalBaleybot('pattern_learner', input, {
    userWorkspaceId: ctx.workspaceId,
    context,
    triggeredBy: 'internal',
  });

  return learnPatternResultSchema.parse(output);
}

/**
 * Suggest how to generalize an existing pattern
 */
export async function suggestGeneralization(
  pattern: ApprovalPattern,
  recentMatches: ApprovalRequest[],
  ctx: LearnerContext
): Promise<{
  currentPattern: Record<string, unknown>;
  suggestedPattern: Record<string, unknown>;
  explanation: string;
  riskChange: 'increased' | 'same' | 'decreased';
}> {
  const context = buildLearnerContext(ctx);

  const matchSummaries = recentMatches.map((r, i) => `
### Match ${i + 1}
- Arguments: ${JSON.stringify(r.arguments)}
- Entity Goal: ${r.entityGoal}
`).join('\n');

  const input = `An existing pattern has been used ${pattern.timesUsed} times. Suggest if it should be generalized.

## Current Pattern

- Tool: ${pattern.tool}
- Action Pattern: ${JSON.stringify(pattern.actionPattern)}
- Entity Goal Pattern: ${pattern.entityGoalPattern || '(none)'}
- Trust Level: ${pattern.trustLevel}

## Recent Matches

${matchSummaries || '(No recent match data available)'}

## Your Task

Compare the current pattern with actual usage and suggest whether/how to generalize it.
Consider:
1. Are there fields that vary but shouldn't affect approval?
2. Could numeric constraints be relaxed safely?
3. Would generalization significantly increase risk?`;

  const { output } = await executeInternalBaleybot('pattern_learner', input, {
    userWorkspaceId: ctx.workspaceId,
    context,
    triggeredBy: 'internal',
  });

  // Extract the first suggestion as the generalization
  const typedResult = learnPatternResultSchema.parse(output);
  if (typedResult.suggestions.length > 0) {
    const suggestion = typedResult.suggestions[0];
    if (!suggestion) {
      return {
        currentPattern: pattern.actionPattern as Record<string, unknown>,
        suggestedPattern: pattern.actionPattern as Record<string, unknown>,
        explanation: 'No generalization suggested',
        riskChange: 'same',
      };
    }

    return {
      currentPattern: pattern.actionPattern as Record<string, unknown>,
      suggestedPattern: suggestion.actionPattern,
      explanation: suggestion.explanation,
      riskChange:
        suggestion.riskAssessment === 'high'
          ? 'increased'
          : suggestion.riskAssessment === 'low'
            ? 'decreased'
            : 'same',
    };
  }

  return {
    currentPattern: pattern.actionPattern as Record<string, unknown>,
    suggestedPattern: pattern.actionPattern as Record<string, unknown>,
    explanation: 'No generalization suggested',
    riskChange: 'same',
  };
}

/**
 * Validate a proposed pattern for safety
 */
export async function validatePattern(
  pattern: Omit<ApprovalPattern, 'id' | 'workspaceId' | 'timesUsed' | 'createdAt'>,
  ctx: LearnerContext
): Promise<{
  isValid: boolean;
  risks: string[];
  suggestions: string[];
}> {
  const context = buildLearnerContext(ctx);

  const input = `Validate this proposed approval pattern for safety.

## Pattern

- Tool: ${pattern.tool}
- Action Pattern: ${JSON.stringify(pattern.actionPattern)}
- Entity Goal Pattern: ${pattern.entityGoalPattern || '(none)'}
- Trust Level: ${pattern.trustLevel}
- Expires: ${pattern.expiresAt ? pattern.expiresAt.toISOString() : '(never)'}

## Your Task

1. Identify any risks with this pattern
2. Check if it's too broad or permissive
3. Suggest improvements if needed
4. Determine if it should be allowed`;

  const { output } = await executeInternalBaleybot('pattern_learner', input, {
    userWorkspaceId: ctx.workspaceId,
    context,
    triggeredBy: 'internal',
  });

  const typedResult = learnPatternResultSchema.parse(output);

  return {
    isValid: typedResult.warnings.length === 0,
    risks: typedResult.warnings,
    suggestions: typedResult.recommendations,
  };
}

/**
 * Generate a human-readable description of a pattern
 */
export function describePattern(pattern: ApprovalPattern): string {
  const parts: string[] = [];

  parts.push(`Tool: ${pattern.tool}`);

  const actionPattern = pattern.actionPattern as Record<string, unknown>;
  if (Object.keys(actionPattern).length > 0) {
    const constraints = Object.entries(actionPattern)
      .map(([key, value]) => {
        if (value === '*') return `${key} (any)`;
        if (typeof value === 'string' && value.startsWith('<='))
          return `${key} ≤ ${value.slice(2)}`;
        if (typeof value === 'string' && value.startsWith('>='))
          return `${key} ≥ ${value.slice(2)}`;
        return `${key} = ${JSON.stringify(value)}`;
      })
      .join(', ');
    parts.push(`When: ${constraints}`);
  }

  if (pattern.entityGoalPattern) {
    parts.push(`For entities matching: ${pattern.entityGoalPattern}`);
  }

  parts.push(`Trust: ${pattern.trustLevel}`);

  if (pattern.expiresAt) {
    parts.push(`Expires: ${pattern.expiresAt.toLocaleDateString()}`);
  }

  return parts.join('\n');
}
