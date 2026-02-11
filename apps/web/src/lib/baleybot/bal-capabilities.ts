// apps/web/src/lib/baleybot/bal-capabilities.ts
// Stub: full implementation pending (used by build/supervisor.ts)

export interface LegacyBalAlias {
  alias: string;
  replacement: string;
  reason: string;
}

/**
 * Detect deprecated/legacy BAL syntax and suggest modern equivalents.
 * Currently returns an empty array (no legacy aliases defined yet).
 */
export function detectLegacyBalAliases(_balCode: string): LegacyBalAlias[] {
  return [];
}
