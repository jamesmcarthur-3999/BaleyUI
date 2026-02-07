// apps/web/src/lib/baleybot/hub-detection.ts

/**
 * Hub Topology Detection
 *
 * Finds entities that use spawn_baleybot to create
 * a hub-and-spoke visual representation.
 */

import type { VisualEntity } from './creator-types';

export interface HubTopology {
  /** Entity that orchestrates by spawning others */
  hub: {
    entityId: string;
    entityName: string;
  };
  /** Entities that are spawned by the hub */
  spokes: Array<{
    entityId: string;
    entityName: string;
  }>;
}

/**
 * Detect hub topology from entities.
 * A hub is an entity that has `spawn_baleybot` in its tools.
 * Spokes are other entities in the same bot (potential spawn targets).
 *
 * Returns null if no hub pattern is detected.
 */
export function detectHubTopology(entities: VisualEntity[]): HubTopology | null {
  if (entities.length < 2) return null;

  // Find entities with spawn_baleybot
  const hubs = entities.filter(e => e.tools.includes('spawn_baleybot'));

  if (hubs.length === 0) return null;

  // Use the first hub entity found
  const hub = hubs[0]!;
  const spokes = entities.filter(e => e.id !== hub.id);

  if (spokes.length === 0) return null;

  return {
    hub: {
      entityId: hub.id,
      entityName: hub.name,
    },
    spokes: spokes.map(s => ({
      entityId: s.id,
      entityName: s.name,
    })),
  };
}

/**
 * Check if an entity is a hub (has spawn_baleybot capability).
 */
export function isHubEntity(entity: VisualEntity): boolean {
  return entity.tools.includes('spawn_baleybot');
}
