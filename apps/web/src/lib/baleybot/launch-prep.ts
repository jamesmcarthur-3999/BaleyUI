/**
 * Launch Prep Helpers
 *
 * Shared contracts and deterministic helpers for launch readiness and runtime interface generation.
 */

import { parseBalCode } from './bal-parser-pure';
import { getConnectionSummary } from './tools/requirements-scanner';
import type {
  Connection,
  LaunchKit,
  RuntimeInterfaceSpec,
  TriggerType,
} from './types';

export type TopologyType = 'single' | 'chain' | 'parallel' | 'complex';

export interface LaunchReadinessEvaluation {
  balValid: boolean;
  parseErrors: string[];
  connectionsReady: boolean;
  missingConnections: string[];
  testPassRate: number;
  totalTests: number;
  passedTests: number;
  topology: TopologyType;
  blockingIssues: string[];
  readyForLaunchPrep: boolean;
}

interface StoredTestCaseLike {
  status?: 'pending' | 'running' | 'passed' | 'failed';
}

function inferTopology(balCode: string): TopologyType {
  const parsed = parseBalCode(balCode);
  const code = balCode.toLowerCase();
  const entityCount = parsed.entities.length;

  if (entityCount <= 1) return 'single';
  if (code.includes('parallel')) return 'parallel';
  if (code.includes('if ') || code.includes('loop ') || code.includes('route(') || code.includes('try ')) {
    return 'complex';
  }
  if (parsed.chain && parsed.chain.length > 1) return 'chain';
  return 'complex';
}

function countTests(testCasesJson: unknown): {
  total: number;
  passed: number;
  passRate: number;
} {
  if (!Array.isArray(testCasesJson)) {
    return { total: 0, passed: 0, passRate: 0 };
  }

  const tests = testCasesJson as StoredTestCaseLike[];
  const completed = tests.filter((t) => t.status === 'passed' || t.status === 'failed');
  const passed = tests.filter((t) => t.status === 'passed').length;
  const total = completed.length;
  const passRate = total > 0 ? passed / total : 0;

  return { total, passed, passRate };
}

export function evaluateLaunchReadiness(args: {
  balCode: string;
  workspaceConnections: Connection[];
  testCasesJson: unknown;
  requiredPassRate?: number;
}): LaunchReadinessEvaluation {
  const requiredPassRate = args.requiredPassRate ?? 0.8;
  const parsed = parseBalCode(args.balCode);
  const balValid = parsed.errors.length === 0 && parsed.entities.length > 0;
  const topology = inferTopology(args.balCode);
  const tools = parsed.entities.flatMap((entity) => {
    const value = entity.config.tools;
    return Array.isArray(value) ? value : [];
  });

  const connectionSummary = getConnectionSummary(tools);
  const connectedTypes = new Set(
    args.workspaceConnections
      .filter((c) => c.status === 'connected')
      .map((c) => c.type)
  );
  const hasAIProvider =
    connectedTypes.has('openai') ||
    connectedTypes.has('anthropic') ||
    connectedTypes.has('ollama');

  const missingConnections = connectionSummary.required
    .filter((req) => !connectedTypes.has(req.connectionType))
    .map((req) => req.connectionType);

  const connectionsReady = hasAIProvider && missingConnections.length === 0;

  const tests = countTests(args.testCasesJson);

  const blockingIssues: string[] = [];
  if (!balValid) {
    blockingIssues.push('BAL code is invalid or has parse errors.');
  }
  if (!connectionsReady) {
    if (!hasAIProvider) {
      blockingIssues.push('No connected AI provider found (OpenAI, Anthropic, or Ollama).');
    }
    if (missingConnections.length > 0) {
      blockingIssues.push(`Missing required tool connections: ${missingConnections.join(', ')}.`);
    }
  }
  if (tests.total === 0) {
    blockingIssues.push('No completed tests found.');
  } else if (tests.passRate < requiredPassRate) {
    blockingIssues.push(
      `Test pass rate ${Math.round(tests.passRate * 100)}% is below required ${Math.round(requiredPassRate * 100)}%.`
    );
  }

  return {
    balValid,
    parseErrors: parsed.errors,
    connectionsReady,
    missingConnections,
    testPassRate: tests.passRate,
    totalTests: tests.total,
    passedTests: tests.passed,
    topology,
    blockingIssues,
    readyForLaunchPrep: blockingIssues.length === 0,
  };
}

export function buildDefaultRuntimeInterface(args: {
  balCode: string;
  triggerType?: TriggerType;
}): RuntimeInterfaceSpec {
  const topology = inferTopology(args.balCode);
  const isPipeline = topology !== 'single';

  return {
    version: 1,
    mode: isPipeline ? 'hybrid' : 'chat',
    components: [
      { type: 'chat_input', id: 'input', label: 'Ask or provide input' },
      { type: 'run_button', id: 'run', label: 'Run' },
      { type: 'result_view', id: 'result', format: isPipeline ? 'mixed' : 'text' },
      ...(isPipeline
        ? [{ type: 'cluster_trace', id: 'trace', showEntityTiming: true } as const]
        : []),
    ],
  };
}

export function buildLaunchKit(args: {
  balCode: string;
  readiness: LaunchReadinessEvaluation;
  triggerRecommendations?: Array<{
    type: TriggerType;
    reason: string;
    config?: Record<string, unknown>;
  }>;
  monitoringAdvice?: {
    alertsToSet?: string[];
    metricsToWatch?: string[];
  };
}): LaunchKit {
  const recommendedPrimary = args.triggerRecommendations?.[0]?.type ?? 'manual';
  const runtimeInterface = buildDefaultRuntimeInterface({
    balCode: args.balCode,
    triggerType: recommendedPrimary,
  });

  return {
    generatedAt: new Date().toISOString(),
    confidenceScore: args.readiness.readyForLaunchPrep ? 0.9 : 0.5,
    verificationSummary: {
      passRate: args.readiness.testPassRate,
      topology: args.readiness.topology,
      keyRisks: args.readiness.blockingIssues,
    },
    activationPlan: {
      recommendedPrimary,
      channels: (args.triggerRecommendations ?? [{ type: 'manual', reason: 'Manual run is always available.' }]).map((rec) => ({
        type: rec.type,
        enabledByDefault: rec.type === recommendedPrimary,
        config: rec.config ?? {},
        rationale: rec.reason,
      })),
    },
    runtimeInterface,
    monitoringPlan: {
      alerts: args.monitoringAdvice?.alertsToSet ?? ['Alert on repeated failures.'],
      metrics: args.monitoringAdvice?.metricsToWatch ?? ['Success rate', 'Average duration', 'Execution count'],
    },
    goLiveChecklist: [
      'BAL parses without errors.',
      'Required connections are configured and connected.',
      'Test pass rate meets the required threshold.',
      'Activation channel is configured.',
      'Monitoring alerts and metrics are reviewed.',
    ],
  };
}

