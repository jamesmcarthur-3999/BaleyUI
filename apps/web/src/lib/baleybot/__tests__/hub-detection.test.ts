// apps/web/src/lib/baleybot/__tests__/hub-detection.test.ts
import { describe, it, expect } from 'vitest';
import { detectHubTopology, isHubEntity } from '../hub-detection';
import type { VisualEntity } from '../creator-types';

const makeEntity = (overrides: Partial<VisualEntity> = {}): VisualEntity => ({
  id: 'entity-1',
  name: 'Test Entity',
  icon: '🤖',
  purpose: 'Testing',
  tools: [],
  position: { x: 0, y: 0 },
  status: 'stable',
  ...overrides,
});

describe('detectHubTopology', () => {
  it('returns null for single entity', () => {
    const result = detectHubTopology([makeEntity()]);
    expect(result).toBeNull();
  });

  it('returns null for empty array', () => {
    const result = detectHubTopology([]);
    expect(result).toBeNull();
  });

  it('returns null when no entity has spawn_baleybot', () => {
    const result = detectHubTopology([
      makeEntity({ id: '1', name: 'A', tools: ['web_search'] }),
      makeEntity({ id: '2', name: 'B', tools: ['fetch_url'] }),
    ]);
    expect(result).toBeNull();
  });

  it('detects hub with spawn_baleybot', () => {
    const result = detectHubTopology([
      makeEntity({ id: 'hub', name: 'Orchestrator', tools: ['spawn_baleybot'] }),
      makeEntity({ id: 'spoke-1', name: 'Worker 1', tools: ['web_search'] }),
      makeEntity({ id: 'spoke-2', name: 'Worker 2', tools: ['fetch_url'] }),
    ]);
    expect(result).not.toBeNull();
    expect(result!.hub.entityId).toBe('hub');
    expect(result!.hub.entityName).toBe('Orchestrator');
    expect(result!.spokes).toHaveLength(2);
    expect(result!.spokes[0]!.entityName).toBe('Worker 1');
    expect(result!.spokes[1]!.entityName).toBe('Worker 2');
  });

  it('uses first hub when multiple exist', () => {
    const result = detectHubTopology([
      makeEntity({ id: 'hub-1', name: 'Hub A', tools: ['spawn_baleybot'] }),
      makeEntity({ id: 'hub-2', name: 'Hub B', tools: ['spawn_baleybot'] }),
      makeEntity({ id: 'worker', name: 'Worker', tools: [] }),
    ]);
    expect(result!.hub.entityId).toBe('hub-1');
    expect(result!.spokes).toHaveLength(2);
  });
});

describe('isHubEntity', () => {
  it('returns true for entity with spawn_baleybot', () => {
    expect(isHubEntity(makeEntity({ tools: ['spawn_baleybot', 'web_search'] }))).toBe(true);
  });

  it('returns false for entity without spawn_baleybot', () => {
    expect(isHubEntity(makeEntity({ tools: ['web_search'] }))).toBe(false);
  });

  it('returns false for entity with no tools', () => {
    expect(isHubEntity(makeEntity({ tools: [] }))).toBe(false);
  });
});
