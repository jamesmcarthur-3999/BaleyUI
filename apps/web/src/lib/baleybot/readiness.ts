// apps/web/src/lib/baleybot/readiness.ts

/**
 * Readiness State Machine
 *
 * Tracks production-readiness dimensions for a BaleyBot.
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

/**
 * Simplified tab set: Builder, Code, Try, Go Live
 */
export type AdaptiveTab = 'visual' | 'code' | 'review' | 'launch';

export interface RecommendedAction {
  dimension: ReadinessDimension;
  label: string;
  description: string;
  tabTarget: AdaptiveTab;
  optionId: string;
}

export function getRecommendedAction(state: ReadinessState): RecommendedAction | null {
  const actions: Array<{
    dimension: ReadinessDimension;
    status: DimensionStatus;
    label: string;
    description: string;
    tabTarget: AdaptiveTab;
    optionId: string;
  }> = [
    {
      dimension: 'designed',
      status: state.designed,
      label: 'Review Design',
      description: 'Check the visual layout and code to make sure everything looks right',
      tabTarget: 'visual',
      optionId: 'review-design',
    },
    {
      dimension: 'connected',
      status: state.connected,
      label: 'Set Up Connections',
      description: 'Connect the AI provider and any services your tools need',
      tabTarget: 'launch',
      optionId: 'setup-connections',
    },
    {
      dimension: 'tested',
      status: state.tested,
      label: 'Run Tests',
      description: 'Run tests to verify your bot works',
      tabTarget: 'review',
      optionId: 'run-tests',
    },
    {
      dimension: 'activated',
      status: state.activated,
      label: 'Set Up Triggers',
      description: 'Configure when your bot should run automatically',
      tabTarget: 'launch',
      optionId: 'setup-triggers',
    },
    {
      dimension: 'monitored',
      status: state.monitored,
      label: 'Enable Monitoring',
      description: 'Set up monitoring to track performance',
      tabTarget: 'launch',
      optionId: 'enable-monitoring',
    },
  ];

  for (const action of actions) {
    if (action.status === 'incomplete' || action.status === 'in-progress') {
      return {
        dimension: action.dimension,
        label: action.label,
        description: action.description,
        tabTarget: action.tabTarget,
        optionId: action.optionId,
      };
    }
  }

  return null;
}

export function getVisibleTabs(readiness: ReadinessState): AdaptiveTab[] {
  const tabs: AdaptiveTab[] = ['visual', 'code'];
  if (readiness.designed === 'complete' || readiness.designed === 'in-progress') {
    tabs.push('review');
  }
  return tabs;
}
