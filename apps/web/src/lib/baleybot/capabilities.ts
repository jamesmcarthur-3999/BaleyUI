/**
 * Bot Capability Analyzer
 *
 * Deterministic analysis of BAL code to derive bot capabilities.
 * Used by AdaptiveTestSurface to render the right testing interface.
 * No AI calls — pure static analysis from BAL code and metadata.
 */

import { parseBalCode } from './bal-parser-pure';
import type { VisualEntity, Connection } from './creator-types';
import type { TriggerConfig } from './types';

// ============================================================================
// TYPES
// ============================================================================

export type InputMode = 'conversational' | 'structured' | 'file' | 'webhook-payload';
export type OutputMode = 'streaming-text' | 'structured' | 'mixed';
export type Topology = 'single' | 'chain' | 'parallel' | 'complex';

export interface BotCapabilities {
  inputMode: InputMode;
  outputMode: OutputMode;
  outputSchema?: Record<string, string>;
  tools: string[];
  topology: Topology;
  triggerTypes: string[];
  entityCount: number;
}

// ============================================================================
// ANALYZER
// ============================================================================

/**
 * Analyze a BaleyBot's capabilities from its BAL code and metadata.
 * Returns a deterministic capabilities object used to adapt the test surface.
 */
export function analyzeBotCapabilities(
  balCode: string,
  entities: VisualEntity[],
  connections: Connection[],
  triggerConfig?: TriggerConfig,
): BotCapabilities {
  // Parse BAL to extract output blocks and entity details
  let parsedEntities: Array<{ name: string; config: Record<string, unknown> }> = [];
  try {
    const parsed = parseBalCode(balCode);
    parsedEntities = parsed.entities;
  } catch {
    // Parse error — fall back to entities from props
  }

  // Collect all tools from entities
  const allTools = entities.flatMap((e) => e.tools);

  // Determine entity count and topology
  const entityCount = Math.max(parsedEntities.length, entities.length);
  const topology = deriveTopology(entityCount, connections);

  // Determine trigger types
  const triggerTypes: string[] = [];
  if (triggerConfig?.type) {
    triggerTypes.push(triggerConfig.type);
  }

  // Determine input mode
  const inputMode = deriveInputMode(triggerConfig);

  // Determine output mode from BAL output blocks
  const { outputMode, outputSchema } = deriveOutputMode(parsedEntities);

  return {
    inputMode,
    outputMode,
    outputSchema,
    tools: allTools,
    topology,
    triggerTypes,
    entityCount,
  };
}

function deriveTopology(entityCount: number, connections: Connection[]): Topology {
  if (entityCount <= 1) return 'single';
  if (connections.length === 0) return 'parallel';
  // Simple heuristic: if connections form a linear chain
  if (connections.length === entityCount - 1) return 'chain';
  return 'complex';
}

function deriveInputMode(triggerConfig?: TriggerConfig): InputMode {
  if (!triggerConfig?.type) return 'conversational';
  switch (triggerConfig.type) {
    case 'webhook':
      return 'webhook-payload';
    case 'file_upload':
      return 'file';
    default:
      return 'conversational';
  }
}

function deriveOutputMode(
  parsedEntities: Array<{ name: string; config: Record<string, unknown> }>,
): { outputMode: OutputMode; outputSchema?: Record<string, string> } {
  // Look for output blocks in any entity
  for (const entity of parsedEntities) {
    const output = entity.config.output;
    if (output && typeof output === 'object') {
      const schema = output as Record<string, unknown>;
      const outputSchema: Record<string, string> = {};
      let hasFields = false;
      for (const [key, value] of Object.entries(schema)) {
        if (typeof value === 'string') {
          outputSchema[key] = value;
          hasFields = true;
        }
      }
      if (hasFields) {
        return { outputMode: 'structured', outputSchema };
      }
    }
  }

  // No output block found — default to streaming text
  return { outputMode: 'streaming-text' };
}
