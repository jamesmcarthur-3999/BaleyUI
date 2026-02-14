/**
 * Companion (Baley) Injected Runtime Tools
 *
 * Orchestrates all domain-specific tool builders for the Baley companion assistant.
 * These tools are injected at runtime via executeInternalBaleybot(..., { injectedTools }).
 */

import type { RuntimeToolDefinition } from '../../executor';
import { buildConnectionTools } from './connections';
import { buildToolTools } from './tools';
import { buildApiKeyTools } from './api-keys';
import { buildBaleybotTools } from './baleybots';
import { buildAnalyticsTools } from './analytics';
import { buildWorkspaceTools } from './workspace';
import { buildApprovalTools } from './approvals';
import { buildNavigationTools } from './navigation';
import { buildIntelligenceTools } from './intelligence';
import { buildActionTools } from './actions';
import { buildUIControlTools } from './ui-control';

export interface CompanionToolContext {
  workspaceId: string;
  userId: string;
}

/**
 * Build all injected runtime tools for the Baley companion.
 * Each domain module returns a Map of tool definitions.
 */
export function buildCompanionTools(
  ctx: CompanionToolContext
): Map<string, RuntimeToolDefinition> {
  const allTools = new Map<string, RuntimeToolDefinition>();

  const domainBuilders = [
    buildNavigationTools,
    buildConnectionTools,
    buildToolTools,
    buildApiKeyTools,
    buildBaleybotTools,
    buildAnalyticsTools,
    buildWorkspaceTools,
    buildApprovalTools,
    buildIntelligenceTools,
    buildActionTools,
    buildUIControlTools,
  ];

  for (const builder of domainBuilders) {
    const tools = builder(ctx);
    for (const [name, tool] of tools) {
      allTools.set(name, tool);
    }
  }

  return allTools;
}
