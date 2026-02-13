/**
 * Tests for creator-streaming.ts
 *
 * Tests the runCreatorStream function with mocked streamPostSSE.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runCreatorStream, type CreatorStreamConfig, type CreatorStreamCallbacks } from '../creator-streaming';
import type { CreatorStreamEvent } from '../creator-types';

// Mock streamPostSSE
vi.mock('@/lib/streaming/client-post-sse', () => ({
  streamPostSSE: vi.fn(),
}));

import { streamPostSSE } from '@/lib/streaming/client-post-sse';
const mockStreamPostSSE = vi.mocked(streamPostSSE);

function makeConfig(overrides?: Partial<CreatorStreamConfig>): CreatorStreamConfig {
  return {
    message: 'Build a research bot',
    conversationHistory: [],
    savedBaleybotId: null,
    balCode: '',
    name: '',
    description: '',
    icon: '',
    entities: [],
    viewMode: 'visual',
    availableTabs: ['visual', 'code'],
    lifecycleStage: 'draft',
    readiness: { designed: 'incomplete', connected: 'incomplete', tested: 'incomplete', integrated: 'incomplete', monitored: 'incomplete' },
    triggerConfigured: false,
    webhookEnabled: false,
    ...overrides,
  };
}

function makeCallbacks(overrides?: Partial<CreatorStreamCallbacks>): CreatorStreamCallbacks {
  return {
    onStreamingText: vi.fn(),
    onStreamingReasoning: vi.fn(),
    onProgress: vi.fn(),
    onAgentEvent: vi.fn(),
    onConnectionAction: vi.fn(),
    onTriggerSaved: vi.fn(),
    onWebhookEnabled: vi.fn(),
    onNavigateTab: vi.fn(),
    onShowPlan: vi.fn(),
    onShowSurface: vi.fn(),
    onSpecialistSignals: vi.fn(),
    invalidateConnections: vi.fn(),
    invalidateTriggerConfig: vi.fn(),
    invalidateBot: vi.fn(),
    ...overrides,
  };
}

/** Helper: simulate events by capturing the onEvent callback and calling it */
function simulateEvents(events: CreatorStreamEvent[]) {
  mockStreamPostSSE.mockImplementation(async (options) => {
    for (const event of events) {
      options.onEvent?.(event as never);
    }
  });
}

