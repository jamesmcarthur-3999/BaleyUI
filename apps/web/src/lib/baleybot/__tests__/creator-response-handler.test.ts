/**
 * Tests for creator-response-handler.ts
 *
 * Pure function tests for buildCreatorResultPatch.
 */

import { describe, it, expect, vi } from 'vitest';

// Mock the logger to prevent ESM resolution failure in transitive imports
// (creator-helpers -> tools/requirements-scanner -> tools/built-in -> request-user-input -> @/lib/logger)
vi.mock('@/lib/logger', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

import { buildCreatorResultPatch, type ApplyResultInput } from '../creator-response-handler';
import type { VisualEntity, CreatorOutput } from '../creator-types';

function makeBaseInput(overrides?: Partial<ApplyResultInput>): ApplyResultInput {
  return {
    result: {
      status: 'building',
      message: '',
      entities: [],
      connections: [],
      balCode: '',
      name: 'Unnamed BaleyBot',
      description: '',
      icon: '\u{1F916}',
    },
    prevEntities: [],
    prevConnections: [],
    prevName: '',
    currentName: '',
    currentIcon: '',
    currentDescription: '',
    streamSummary: undefined,
    ...overrides,
  };
}

function makeReadyResult(overrides?: Partial<CreatorOutput>): CreatorOutput {
  return {
    status: 'ready',
    message: 'I built your bot!',
    entities: [
      { id: 'e1', name: 'researcher', icon: '\u{1F50D}', purpose: 'Search', tools: ['web_search'] },
    ],
    connections: [],
    balCode: 'researcher { "goal": "Search" }',
    name: 'Research Bot',
    description: 'A bot for research',
    icon: '\u{1F50D}',
    ...overrides,
  };
}

describe('buildCreatorResultPatch', () => {
  // === Building status tests ===

  it('building-status result with text -> conversation message only, no entity changes', () => {
    const patch = buildCreatorResultPatch(makeBaseInput({
      result: {
        ...makeBaseInput().result,
        message: 'Let me help you with that.',
      },
    }));

    expect(patch.isConversationOnly).toBe(true);
    expect(patch.entities).toBeUndefined();
    expect(patch.connections).toBeUndefined();
    expect(patch.balCode).toBeUndefined();
    expect(patch.newMessages).toHaveLength(1);

    const msg = patch.newMessages[0]!;
    expect(msg.role).toBe('assistant');
    expect(msg.content).toBe('Let me help you with that.');
  });

  it('building-status with empty text -> system notice "No response received"', () => {
    const patch = buildCreatorResultPatch(makeBaseInput({
      result: {
        ...makeBaseInput().result,
        message: '',
        thinking: '',
      },
    }));

    expect(patch.isConversationOnly).toBe(true);
    expect(patch.newMessages).toHaveLength(1);

    const msg = patch.newMessages[0]!;
    expect(msg.role).toBe('system');
    expect(msg.content).toContain('No response received');
    expect(msg.metadata?.isError).toBe(true);
  });

  it('building-status sets name/icon/description ONLY if currently empty', () => {
    // When current values are empty, should set from result
    const emptyPatch = buildCreatorResultPatch(makeBaseInput({
      result: {
        ...makeBaseInput().result,
        message: 'Here you go',
        name: 'Cool Bot',
        icon: '\u{1F31F}',
        description: 'A cool bot',
      },
      currentName: '',
      currentIcon: '',
      currentDescription: '',
    }));

    expect(emptyPatch.name).toBe('Cool Bot');
    expect(emptyPatch.icon).toBe('\u{1F31F}');
    expect(emptyPatch.description).toBe('A cool bot');

    // When current values are set, should NOT override
    const filledPatch = buildCreatorResultPatch(makeBaseInput({
      result: {
        ...makeBaseInput().result,
        message: 'Here you go',
        name: 'New Name',
        icon: '\u{1F31F}',
        description: 'New desc',
      },
      currentName: 'Existing Bot',
      currentIcon: '\u{2728}',
      currentDescription: 'Already described',
    }));

    expect(filledPatch.name).toBeUndefined();
    expect(filledPatch.icon).toBeUndefined();
    expect(filledPatch.description).toBeUndefined();
  });

  // === Structured result (ready status) tests ===

  it('structured result (ready status) -> entities, connections, balCode, name, icon', () => {
    const result = makeReadyResult();
    const patch = buildCreatorResultPatch(makeBaseInput({ result }));

    expect(patch.entities).toHaveLength(1);

    const entity = patch.entities![0]!;
    expect(entity.name).toBe('researcher');
    expect(entity.status).toBe('appearing');
    expect(patch.connections).toEqual([]);
    expect(patch.balCode).toBe('researcher { "goal": "Search" }');
    expect(patch.name).toBe('Research Bot');
    expect(patch.icon).toBe('\u{1F50D}');
    expect(patch.isConversationOnly).toBe(false);
  });

  it('structured result creates assistant message + "Built..." notification (2 messages)', () => {
    const result = makeReadyResult();
    const patch = buildCreatorResultPatch(makeBaseInput({ result }));

    expect(patch.newMessages).toHaveLength(2);

    const assistantMsg = patch.newMessages[0]!;
    const systemMsg = patch.newMessages[1]!;
    expect(assistantMsg.role).toBe('assistant');
    expect(assistantMsg.content).toContain('I built your bot!');
    expect(systemMsg.role).toBe('system');
    expect(systemMsg.content).toContain('Built "Research Bot"');
  });

  it('structured result generates change summary for modifications', () => {
    const prevEntities: VisualEntity[] = [
      { id: 'e1', name: 'old_agent', icon: '\u{1F916}', purpose: '', tools: [], position: { x: 0, y: 0 }, status: 'stable' },
    ];
    const result = makeReadyResult({
      entities: [
        { id: 'e2', name: 'new_agent', icon: '\u{1F50D}', purpose: 'Search', tools: ['web_search'] },
      ],
      message: '', // No model message, so change summary will be used
    });

    const patch = buildCreatorResultPatch(makeBaseInput({
      result,
      prevEntities,
      prevName: 'Old Bot',
    }));

    expect(patch.isInitialCreation).toBe(false);
    // Should have messages (change summary as content or model text)
    expect(patch.newMessages.length).toBeGreaterThanOrEqual(1);
  });

  it('initial creation (prevEntities empty) -> isInitialCreation true, resetDesignConfirmation true', () => {
    const result = makeReadyResult();
    const patch = buildCreatorResultPatch(makeBaseInput({
      result,
      prevEntities: [],
    }));

    expect(patch.isInitialCreation).toBe(true);
    expect(patch.resetDesignConfirmation).toBe(true);
  });

  it('modification (prevEntities non-empty) -> isInitialCreation false', () => {
    const prevEntities: VisualEntity[] = [
      { id: 'e1', name: 'existing', icon: '\u{1F916}', purpose: '', tools: [], position: { x: 0, y: 0 }, status: 'stable' },
    ];
    const result = makeReadyResult();
    const patch = buildCreatorResultPatch(makeBaseInput({
      result,
      prevEntities,
    }));

    expect(patch.isInitialCreation).toBe(false);
    expect(patch.resetDesignConfirmation).toBe(false);
  });

  it('historyEntry contains correct snapshot', () => {
    const result = makeReadyResult();
    const patch = buildCreatorResultPatch(makeBaseInput({ result }));

    expect(patch.historyEntry).toBeDefined();

    const entry = patch.historyEntry!;
    expect(entry.state.balCode).toBe('researcher { "goal": "Search" }');
    expect(entry.state.name).toBe('Research Bot');
    expect(entry.state.icon).toBe('\u{1F50D}');
    expect(entry.state.entities).toHaveLength(1);
    expect(entry.label).toContain('Research Bot');
  });

  it('entities get status "appearing" initially', () => {
    const result = makeReadyResult({
      entities: [
        { id: 'e1', name: 'bot_a', icon: '\u{1F916}', purpose: 'A', tools: [] },
        { id: 'e2', name: 'bot_b', icon: '\u{1F916}', purpose: 'B', tools: [] },
      ],
    });
    const patch = buildCreatorResultPatch(makeBaseInput({ result }));

    expect(patch.entities!.every(e => e.status === 'appearing')).toBe(true);
  });

  it('connections mapped correctly with stable status', () => {
    const result = makeReadyResult({
      connections: [
        { from: 'e1', to: 'e2', label: 'data flow' },
      ],
    });
    const patch = buildCreatorResultPatch(makeBaseInput({ result }));

    expect(patch.connections).toHaveLength(1);

    const conn = patch.connections![0]!;
    expect(conn.status).toBe('stable');
    expect(conn.label).toBe('data flow');
    expect(conn.id).toBe('conn-0');
  });

  it('stream summary passed through to assistant message metadata', () => {
    const patch = buildCreatorResultPatch(makeBaseInput({
      result: {
        ...makeBaseInput().result,
        message: 'Here is some info',
      },
      streamSummary: 'Analyzed your request in 2.3s',
    }));

    const msg = patch.newMessages[0]!;
    expect(msg.metadata?.streamSummary).toBe('Analyzed your request in 2.3s');
  });
});
