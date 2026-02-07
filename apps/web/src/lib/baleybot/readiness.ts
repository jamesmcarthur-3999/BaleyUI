// apps/web/src/lib/baleybot/readiness.ts

/**
 * Readiness State Machine
 *
 * Tracks 5 dimensions of BaleyBot production-readiness.
 * Not sequential — users can tackle in any order.
 */

export type ReadinessDimension = 'designed' | 'connected' | 'tested' | 'activated' | 'monitored';
export type DimensionStatus = 'incomplete' | 'in-progress' | 'complete' | 'not-applicable';

export interface ReadinessState {
  designed: DimensionStatus;
  connected: DimensionStatus;
  tested: DimensionStatus;
  activated: DimensionStatus;
  monitored: DimensionStatus;
}

export interface ReadinessApplicability {
  designed: true;
  connected: boolean;
  tested: true;
  activated: boolean;
  monitored: boolean;
}

const CONNECTION_REQUIRING_TOOLS = [
  'schedule_task',
  'send_notification',
  'spawn_baleybot',
];

const TRIGGER_IMPLYING_TOOLS = [
  'schedule_task',
];

export function computeApplicability(
  tools: string[],
  hasConnections: boolean,
): ReadinessApplicability {
  const needsConnection = tools.some(t => CONNECTION_REQUIRING_TOOLS.includes(t)) || hasConnections;
  const needsActivation = tools.some(t => TRIGGER_IMPLYING_TOOLS.includes(t));
  return {
    designed: true,
    connected: needsConnection,
    tested: true,
    activated: needsActivation,
    monitored: needsActivation,
  };
}

export function computeReadiness(params: {
  hasBalCode: boolean;
  hasEntities: boolean;
  tools: string[];
  connectionsMet: boolean;
  hasConnections: boolean;
  testsPassed: boolean;
  hasTestRuns: number;
  hasTrigger: boolean;
  hasMonitoring: boolean;
}): ReadinessState {
  const applicability = computeApplicability(params.tools, params.hasConnections);
  return {
    designed: params.hasBalCode && params.hasEntities ? 'complete' : params.hasBalCode ? 'in-progress' : 'incomplete',
    connected: !applicability.connected
      ? 'not-applicable'
      : params.connectionsMet ? 'complete' : 'incomplete',
    tested: params.testsPassed
      ? 'complete'
      : params.hasTestRuns > 0 ? 'in-progress' : 'incomplete',
    activated: !applicability.activated
      ? 'not-applicable'
      : params.hasTrigger ? 'complete' : 'incomplete',
    monitored: !applicability.monitored
      ? 'not-applicable'
      : params.hasMonitoring ? 'complete' : 'incomplete',
  };
}

export function createInitialReadiness(): ReadinessState {
  return {
    designed: 'incomplete',
    connected: 'incomplete',
    tested: 'incomplete',
    activated: 'incomplete',
    monitored: 'incomplete',
  };
}

export function countCompleted(state: ReadinessState): { completed: number; total: number } {
  const dimensions = Object.values(state);
  const applicable = dimensions.filter(s => s !== 'not-applicable');
  const completed = applicable.filter(s => s === 'complete');
  return { completed: completed.length, total: applicable.length };
}

export type AdaptiveTab = 'visual' | 'code' | 'schema' | 'connections' | 'test' | 'triggers' | 'analytics' | 'monitor';

export function getVisibleTabs(readiness: ReadinessState): AdaptiveTab[] {
  const tabs: AdaptiveTab[] = ['visual', 'code'];
  if (readiness.designed !== 'incomplete') {
    tabs.push('schema');
  }
  if (readiness.designed === 'complete' || readiness.designed === 'in-progress') {
    if (readiness.connected !== 'not-applicable') {
      tabs.push('connections');
    }
  }
  if (readiness.designed === 'complete' || readiness.designed === 'in-progress') {
    tabs.push('test');
  }
  if (readiness.connected === 'complete' || readiness.tested !== 'incomplete') {
    if (readiness.activated !== 'not-applicable') {
      tabs.push('triggers');
    }
  }
  tabs.push('analytics');
  if (readiness.activated !== 'incomplete' || readiness.tested === 'complete') {
    if (readiness.monitored !== 'not-applicable') {
      tabs.push('monitor');
    }
  }
  return tabs;
}
