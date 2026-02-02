/**
 * Tool Catalog
 *
 * Manages and categorizes available tools based on workspace policies.
 * Tools are classified into categories that determine their approval requirements.
 */

import type { WorkspacePolicies } from './types';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Tool categorization for approval requirements
 */
export type ToolCategory = 'immediate' | 'requires_approval' | 'forbidden';

/**
 * A tool definition with metadata
 */
export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  category?: string; // semantic category (e.g., 'database', 'notification', 'payment')
  dangerLevel?: 'safe' | 'moderate' | 'dangerous';
  capabilities?: string[]; // what the tool can do (e.g., ['read', 'write', 'delete'])
}

/**
 * Tool catalog with categorized tools
 */
export interface ToolCatalog {
  /** Tools that can be used immediately without approval */
  immediate: ToolDefinition[];
  /** Tools that require user approval before execution */
  requiresApproval: ToolDefinition[];
  /** Tools that are forbidden and cannot be used */
  forbidden: string[];
  /** All available tools (for display purposes) */
  all: ToolDefinition[];
}

/**
 * Context for building a tool catalog
 */
export interface ToolCatalogContext {
  /** All tools available in the workspace */
  availableTools: ToolDefinition[];
  /** Workspace policies for tool governance */
  policies: WorkspacePolicies | null;
  /** The goal/purpose of the BaleyBot being created (for AI inference) */
  baleybotGoal?: string;
}

// ============================================================================
// DEFAULT DANGEROUS TOOLS
// ============================================================================

/**
 * Tools that are considered dangerous by default and should require approval
 */
const DEFAULT_DANGEROUS_TOOLS = [
  // Destructive database operations
  'delete_records',
  'drop_table',
  'truncate_table',
  'execute_sql', // arbitrary SQL execution
  // Financial operations
  'process_payment',
  'issue_refund',
  'transfer_funds',
  'update_billing',
  // Communication
  'send_email',
  'send_sms',
  'push_notification',
  'post_to_social',
  // External integrations
  'webhook_call',
  'external_api_call',
  // System operations
  'execute_command',
  'modify_config',
  'restart_service',
];

/**
 * Tools that are always forbidden (security risks)
 */
const ALWAYS_FORBIDDEN_TOOLS = [
  'execute_arbitrary_code',
  'system_shell',
  'file_delete',
  'credential_access',
];

// ============================================================================
// CATALOG BUILDER
// ============================================================================

/**
 * Build a tool catalog based on workspace policies and available tools.
 *
 * The categorization follows this priority:
 * 1. Explicitly forbidden tools (from policies) → forbidden
 * 2. Always forbidden tools (security risks) → forbidden
 * 3. Explicitly allowed tools (from policies) → immediate
 * 4. Explicitly requires-approval tools (from policies) → requires_approval
 * 5. Default dangerous tools → requires_approval
 * 6. Everything else → immediate
 */
export function buildToolCatalog(ctx: ToolCatalogContext): ToolCatalog {
  const { availableTools, policies } = ctx;

  // Build sets from policies
  const policyAllowed = new Set(policies?.allowedTools ?? []);
  const policyForbidden = new Set(policies?.forbiddenTools ?? []);
  const policyRequiresApproval = new Set(policies?.requiresApprovalTools ?? []);
  const alwaysForbidden = new Set(ALWAYS_FORBIDDEN_TOOLS);
  const defaultDangerous = new Set(DEFAULT_DANGEROUS_TOOLS);

  const immediate: ToolDefinition[] = [];
  const requiresApproval: ToolDefinition[] = [];
  const forbidden: string[] = [];

  for (const tool of availableTools) {
    const toolName = tool.name.toLowerCase();

    // Priority 1: Always forbidden
    if (alwaysForbidden.has(toolName)) {
      forbidden.push(tool.name);
      continue;
    }

    // Priority 2: Policy forbidden
    if (policyForbidden.has(toolName) || policyForbidden.has(tool.name)) {
      forbidden.push(tool.name);
      continue;
    }

    // Priority 3: Policy requires approval
    if (policyRequiresApproval.has(toolName) || policyRequiresApproval.has(tool.name)) {
      requiresApproval.push(tool);
      continue;
    }

    // Priority 4: Default dangerous tools require approval
    if (defaultDangerous.has(toolName) && !policyAllowed.has(toolName)) {
      requiresApproval.push(tool);
      continue;
    }

    // Priority 5: Tool marked as dangerous
    if (tool.dangerLevel === 'dangerous' && !policyAllowed.has(toolName)) {
      requiresApproval.push(tool);
      continue;
    }

    // Default: immediate access
    immediate.push(tool);
  }

  return {
    immediate,
    requiresApproval,
    forbidden,
    all: availableTools,
  };
}

