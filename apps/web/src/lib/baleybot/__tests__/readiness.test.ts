// apps/web/src/lib/baleybot/__tests__/readiness.test.ts
import { describe, it, expect } from 'vitest';
import {
  computeApplicability,
  computeReadiness,
  createInitialReadiness,
  countCompleted,
  getVisibleTabs,
  getRecommendedAction,
} from '../readiness';

describe('computeApplicability', () => {
  it('marks connected as false when no connection-requiring tools and no connections', () => {
    const result = computeApplicability(['web_search'], false);
    expect(result.connected).toBe(false);
    expect(result.designed).toBe(true);
    expect(result.tested).toBe(true);
  });

  it('marks connected as true when tools require connections', () => {
    const result = computeApplicability(['schedule_task'], false);
    expect(result.connected).toBe(true);
    expect(result.activated).toBe(true);
    expect(result.monitored).toBe(true);
  });

  it('marks connected as true when hasConnections is true', () => {
    const result = computeApplicability(['web_search'], true);
    expect(result.connected).toBe(true);
  });

  it('marks activated/monitored only for schedule_task', () => {
    const result = computeApplicability(['spawn_baleybot'], false);
    expect(result.connected).toBe(true);
    expect(result.activated).toBe(false);
    expect(result.monitored).toBe(false);
  });
});

describe('computeReadiness', () => {
  it('returns all incomplete for empty state', () => {
    const result = computeReadiness({
      hasBalCode: false,
      hasEntities: false,
      tools: [],
      connectionsMet: false,
      hasConnections: false,
      testsPassed: false,
      hasTestRuns: 0,
      hasTrigger: false,
      hasMonitoring: false,
    });
    expect(result.designed).toBe('incomplete');
    expect(result.tested).toBe('incomplete');
  });

  it('returns in-progress when only balCode exists', () => {
    const result = computeReadiness({
      hasBalCode: true,
      hasEntities: false,
      tools: [],
      connectionsMet: false,
      hasConnections: false,
      testsPassed: false,
      hasTestRuns: 0,
      hasTrigger: false,
      hasMonitoring: false,
    });
    expect(result.designed).toBe('in-progress');
  });

  it('returns complete when balCode and entities exist', () => {
    const result = computeReadiness({
      hasBalCode: true,
      hasEntities: true,
      tools: [],
      connectionsMet: false,
      hasConnections: false,
      testsPassed: false,
      hasTestRuns: 0,
      hasTrigger: false,
      hasMonitoring: false,
    });
    expect(result.designed).toBe('complete');
  });

  it('marks connected as not-applicable when no connection tools', () => {
    const result = computeReadiness({
      hasBalCode: true,
      hasEntities: true,
      tools: ['web_search'],
      connectionsMet: false,
      hasConnections: false,
      testsPassed: false,
      hasTestRuns: 0,
      hasTrigger: false,
      hasMonitoring: false,
    });
    expect(result.connected).toBe('not-applicable');
  });

  it('marks tested in-progress when has test runs but not all passed', () => {
    const result = computeReadiness({
      hasBalCode: true,
      hasEntities: true,
      tools: [],
      connectionsMet: false,
      hasConnections: false,
      testsPassed: false,
      hasTestRuns: 3,
      hasTrigger: false,
      hasMonitoring: false,
    });
    expect(result.tested).toBe('in-progress');
  });

  it('marks tested complete when tests passed', () => {
    const result = computeReadiness({
      hasBalCode: true,
      hasEntities: true,
      tools: [],
      connectionsMet: false,
      hasConnections: false,
      testsPassed: true,
      hasTestRuns: 5,
      hasTrigger: false,
      hasMonitoring: false,
    });
    expect(result.tested).toBe('complete');
  });
});

describe('createInitialReadiness', () => {
  it('returns all dimensions as incomplete', () => {
    const result = createInitialReadiness();
    expect(result.designed).toBe('incomplete');
    expect(result.connected).toBe('incomplete');
    expect(result.tested).toBe('incomplete');
    expect(result.activated).toBe('incomplete');
    expect(result.monitored).toBe('incomplete');
  });
});

describe('countCompleted', () => {
  it('counts 0/5 for initial state', () => {
    const result = countCompleted(createInitialReadiness());
    expect(result).toEqual({ completed: 0, total: 5 });
  });

  it('excludes not-applicable from total', () => {
    const result = countCompleted({
      designed: 'complete',
      connected: 'not-applicable',
      tested: 'complete',
      activated: 'not-applicable',
      monitored: 'not-applicable',
    });
    expect(result).toEqual({ completed: 2, total: 2 });
  });

  it('counts all dimensions correctly', () => {
    const result = countCompleted({
      designed: 'complete',
      connected: 'complete',
      tested: 'in-progress',
      activated: 'incomplete',
      monitored: 'not-applicable',
    });
    expect(result).toEqual({ completed: 2, total: 4 });
  });
});

