/**
 * Change Summary Generator
 *
 * Compares previous and new BaleyBot state to generate human-readable
 * descriptions of what changed.
 */

import type { VisualEntity, Connection } from './creator-types';

/**
 * Change types that can be detected
 */
export type ChangeType = 'added' | 'removed' | 'modified' | 'unchanged';

/**
 * Summary of changes between two states
 */
export interface ChangeSummary {
  /** Human-readable summary text */
  summary: string;
  /** Detailed list of changes */
  changes: ChangeDetail[];
  /** Whether there were any changes */
  hasChanges: boolean;
}

/**
 * Detail of a single change
 */
export interface ChangeDetail {
  type: ChangeType;
  category: 'entity' | 'connection' | 'name' | 'code';
  description: string;
  entityId?: string;
}

/**
 * Compare two sets of entities and generate a change summary
 */
export function generateChangeSummary(
  prevEntities: VisualEntity[],
  newEntities: VisualEntity[],
  prevConnections: Connection[],
  newConnections: Connection[],
  prevName: string,
  newName: string
): ChangeSummary {
  const changes: ChangeDetail[] = [];

  // Create maps for efficient lookup
  const prevEntityMap = new Map(prevEntities.map((e) => [e.id, e]));
  const newEntityMap = new Map(newEntities.map((e) => [e.id, e]));

  // Find added entities
  for (const entity of newEntities) {
    if (!prevEntityMap.has(entity.id)) {
      changes.push({
        type: 'added',
        category: 'entity',
        description: `Added "${entity.name}"`,
        entityId: entity.id,
      });
    }
  }

  // Find removed entities
  for (const entity of prevEntities) {
    if (!newEntityMap.has(entity.id)) {
      changes.push({
        type: 'removed',
        category: 'entity',
        description: `Removed "${entity.name}"`,
        entityId: entity.id,
      });
    }
  }

  // Find modified entities (same ID but different properties)
  for (const newEntity of newEntities) {
    const prevEntity = prevEntityMap.get(newEntity.id);
    if (prevEntity) {
      const modifications = getEntityModifications(prevEntity, newEntity);
      if (modifications.length > 0) {
        changes.push({
          type: 'modified',
          category: 'entity',
          description: `Updated "${newEntity.name}": ${modifications.join(', ')}`,
          entityId: newEntity.id,
        });
      }
    }
  }

  // Check connection changes
  const prevConnSet = new Set(prevConnections.map((c) => `${c.from}->${c.to}`));
  const newConnSet = new Set(newConnections.map((c) => `${c.from}->${c.to}`));

  for (const conn of newConnections) {
    const key = `${conn.from}->${conn.to}`;
    if (!prevConnSet.has(key)) {
      changes.push({
        type: 'added',
        category: 'connection',
        description: `Added connection: ${conn.label || 'flow'}`,
      });
    }
  }

  for (const conn of prevConnections) {
    const key = `${conn.from}->${conn.to}`;
    if (!newConnSet.has(key)) {
      changes.push({
        type: 'removed',
        category: 'connection',
        description: `Removed connection`,
      });
    }
  }

  // Check name change
  if (prevName && newName && prevName !== newName) {
    changes.push({
      type: 'modified',
      category: 'name',
      description: `Renamed from "${prevName}" to "${newName}"`,
    });
  }

  // Generate summary text
  const summary = generateSummaryText(changes, newEntities.length, prevEntities.length);

  return {
    summary,
    changes,
    hasChanges: changes.length > 0,
  };
}

/**
 * Get list of modifications between two entities
 */
function getEntityModifications(prev: VisualEntity, next: VisualEntity): string[] {
  const mods: string[] = [];

  if (prev.name !== next.name) {
    mods.push(`renamed to "${next.name}"`);
  }

  if (prev.purpose !== next.purpose) {
    mods.push('updated purpose');
  }

  // Check tools changes
  const prevTools = new Set(prev.tools);
  const nextTools = new Set(next.tools);
  const addedTools = next.tools.filter((t) => !prevTools.has(t));
  const removedTools = prev.tools.filter((t) => !nextTools.has(t));

  if (addedTools.length > 0) {
    mods.push(`added ${addedTools.length} tool${addedTools.length > 1 ? 's' : ''}`);
  }
  if (removedTools.length > 0) {
    mods.push(`removed ${removedTools.length} tool${removedTools.length > 1 ? 's' : ''}`);
  }

  if (prev.icon !== next.icon) {
    mods.push('changed icon');
  }

  return mods;
}

/**
 * Generate human-readable summary text
 */
function generateSummaryText(
  changes: ChangeDetail[],
  newCount: number,
  prevCount: number
): string {
  if (changes.length === 0) {
    return 'No changes made.';
  }

  const parts: string[] = [];

  // Count entity changes
  const addedEntities = changes.filter((c) => c.category === 'entity' && c.type === 'added');
  const removedEntities = changes.filter((c) => c.category === 'entity' && c.type === 'removed');
  const modifiedEntities = changes.filter((c) => c.category === 'entity' && c.type === 'modified');

  // Build summary
  if (prevCount === 0 && newCount > 0) {
    // Initial creation
    parts.push(`Created ${newCount} ${newCount === 1 ? 'entity' : 'entities'}`);
  } else {
    if (addedEntities.length > 0) {
      parts.push(`Added ${addedEntities.length} ${addedEntities.length === 1 ? 'entity' : 'entities'}`);
    }
    if (removedEntities.length > 0) {
      parts.push(`Removed ${removedEntities.length} ${removedEntities.length === 1 ? 'entity' : 'entities'}`);
    }
    if (modifiedEntities.length > 0) {
      parts.push(`Updated ${modifiedEntities.length} ${modifiedEntities.length === 1 ? 'entity' : 'entities'}`);
    }
  }

  // Add connection changes
  const addedConns = changes.filter((c) => c.category === 'connection' && c.type === 'added');
  const removedConns = changes.filter((c) => c.category === 'connection' && c.type === 'removed');

  if (addedConns.length > 0 || removedConns.length > 0) {
    const connParts: string[] = [];
    if (addedConns.length > 0) connParts.push(`${addedConns.length} added`);
    if (removedConns.length > 0) connParts.push(`${removedConns.length} removed`);
    parts.push(`Connections: ${connParts.join(', ')}`);
  }

  // Add name change
  const nameChange = changes.find((c) => c.category === 'name');
  if (nameChange) {
    parts.push(nameChange.description);
  }

  return parts.join('. ') + '.';
}

/**
 * Format a change summary for display in the chat
 */
export function formatChangeSummaryForChat(summary: ChangeSummary): string {
  if (!summary.hasChanges) {
    return '';
  }
  return summary.summary;
}