/**
 * Categorize a single tool based on workspace policies
 */
export function categorizeToolName(
  toolName: string,
  policies: WorkspacePolicies | null
): ToolCategory {
  const lowerName = toolName.toLowerCase();

  // Always forbidden
  if (ALWAYS_FORBIDDEN_TOOLS.includes(lowerName)) {
    return 'forbidden';
  }

  // Policy forbidden
  if (policies?.forbiddenTools?.includes(lowerName) ||
      policies?.forbiddenTools?.includes(toolName)) {
    return 'forbidden';
  }

  // Policy requires approval
  if (policies?.requiresApprovalTools?.includes(lowerName) ||
      policies?.requiresApprovalTools?.includes(toolName)) {
    return 'requires_approval';
  }

  // Policy explicitly allowed (overrides default dangerous)
  if (policies?.allowedTools?.includes(lowerName) ||
      policies?.allowedTools?.includes(toolName)) {
    return 'immediate';
  }

  // Default dangerous
  if (DEFAULT_DANGEROUS_TOOLS.includes(lowerName)) {
    return 'requires_approval';
  }

  return 'immediate';
}

/**
 * Format tool catalog as a string for AI context
 */
export function formatToolCatalogForAI(catalog: ToolCatalog): string {
  const lines: string[] = [];

  lines.push('# Available Tools');
  lines.push('');

  if (catalog.immediate.length > 0) {
    lines.push('## Immediate Access (can be used directly)');
    for (const tool of catalog.immediate) {
      lines.push(`- **${tool.name}**: ${tool.description}`);
    }
    lines.push('');
  }

  if (catalog.requiresApproval.length > 0) {
    lines.push('## Requires Approval (use can_request)');
    lines.push('These tools need user approval before execution.');
    for (const tool of catalog.requiresApproval) {
      lines.push(`- **${tool.name}**: ${tool.description}`);
    }
    lines.push('');
  }

  if (catalog.forbidden.length > 0) {
    lines.push('## Forbidden (do not use)');
    lines.push('These tools are not available for this BaleyBot.');
    for (const name of catalog.forbidden) {
      lines.push(`- ${name}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Get tool assignment rationale based on category
 */
export function getToolAssignmentRationale(
  toolName: string,
  category: ToolCategory,
  policies: WorkspacePolicies | null
): string {
  const lowerName = toolName.toLowerCase();

  if (category === 'forbidden') {
    if (ALWAYS_FORBIDDEN_TOOLS.includes(lowerName)) {
      return 'This tool is always forbidden due to security risks.';
    }
    if (policies?.forbiddenTools?.includes(lowerName)) {
      return 'This tool is forbidden by workspace policy.';
    }
    return 'This tool is forbidden.';
  }

  if (category === 'requires_approval') {
    if (policies?.requiresApprovalTools?.includes(lowerName)) {
      return 'Workspace policy requires approval for this tool.';
    }
    if (DEFAULT_DANGEROUS_TOOLS.includes(lowerName)) {
      return 'This tool can modify data or has external effects, requiring user approval.';
    }
    return 'This tool requires approval before use.';
  }

  if (policies?.allowedTools?.includes(lowerName)) {
    return 'Explicitly allowed by workspace policy.';
  }

  return 'Safe for immediate use.';
}
