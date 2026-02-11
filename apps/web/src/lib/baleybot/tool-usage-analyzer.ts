import { parseBalCode } from './bal-parser-pure';

/**
 * Extract all tool names referenced in BAL code.
 */
export function getToolNamesFromBal(balCode: string): Set<string> {
  try {
    const parsed = parseBalCode(balCode);
    const tools = new Set<string>();
    for (const entity of parsed.entities) {
      const entityTools = entity.config.tools;
      if (Array.isArray(entityTools)) {
        for (const t of entityTools) {
          if (typeof t === 'string') tools.add(t);
        }
      }
    }
    return tools;
  } catch {
    return new Set();
  }
}

/**
 * Count how many BaleyBots use a given tool.
 */
export function countBotsUsingTool(
  bots: Array<{ balCode: string; id: string; name: string }>,
  toolName: string
): { count: number; bots: Array<{ id: string; name: string }> } {
  const matching = bots.filter((bot) => getToolNamesFromBal(bot.balCode).has(toolName));
  return {
    count: matching.length,
    bots: matching.map((b) => ({ id: b.id, name: b.name })),
  };
}

/**
 * Build a complete usage map: toolName -> { count, bots }.
 */
export function buildToolUsageMap(
  bots: Array<{ balCode: string; id: string; name: string }>
): Record<string, { count: number; bots: Array<{ id: string; name: string }> }> {
  const usageMap: Record<string, { count: number; bots: Array<{ id: string; name: string }> }> = {};

  for (const bot of bots) {
    const toolNames = getToolNamesFromBal(bot.balCode);
    for (const name of toolNames) {
      if (!usageMap[name]) usageMap[name] = { count: 0, bots: [] };
      usageMap[name].count++;
      usageMap[name].bots.push({ id: bot.id, name: bot.name });
    }
  }

  return usageMap;
}