describe('getVisibleTabs', () => {
  it('shows only visual and code for initial state', () => {
    const tabs = getVisibleTabs(createInitialReadiness());
    expect(tabs).toEqual(['visual', 'code']);
  });

  it('shows test when designed is in-progress', () => {
    const tabs = getVisibleTabs({
      designed: 'in-progress',
      connected: 'incomplete',
      tested: 'incomplete',
      activated: 'incomplete',
      monitored: 'incomplete',
    });
    expect(tabs).toContain('test');
    expect(tabs).not.toContain('schema');
  });

  it('shows connections when applicable and designed', () => {
    const tabs = getVisibleTabs({
      designed: 'complete',
      connected: 'incomplete',
      tested: 'incomplete',
      activated: 'incomplete',
      monitored: 'incomplete',
    });
    expect(tabs).toContain('connections');
  });

  it('hides connections when not-applicable', () => {
    const tabs = getVisibleTabs({
      designed: 'complete',
      connected: 'not-applicable',
      tested: 'incomplete',
      activated: 'not-applicable',
      monitored: 'not-applicable',
    });
    expect(tabs).not.toContain('connections');
    expect(tabs).not.toContain('triggers');
    expect(tabs).not.toContain('monitor');
  });

  it('shows triggers when connected or tested', () => {
    const tabs = getVisibleTabs({
      designed: 'complete',
      connected: 'complete',
      tested: 'incomplete',
      activated: 'incomplete',
      monitored: 'incomplete',
    });
    expect(tabs).toContain('triggers');
  });

  it('includes analytics only after design starts', () => {
    const tabs = getVisibleTabs(createInitialReadiness());
    expect(tabs).not.toContain('analytics');

    const tabsDesigned = getVisibleTabs({
      designed: 'in-progress',
      connected: 'incomplete',
      tested: 'incomplete',
      activated: 'incomplete',
      monitored: 'incomplete',
    });
    expect(tabsDesigned).toContain('analytics');
  });
});

describe('getRecommendedAction', () => {
  it('returns designed first when nothing is done', () => {
    const state = computeReadiness({
      hasBalCode: false, hasEntities: false, tools: [],
      connectionsMet: false, hasConnections: false,
      testsPassed: false, hasTestRuns: 0,
      hasTrigger: false, hasMonitoring: false,
    });
    const action = getRecommendedAction(state);
    expect(action?.dimension).toBe('designed');
    expect(action?.tabTarget).toBe('visual');
    expect(action?.optionId).toBe('review-design');
  });

  it('returns connected after design is complete', () => {
    const state = computeReadiness({
      hasBalCode: true, hasEntities: true,
      tools: ['web_search', 'schedule_task'],
      connectionsMet: false, hasConnections: true,
      testsPassed: false, hasTestRuns: 0,
      hasTrigger: false, hasMonitoring: false,
    });
    expect(state.designed).toBe('complete');
    const action = getRecommendedAction(state);
    expect(action?.dimension).toBe('connected');
    expect(action?.tabTarget).toBe('connections');
  });

  it('returns tested after connections are met', () => {
    const state = computeReadiness({
      hasBalCode: true, hasEntities: true,
      tools: ['web_search', 'schedule_task'],
      connectionsMet: true, hasConnections: true,
      testsPassed: false, hasTestRuns: 0,
      hasTrigger: false, hasMonitoring: false,
    });
    const action = getRecommendedAction(state);
    expect(action?.dimension).toBe('tested');
    expect(action?.tabTarget).toBe('test');
  });

  it('returns activated after testing is complete', () => {
    const state = computeReadiness({
      hasBalCode: true, hasEntities: true,
      tools: ['schedule_task'],
      connectionsMet: true, hasConnections: true,
      testsPassed: true, hasTestRuns: 1,
      hasTrigger: false, hasMonitoring: false,
    });
    const action = getRecommendedAction(state);
    expect(action?.dimension).toBe('activated');
    expect(action?.tabTarget).toBe('triggers');
  });

  it('returns null when all applicable dimensions are complete', () => {
    const state = computeReadiness({
      hasBalCode: true, hasEntities: true,
      tools: ['web_search'],
      connectionsMet: true, hasConnections: true,
      testsPassed: true, hasTestRuns: 1,
      hasTrigger: false, hasMonitoring: false,
    });
    // web_search only → activated/monitored = not-applicable, connected N/A (no connection-requiring tools with hasConnections=true still marks connected=true)
    const action = getRecommendedAction(state);
    expect(action).toBeNull();
  });

  it('skips not-applicable dimensions', () => {
    const state = computeReadiness({
      hasBalCode: true, hasEntities: true,
      tools: ['web_search'],
      connectionsMet: true, hasConnections: false,
      testsPassed: false, hasTestRuns: 0,
      hasTrigger: false, hasMonitoring: false,
    });
    // connected is N/A (no connection-requiring tools, no hasConnections)
    const action = getRecommendedAction(state);
    expect(action?.dimension).toBe('tested');
  });

  it('returns in-progress dimension as next action', () => {
    const state = computeReadiness({
      hasBalCode: true, hasEntities: false,
      tools: [],
      connectionsMet: false, hasConnections: false,
      testsPassed: false, hasTestRuns: 0,
      hasTrigger: false, hasMonitoring: false,
    });
    expect(state.designed).toBe('in-progress');
    const action = getRecommendedAction(state);
    expect(action?.dimension).toBe('designed');
  });

  it('returns monitored after activated is complete', () => {
    const state = computeReadiness({
      hasBalCode: true, hasEntities: true,
      tools: ['schedule_task'],
      connectionsMet: true, hasConnections: true,
      testsPassed: true, hasTestRuns: 1,
      hasTrigger: true, hasMonitoring: false,
    });
    const action = getRecommendedAction(state);
    expect(action?.dimension).toBe('monitored');
    expect(action?.tabTarget).toBe('monitor');
  });
});
