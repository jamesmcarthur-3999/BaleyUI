// apps/web/src/lib/baleybot/readiness.ts

/**
 * Readiness State Machine
 *
 * Tracks production-readiness dimensions for a BaleyBot.
 */

export type ReadinessDimension = 'designed' | 'connected' | 'tested' | 'integrated' | 'monitored';
export type DimensionStatus = 'incomplete' | 'in-progress' | 'complete' | 'not-applicable';

export interface ReadinessState {
  designed: DimensionStatus;
  connected: DimensionStatus;
  tested: DimensionStatus;
  integrated: DimensionStatus;
  monitored: DimensionStatus;
}

export interface ReadinessApplicability {
  designed: true;
  connected: boolean;
  tested: true;
  integrated: boolean;
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
    integrated: needsActivation,
    monitored: needsActivation,
  };
}

/**
 * Specialist signals from Baley's autonomous team.
 * When a specialist was invoked and returned output, the corresponding
 * field will be truthy. This enriches the readiness computation with
 * AI-driven assessments alongside manual/UI-driven checks.
 */
export interface SpecialistSignals {
  /** connection_advisor returned output → enriches `connected` */
  connectionAdvisorRan?: boolean;
  /** test_orchestrator returned output → enriches `tested` */
  testOrchestratorRan?: boolean;
  /** deployment_advisor returned output → enriches `integrated` */
  deploymentAdvisorRan?: boolean;
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
  specialist?: SpecialistSignals;
}): ReadinessState {
  const applicability = computeApplicability(params.tools, params.hasConnections);
  const specialist = params.specialist;

  // connected: manual check OR specialist connection_advisor ran successfully
  const connectedStatus: DimensionStatus = !applicability.connected
    ? 'not-applicable'
    : params.connectionsMet || specialist?.connectionAdvisorRan
      ? 'complete'
      : 'incomplete';

  // tested: manual tests OR specialist test_orchestrator ran successfully
  const testedStatus: DimensionStatus = params.testsPassed || specialist?.testOrchestratorRan
    ? 'complete'
    : params.hasTestRuns > 0
      ? 'in-progress'
      : 'incomplete';

  // integrated: trigger configured OR specialist deployment_advisor assessed
  const integratedStatus: DimensionStatus = !applicability.integrated
    ? 'not-applicable'
    : params.hasTrigger || specialist?.deploymentAdvisorRan
      ? 'complete'
      : specialist?.deploymentAdvisorRan === false
        ? 'incomplete'
        : 'incomplete';

  return {
    designed: params.hasBalCode && params.hasEntities ? 'complete' : params.hasBalCode ? 'in-progress' : 'incomplete',
    connected: connectedStatus,
    tested: testedStatus,
    integrated: integratedStatus,
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
    integrated: 'incomplete',
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
 * Simplified tab set: Plan, Builder, Code, Test, Integrate
 */
export type AdaptiveTab = 'plan' | 'visual' | 'code' | 'test' | 'integrate';

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
      tabTarget: 'integrate',
      optionId: 'setup-connections',
    },
    {
      dimension: 'tested',
      status: state.tested,
      label: 'Run Tests',
      description: 'Run tests to verify your bot works',
      tabTarget: 'test',
      optionId: 'run-tests',
    },
    {
      dimension: 'integrated',
      status: state.integrated,
      label: 'Set Up Integration',
      description: 'Configure how your bot connects to your systems',
      tabTarget: 'integrate',
      optionId: 'setup-integration',
    },
    {
      dimension: 'monitored',
      status: state.monitored,
      label: 'Enable Monitoring',
      description: 'Set up monitoring to track performance',
      tabTarget: 'integrate',
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
    tabs.push('test');
  }
  return tabs;
}