describe('runCreatorStream', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  it('text delta events invoke onStreamingText with accumulated text', async () => {
    const callbacks = makeCallbacks();
    simulateEvents([
      { type: 'creator_text_delta', content: 'Hello ' },
      { type: 'creator_text_delta', content: 'world' },
    ]);

    const promise = runCreatorStream(makeConfig(), callbacks);
    // Flush throttle timers
    await vi.runAllTimersAsync();
    const result = await promise;

    // After flush, onStreamingText should have been called with accumulated text
    expect(callbacks.onStreamingText).toHaveBeenCalledWith('Hello world');
    expect(result.streamedText).toBe('Hello world');
  });

  it('creator complete event returns result in final output', async () => {
    const creatorResult = {
      status: 'ready' as const,
      message: 'Built it!',
      entities: [{ id: '1', name: 'researcher', icon: '🔍', purpose: 'Search', tools: ['web_search'] }],
      connections: [],
      balCode: 'researcher { "goal": "Search" }',
      name: 'Research Bot',
      description: 'A research bot',
      icon: '🔍',
    };

    const callbacks = makeCallbacks();
    simulateEvents([
      { type: 'creator_complete', result: creatorResult, summary: 'Built a research bot' },
    ]);

    const promise = runCreatorStream(makeConfig(), callbacks);
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.result).toEqual(creatorResult);
    expect(result.summary).toBe('Built a research bot');
  });

  it('creator error event throws', async () => {
    simulateEvents([
      { type: 'creator_error', message: 'Something went wrong' },
    ]);

    // Must await rejection directly — no timer flush needed since mock is synchronous
    await expect(
      runCreatorStream(makeConfig(), makeCallbacks())
    ).rejects.toThrow('Something went wrong');
  });

  it('text-only stream (no creator_complete) returns synthetic building result', async () => {
    simulateEvents([
      { type: 'creator_text_delta', content: 'Let me help you design that.' },
    ]);

    const promise = runCreatorStream(makeConfig(), makeCallbacks());
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.result.status).toBe('building');
    expect(result.result.message).toBe('Let me help you design that.');
    expect(result.result.entities).toEqual([]);
  });

  it('empty stream (no text, no complete) returns empty building result', async () => {
    simulateEvents([]);

    const promise = runCreatorStream(makeConfig(), makeCallbacks());
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.result.status).toBe('building');
    expect(result.result.message).toBe('');
    expect(result.streamedText).toBe('');
  });

  it('connection action events invoke onConnectionAction callback', async () => {
    const callbacks = makeCallbacks();
    simulateEvents([
      { type: 'creator_connection_action', action: 'create_connection', result: { type: 'postgres' }, timestamp: 1000 },
    ]);

    const promise = runCreatorStream(makeConfig(), callbacks);
    await vi.runAllTimersAsync();
    await promise;

    expect(callbacks.onConnectionAction).toHaveBeenCalledWith('create_connection', { type: 'postgres' }, 1000);
    expect(callbacks.invalidateConnections).toHaveBeenCalled();
  });

  it('trigger saved events invoke onTriggerSaved callback', async () => {
    const callbacks = makeCallbacks();
    const triggerConfig = { type: 'schedule', schedule: '0 * * * *' };
    simulateEvents([
      { type: 'creator_trigger_saved', triggerConfig: triggerConfig as never },
    ]);

    const promise = runCreatorStream(
      makeConfig({ savedBaleybotId: 'bot-123' }),
      callbacks,
    );
    await vi.runAllTimersAsync();
    await promise;

    expect(callbacks.onTriggerSaved).toHaveBeenCalledWith(triggerConfig);
    expect(callbacks.invalidateTriggerConfig).toHaveBeenCalledWith('bot-123');
  });

  it('navigate tab events invoke onNavigateTab callback', async () => {
    const callbacks = makeCallbacks();
    simulateEvents([
      { type: 'creator_navigate_tab', tab: 'test' },
    ]);

    const promise = runCreatorStream(makeConfig(), callbacks);
    await vi.runAllTimersAsync();
    await promise;

    expect(callbacks.onNavigateTab).toHaveBeenCalledWith('test');
  });

  it('specialist signals from creator_complete invoke onSpecialistSignals', async () => {
    const callbacks = makeCallbacks();
    simulateEvents([
      {
        type: 'creator_complete',
        result: { status: 'building' as const, message: 'Done', entities: [], connections: [], balCode: '', name: '', description: '', icon: '' },
        specialist: { connections: { ran: true }, tests: null, deployment: { ran: true } },
      },
    ]);

    const promise = runCreatorStream(makeConfig(), callbacks);
    await vi.runAllTimersAsync();
    await promise;

    expect(callbacks.onSpecialistSignals).toHaveBeenCalledWith({
      connections: true,
      tests: undefined,
      deployment: true,
    });
  });

  it('config parameter used for body (not stale closures)', async () => {
    const config = makeConfig({
      savedBaleybotId: 'bot-456',
      balCode: 'my_bot { "goal": "test" }',
      name: 'My Bot',
      viewMode: 'code',
    });

    simulateEvents([]);

    const promise = runCreatorStream(config, makeCallbacks());
    await vi.runAllTimersAsync();
    await promise;

    const callArgs = mockStreamPostSSE.mock.calls[0]?.[0];
    expect(callArgs?.url).toBe('/api/baleybots/creator/stream');
    const body = callArgs?.body as Record<string, unknown>;
    expect(body.baleybotId).toBe('bot-456');
    expect(body.message).toBe('Build a research bot');
    const currentState = body.currentState as Record<string, unknown>;
    expect(currentState.balCode).toBe('my_bot { "goal": "test" }');
    expect(currentState.name).toBe('My Bot');
    const uiState = body.uiState as Record<string, string>;
    expect(uiState.activeTab).toBe('code');
  });
});
