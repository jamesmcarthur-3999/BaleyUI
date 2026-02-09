// apps/web/src/components/creator/ConnectionsPanel.tsx
'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  Bot,
  CheckCircle2,
  Database,
  ExternalLink,
  Gauge,
  Loader2,
  Plus,
  ShieldCheck,
  Sparkles,
  SlidersHorizontal,
  Wrench,
} from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { trpc } from '@/lib/trpc/client';
import { cn } from '@/lib/utils';
import {
  connectionNameToSlug,
  evaluateToolConnectionBinding,
  parseConnectionTool,
  scanToolRequirements,
} from '@/lib/baleybot/tools/requirements-scanner';
import { getBuiltInToolMetadata } from '@/lib/baleybot/tools/built-in';
import { InlineConnectionForm } from './InlineConnectionForm';
import { ROUTES } from '@/lib/routes';

interface ConnectionData {
  id: string;
  type: string;
  name: string;
  status: string;
  isDefault: boolean;
}

interface EntitySummaryInput {
  name: string;
  tools: string[];
}

interface ConnectionsPanelProps {
  /** All tools used by this bot's entities */
  tools: string[];
  /** Connections available in the workspace */
  connections: ConnectionData[];
  /** Saved BaleyBot ID (required for internal BB analysis) */
  baleybotId?: string;
  /** Current BAL code for analysis context */
  balCode?: string;
  /** Current entities for analysis context */
  entitySummaries?: EntitySummaryInput[];
  /** Whether connections are loading */
  isLoading: boolean;
  /** Callback when a new connection is created inline */
  onConnectionCreated?: () => void;
  /** Callback to apply database tool remaps to BAL code */
  onApplyToolRemap?: (remaps: Array<{ fromTool: string; toTool: string }>) => void;
  /** Callback to navigate to the test tab (shown as CTA when all connections ready) */
  onNavigateToTest?: () => void;
  className?: string;
}

interface ToolRemapPlan {
  fromTool: string;
  toTool: string;
}

interface ToolVerificationResult {
  toolName: string;
  status: 'verified' | 'needs_setup' | 'failed' | 'manual_review';
  checkType: 'runtime' | 'connection' | 'static';
  summary: string;
  details?: string[];
  connection?: {
    id: string;
    name: string;
    type: string;
    status: string;
  };
  probe?: {
    attempted: boolean;
    success?: boolean;
    message?: string;
  };
}

interface ConnectionAdvisorResult {
  analysis?: {
    aiProvider?: {
      needed: boolean;
      recommended?: string;
      reason: string;
    };
    databases?: Array<{
      type: string;
      tools: string[];
      configHints?: string;
    }>;
    external?: Array<{
      service: string;
      reason: string;
    }>;
  };
  recommendations?: string[];
  warnings?: string[];
}

type GuidedActionType =
  | 'connect_ai'
  | 'add_database_source'
  | 'apply_remap'
  | 'verify_tool'
  | 'test_connection'
  | 'open_tests';

interface GuidedResolutionAction {
  id: string;
  type: GuidedActionType;
  title: string;
  description: string;
  toolName?: string;
  connectionId?: string;
  dbType?: 'postgres' | 'mysql';
  sourceSlug?: string;
}

// ============================================================================
// TOOL READINESS
// ============================================================================

export interface ToolReadinessInfo {
  status: 'ready' | 'needs-setup' | 'limited';
  note: string;
}

/**
 * Determine the readiness status of a tool based on its name and available connections.
 */
export function getToolReadinessStatus(
  toolName: string,
  connections: ConnectionData[]
): ToolReadinessInfo {
  // Built-in tools that always work.
  const alwaysReady: Record<string, string> = {
    web_search: 'Works with or without Tavily API key',
    fetch_url: 'No config needed',
    spawn_baleybot: 'No config needed',
    send_notification: 'Sends in-app notifications (see bell icon)',
    schedule_task: 'Schedules via cron job',
    store_memory: 'Persistent key-value storage',
    shared_storage: 'Cross-BB shared data',
    create_agent: 'Creates ephemeral agents',
    create_tool: 'Creates ephemeral tools',
  };

  if (alwaysReady[toolName]) {
    return { status: 'ready', note: alwaysReady[toolName] };
  }

  const binding = evaluateToolConnectionBinding(toolName, connections);
  if (binding.status === 'ready') {
    return {
      status: 'ready',
      note: binding.reason,
    };
  }

  if (binding.status === 'mismatch') {
    return {
      status: 'limited',
      note: binding.reason,
    };
  }

  if (binding.connectionType === 'none') {
    return {
      status: 'ready',
      note: binding.reason,
    };
  }

  return {
    status: 'needs-setup',
    note: binding.reason,
  };
}

// ============================================================================
// STATUS BADGES
// ============================================================================

function StatusPill({ status }: { status: ToolReadinessInfo['status'] }) {
  return (
    <span
      className={cn(
        'text-[10px] px-1.5 py-0.5 rounded-full font-medium uppercase tracking-wide',
        status === 'ready' && 'bg-green-500/10 text-green-700 dark:text-green-400',
        status === 'needs-setup' && 'bg-amber-500/10 text-amber-700 dark:text-amber-400',
        status === 'limited' && 'bg-blue-500/10 text-blue-700 dark:text-blue-400'
      )}
    >
      {status === 'ready' ? 'ready' : status === 'needs-setup' ? 'setup' : 'review'}
    </span>
  );
}

function VerificationPill({
  status,
}: {
  status: ToolVerificationResult['status'];
}) {
  return (
    <span
      className={cn(
        'text-[10px] px-1.5 py-0.5 rounded-full font-medium uppercase tracking-wide',
        status === 'verified' && 'bg-green-500/10 text-green-700 dark:text-green-400',
        status === 'needs_setup' && 'bg-amber-500/10 text-amber-700 dark:text-amber-400',
        status === 'failed' && 'bg-red-500/10 text-red-700 dark:text-red-400',
        status === 'manual_review' && 'bg-blue-500/10 text-blue-700 dark:text-blue-400'
      )}
    >
      {status === 'verified'
        ? 'verified'
        : status === 'needs_setup'
          ? 'setup needed'
          : status === 'failed'
            ? 'failed'
            : 'manual review'}
    </span>
  );
}

const CATEGORY_COLORS: Record<string, string> = {
  information: 'bg-blue-500/10 text-blue-700 dark:text-blue-400',
  orchestration: 'bg-purple-500/10 text-purple-700 dark:text-purple-400',
  notification: 'bg-amber-500/10 text-amber-700 dark:text-amber-400',
  storage: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
  scheduling: 'bg-orange-500/10 text-orange-700 dark:text-orange-400',
};

function CategoryBadge({ category }: { category: string }) {
  const colors = CATEGORY_COLORS[category] ?? 'bg-muted text-muted-foreground';
  return (
    <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full font-medium', colors)}>
      {category}
    </span>
  );
}

function CapabilityBadge({ capability }: { capability: string }) {
  return (
    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">
      {capability}
    </span>
  );
}

function displaySourceNameFromSlug(slug: string): string {
  return slug
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function suggestedConnectionNameFromSlug(
  slug: string,
  provider: 'postgres' | 'mysql'
): string {
  const base = displaySourceNameFromSlug(slug);
  return `${base} ${provider === 'postgres' ? 'Postgres' : 'MySQL'}`.trim();
}

function buildConnectionDerivedToolName(
  provider: 'postgres' | 'mysql',
  connectionName: string
): string {
  return `query_${provider}_${connectionNameToSlug(connectionName)}`;
}

function actionVerb(action: GuidedResolutionAction): string {
  switch (action.type) {
    case 'connect_ai':
      return 'Connect';
    case 'add_database_source':
      return 'Add Source';
    case 'apply_remap':
      return 'Apply';
    case 'verify_tool':
      return 'Verify';
    case 'test_connection':
      return 'Test';
    case 'open_tests':
      return 'Open Tests';
    default:
      return 'Run';
  }
}

// ============================================================================
// COMPONENT
// ============================================================================

/**
 * ConnectionsPanel shows which connections the bot needs vs what's available.
 * Supports inline connection creation and strict tool-to-source mapping.
 */
export function ConnectionsPanel({
  tools,
  connections,
  baleybotId,
  balCode,
  entitySummaries,
  isLoading,
  onConnectionCreated,
  onApplyToolRemap,
  onNavigateToTest,
  className,
}: ConnectionsPanelProps) {
  const [addFormType, setAddFormType] = useState<'ai' | 'database' | null>(null);
  const [showAdvancedDetails, setShowAdvancedDetails] = useState(false);
  const [requestedDbProvider, setRequestedDbProvider] = useState<'postgres' | 'mysql' | undefined>();
  const [requestedDbName, setRequestedDbName] = useState<string | undefined>();
  const [selectedConnectionByTool, setSelectedConnectionByTool] = useState<Record<string, string>>({});
  const [testingConnectionId, setTestingConnectionId] = useState<string | null>(null);
  const [testResultsByConnection, setTestResultsByConnection] = useState<Record<string, { success: boolean; message: string }>>({});
  const [verifyingToolName, setVerifyingToolName] = useState<string | null>(null);
  const [toolVerificationByName, setToolVerificationByName] = useState<Record<string, ToolVerificationResult>>({});
  const [advisorResult, setAdvisorResult] = useState<ConnectionAdvisorResult | null>(null);
  const [isRunningGuidedPass, setIsRunningGuidedPass] = useState(false);
  const [advisorError, setAdvisorError] = useState<string | null>(null);
  const analyzedSignatureRef = useRef<string | null>(null);

  const utils = trpc.useUtils();
  const testConnectionMutation = trpc.connections.test.useMutation();
  const verifyToolMutation = trpc.baleybots.verifyTool.useMutation();
  const analyzeConnectionsMutation = trpc.baleybots.analyzeConnections.useMutation();

  const existingNames = connections.map((c) => c.name);
  const uniqueTools = useMemo(() => [...new Set(tools)], [tools]);

  const requirements = useMemo(() => scanToolRequirements(uniqueTools), [uniqueTools]);

  const aiProviders = connections.filter(
    (c) => ['openai', 'anthropic', 'ollama'].includes(c.type) && c.status === 'connected'
  );
  const aiProviderIssues = connections.filter(
    (c) => ['openai', 'anthropic', 'ollama'].includes(c.type) && c.status !== 'connected'
  );
  const hasAiProvider = aiProviders.length > 0;

  const toolWiring = uniqueTools.map((toolName) => {
    const readiness = getToolReadinessStatus(toolName, connections);
    const requirement = requirements.find((r) => r.toolName === toolName);
    const parsed = parseConnectionTool(toolName);
    const metadata = getBuiltInToolMetadata(toolName);
    const binding = evaluateToolConnectionBinding(toolName, connections);

    const expectedSlug = parsed.connectionSlug ?? requirement?.connectionSlug;
    const expectedType = (parsed.connectionType ?? requirement?.connectionType) as
      | 'postgres'
      | 'mysql'
      | null;

    const exactConnection = expectedSlug && expectedType
      ? connections.find(
          (conn) =>
            conn.type === expectedType &&
            connectionNameToSlug(conn.name) === expectedSlug
        )
      : undefined;

    return {
      toolName,
      readiness,
      requirement,
      parsed,
      metadata,
      binding,
      expectedSlug,
      expectedType,
      exactConnection,
    };
  });
  const toolWiringByName = new Map(toolWiring.map((tool) => [tool.toolName, tool] as const));

  const unresolvedToolWiring = toolWiring.filter((tool) => tool.readiness.status !== 'ready');
  const unresolvedNonDatabaseTools = unresolvedToolWiring.filter(
    (tool) => tool.expectedType !== 'postgres' && tool.expectedType !== 'mysql'
  );
  const nonDatabaseToolWiring = toolWiring.filter(
    (tool) => tool.expectedType !== 'postgres' && tool.expectedType !== 'mysql'
  );

  const workspaceConnectionHealth = connections.map((conn) => ({
    ...conn,
    usedBy: toolWiring
      .filter((tool) => {
        if (!tool.expectedType) return false;
        if (!tool.expectedSlug) {
          return conn.type === tool.expectedType;
        }
        return (
          conn.type === tool.expectedType &&
          connectionNameToSlug(conn.name) === tool.expectedSlug
        );
      })
      .map((tool) => tool.toolName),
  }));

  const allMet = hasAiProvider && unresolvedToolWiring.length === 0;
  const verificationCompleteStatuses = new Set<ToolVerificationResult['status']>([
    'verified',
    'manual_review',
  ]);
  const verifiedToolCount = uniqueTools.filter((toolName) =>
    verificationCompleteStatuses.has(toolVerificationByName[toolName]?.status ?? 'failed')
  ).length;
  const setupProgress = [
    {
      id: 'runtime',
      label: 'AI provider',
      detail: hasAiProvider
        ? `${aiProviders.length} provider${aiProviders.length === 1 ? '' : 's'} connected`
        : 'Connect OpenAI, Anthropic, or Ollama',
      complete: hasAiProvider,
    },
    {
      id: 'sources',
      label: 'Tools and data sources',
      detail:
        unresolvedToolWiring.length === 0
          ? 'All tools are mapped to the right source'
          : `${unresolvedToolWiring.length} binding${unresolvedToolWiring.length === 1 ? '' : 's'} need attention`,
      complete: unresolvedToolWiring.length === 0,
    },
    {
      id: 'verification',
      label: 'Health checks',
      detail:
        verifiedToolCount > 0
          ? `${verifiedToolCount}/${uniqueTools.length} tools verified`
          : 'Run checks to confirm credentials and access',
      complete: uniqueTools.length === 0 || verifiedToolCount >= uniqueTools.length,
    },
  ] as const;
  const completedSetupSteps = setupProgress.filter((step) => step.complete).length;
  const setupCompletionPercent = setupProgress.length > 0
    ? Math.round((completedSetupSteps / setupProgress.length) * 100)
    : 0;
  const hasAdvancedSections =
    workspaceConnectionHealth.length > 0 ||
    requirements.length > 0;
  const advisorRecommendations = advisorResult?.recommendations ?? [];
  const advisorWarnings = advisorResult?.warnings ?? [];
  const advisorDatabaseInsights = advisorResult?.analysis?.databases ?? [];
  const showAdvisorInsights =
    Boolean(advisorResult?.analysis?.aiProvider) ||
    advisorDatabaseInsights.length > 0 ||
    advisorRecommendations.length > 0 ||
    advisorWarnings.length > 0;

  const databaseToolWiring = toolWiring.filter(
    (tool) => tool.expectedType === 'postgres' || tool.expectedType === 'mysql'
  );

  const remapPlans: ToolRemapPlan[] = databaseToolWiring
    .map((tool) => {
      if (!tool.expectedType) return null;
      const selectedConnectionId =
        selectedConnectionByTool[tool.toolName] ??
        tool.exactConnection?.id ??
        '';
      if (!selectedConnectionId) return null;
      const selectedConnection = connections.find((conn) => conn.id === selectedConnectionId);
      if (!selectedConnection || selectedConnection.type !== tool.expectedType) return null;
      const nextTool = buildConnectionDerivedToolName(tool.expectedType, selectedConnection.name);
      if (nextTool === tool.toolName) return null;
      return {
        fromTool: tool.toolName,
        toTool: nextTool,
      };
    })
    .filter((plan): plan is ToolRemapPlan => Boolean(plan));

  function buildGuidedActions(args: {
    advisor: ConnectionAdvisorResult | null;
  }): GuidedResolutionAction[] {
    const actions: GuidedResolutionAction[] = [];
    const seen = new Set<string>();

    const pushAction = (action: GuidedResolutionAction) => {
      if (seen.has(action.id)) return;
      seen.add(action.id);
      actions.push(action);
    };

    if (!hasAiProvider) {
      const recommendedProvider = args.advisor?.analysis?.aiProvider?.recommended;
      pushAction({
        id: 'connect-ai-runtime',
        type: 'connect_ai',
        title: 'Connect AI Runtime',
        description: recommendedProvider
          ? `Add a ${recommendedProvider} provider so tools and tests can execute.`
          : 'Add OpenAI, Anthropic, or Ollama so tools and tests can execute.',
      });
    }

    const handledSources = new Set<string>();
    for (const tool of databaseToolWiring) {
      if (tool.readiness.status === 'ready' || !tool.expectedType) continue;
      const sourceKey = `${tool.expectedType}:${tool.expectedSlug ?? 'unspecified'}`;
      if (handledSources.has(sourceKey)) continue;
      handledSources.add(sourceKey);

      pushAction({
        id: `add-source-${sourceKey}`,
        type: 'add_database_source',
        title: tool.expectedSlug
          ? `Add ${tool.expectedType} source: ${displaySourceNameFromSlug(tool.expectedSlug)}`
          : `Add ${tool.expectedType} source`,
        description: tool.expectedSlug
          ? `Create or reconnect a ${tool.expectedType} source that matches "${tool.expectedSlug}", then re-verify tools.`
          : `Create a connected ${tool.expectedType} source for database tools.`,
        dbType: tool.expectedType,
        sourceSlug: tool.expectedSlug,
      });
    }

    if (onApplyToolRemap && remapPlans.length > 0) {
      pushAction({
        id: 'apply-remaps',
        type: 'apply_remap',
        title: `Apply ${remapPlans.length} BAL tool mapping change${remapPlans.length === 1 ? '' : 's'}`,
        description: 'Update BAL tool bindings to match your selected connection sources.',
      });
    }

    const mergedVerification = {
      ...toolVerificationByName,
    };

    for (const tool of toolWiring) {
      const verification = mergedVerification[tool.toolName];
      if (!verification) {
        if (tool.readiness.status !== 'ready') {
          pushAction({
            id: `verify-${tool.toolName}`,
            type: 'verify_tool',
            title: `Verify ${tool.toolName}`,
            description: 'Run a runtime verification check and get precise remediation guidance.',
            toolName: tool.toolName,
          });
        }
        continue;
      }

      if (verification.status === 'failed' || verification.status === 'needs_setup') {
        if (verification.connection?.id) {
          pushAction({
            id: `test-connection-${verification.connection.id}`,
            type: 'test_connection',
            title: `Test ${verification.connection.name}`,
            description: 'Re-test this connection and re-run tool verification after fixing credentials.',
            connectionId: verification.connection.id,
          });
        } else {
          pushAction({
            id: `reverify-${tool.toolName}`,
            type: 'verify_tool',
            title: `Re-verify ${tool.toolName}`,
            description: verification.summary,
            toolName: tool.toolName,
          });
        }
      }
    }

    const hasVerificationForAllTools =
      toolWiring.length === 0 ||
      toolWiring.every((tool) => {
        const verification = mergedVerification[tool.toolName];
        return Boolean(verification && verificationCompleteStatuses.has(verification.status));
      });

    if (allMet && hasVerificationForAllTools && onNavigateToTest) {
      pushAction({
        id: 'open-tests',
        type: 'open_tests',
        title: 'Run End-to-End Tests',
        description: 'Connections look healthy. Move to Testing to validate expected behavior.',
      });
    }

    return actions;
  }

  const guidedActions = buildGuidedActions({ advisor: advisorResult });
  const primaryGuidedAction = guidedActions[0] ?? null;
  const secondaryGuidedActions = guidedActions.slice(1, 3);
  const statusSummary = allMet
    ? 'Everything needed for this stage is configured.'
    : `Complete ${setupProgress.length - completedSetupSteps} remaining checklist item${setupProgress.length - completedSetupSteps === 1 ? '' : 's'}.`;

  async function runAdvisorAnalysis(): Promise<ConnectionAdvisorResult | null> {
    if (!baleybotId || !balCode || !entitySummaries || entitySummaries.length === 0) {
      setAdvisorError('Save the bot and generate entities before running AI connection analysis.');
      return null;
    }

    setAdvisorError(null);
    try {
      const analysisResult = (await analyzeConnectionsMutation.mutateAsync({
        baleybotId,
        balCode,
        entities: entitySummaries.map((entity) => ({
          name: entity.name,
          tools: entity.tools,
        })),
      })) as ConnectionAdvisorResult;

      setAdvisorResult(analysisResult);
      return analysisResult;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'AI connection analysis failed.';
      setAdvisorError(message);
      return null;
    }
  }

  async function runGuidedConnectionPass() {
    setIsRunningGuidedPass(true);
    try {
      await runAdvisorAnalysis();
      await handleVerifyAllTools();
    } finally {
      setIsRunningGuidedPass(false);
    }
  }

  function handleGuidedAction(action: GuidedResolutionAction) {
    switch (action.type) {
      case 'connect_ai':
        setAddFormType('ai');
        break;
      case 'add_database_source':
        setRequestedDbProvider(action.dbType);
        setRequestedDbName(
          action.sourceSlug && action.dbType
            ? suggestedConnectionNameFromSlug(action.sourceSlug, action.dbType)
            : undefined
        );
        setAddFormType('database');
        break;
      case 'apply_remap':
        handleApplyRemaps();
        break;
      case 'verify_tool':
        if (!action.toolName) break;
        {
          const wiring = toolWiringByName.get(action.toolName);
          const mappedConnectionId = wiring
            ? selectedConnectionByTool[action.toolName] ?? wiring.exactConnection?.id
            : undefined;
          void handleVerifyTool(action.toolName, mappedConnectionId);
        }
        break;
      case 'test_connection':
        if (action.connectionId) {
          void handleTestConnection(action.connectionId);
        }
        break;
      case 'open_tests':
        onNavigateToTest?.();
        break;
      default:
        break;
    }
  }

  useEffect(() => {
    if (!baleybotId || !balCode || !entitySummaries || entitySummaries.length === 0) return;

    const entitySignature = entitySummaries
      .map((entity) => `${entity.name}:${entity.tools.join(',')}`)
      .join('|');
    const connectionSignature = connections
      .map((connection) => `${connection.id}:${connection.type}:${connection.status}`)
      .join('|');
    const signature = `${baleybotId}:${balCode}:${entitySignature}:${connectionSignature}`;
    if (analyzedSignatureRef.current === signature) return;
    analyzedSignatureRef.current = signature;

    void runAdvisorAnalysis();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baleybotId, balCode, connections, entitySummaries]);

  async function handleTestConnection(connectionId: string) {
    setTestingConnectionId(connectionId);
    try {
      const result = await testConnectionMutation.mutateAsync({ id: connectionId });
      setTestResultsByConnection((prev) => ({
        ...prev,
        [connectionId]: {
          success: Boolean(result.success),
          message: result.message || (result.success ? 'Connection verified' : 'Connection failed'),
        },
      }));
      await utils.connections.list.invalidate();
      onConnectionCreated?.();
    } catch (error) {
      setTestResultsByConnection((prev) => ({
        ...prev,
        [connectionId]: {
          success: false,
          message: error instanceof Error ? error.message : 'Connection test failed',
        },
      }));
    } finally {
      setTestingConnectionId(null);
    }
  }

  async function handleVerifyTool(
    toolName: string,
    mappedConnectionId?: string
  ): Promise<ToolVerificationResult> {
    setVerifyingToolName(toolName);
    try {
      const result = await verifyToolMutation.mutateAsync({
        toolName,
        ...(mappedConnectionId ? { mappedConnectionId } : {}),
      });
      const typedResult = result as ToolVerificationResult;
      setToolVerificationByName((prev) => ({
        ...prev,
        [toolName]: typedResult,
      }));
      return typedResult;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Tool verification failed';
      const failedResult: ToolVerificationResult = {
        toolName,
        status: 'failed',
        checkType: 'runtime',
        summary: message,
        details: ['Review connection requirements and try again.'],
        probe: {
          attempted: true,
          success: false,
          message,
        },
      };
      setToolVerificationByName((prev) => ({
        ...prev,
        [toolName]: failedResult,
      }));
      return failedResult;
    } finally {
      setVerifyingToolName(null);
    }
  }

  function handleApplyRemaps() {
    if (remapPlans.length === 0) return;
    onApplyToolRemap?.(remapPlans);
  }

  function handleFormSuccess() {
    setAddFormType(null);
    setRequestedDbName(undefined);
    setSelectedConnectionByTool({});
    onConnectionCreated?.();
  }

  function handleVerificationSetupAction(toolName: string) {
    const wiring = toolWiringByName.get(toolName);
    if (!wiring) return;

    if (toolName === 'web_search' && !hasAiProvider) {
      setAddFormType('ai');
      return;
    }

    if (wiring.expectedType === 'postgres' || wiring.expectedType === 'mysql') {
      setRequestedDbProvider(wiring.expectedType);
      setRequestedDbName(
        wiring.expectedSlug
          ? suggestedConnectionNameFromSlug(wiring.expectedSlug, wiring.expectedType)
          : undefined
      );
      setAddFormType('database');
    }
  }

  async function handleVerifyAllTools(): Promise<Record<string, ToolVerificationResult>> {
    const verificationResults: Record<string, ToolVerificationResult> = {};
    for (const tool of toolWiring) {
      if (toolVerificationByName[tool.toolName]?.status === 'verified') {
        continue;
      }

      const selectedConnectionId =
        selectedConnectionByTool[tool.toolName] ?? tool.exactConnection?.id ?? undefined;
      const result = await handleVerifyTool(tool.toolName, selectedConnectionId);
      verificationResults[tool.toolName] = result;
    }
    return verificationResults;
  }

  if (isLoading) {
    return (
      <div className={cn('space-y-4', className)}>
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    );
  }

  return (
    <div className={cn('space-y-6', className)}>
      <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="text-sm font-medium flex items-center gap-1.5">
              <Sparkles className="h-4 w-4 text-primary" />
              AI Setup Assistant
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Stage 2 of 4: connect runtime and data sources, then verify access.
            </p>
            <p className="text-[11px] text-muted-foreground mt-1">
              {statusSummary}
            </p>
          </div>
          <div className="text-xs text-muted-foreground">
            {completedSetupSteps}/{setupProgress.length} complete
          </div>
        </div>

        {primaryGuidedAction ? (
          <div className="rounded-md border border-primary/30 bg-background/80 px-3 py-2.5">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Recommended next action</p>
            <div className="flex items-start justify-between gap-3 mt-1">
              <div className="min-w-0">
                <p className="text-sm font-medium">{primaryGuidedAction.title}</p>
                <p className="text-xs text-muted-foreground mt-1">{primaryGuidedAction.description}</p>
              </div>
              <Button
                size="sm"
                className="h-7 text-[11px] shrink-0"
                onClick={() => handleGuidedAction(primaryGuidedAction)}
              >
                {actionVerb(primaryGuidedAction)}
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">
              {allMet
                ? 'No blockers detected. Continue to testing.'
                : 'Run analysis to refresh a prioritized recommendation.'}
            </p>
            {allMet && onNavigateToTest && (
              <Button size="sm" className="h-7 text-[11px]" onClick={onNavigateToTest}>
                Continue to Testing
                <ArrowRight className="h-3.5 w-3.5 ml-1" />
              </Button>
            )}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-[11px]"
            onClick={() => void runGuidedConnectionPass()}
            disabled={
              isRunningGuidedPass ||
              Boolean(verifyingToolName) ||
              testingConnectionId !== null ||
              !baleybotId ||
              !balCode
            }
          >
            {isRunningGuidedPass ? (
              <>
                <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                Running analysis
              </>
            ) : (
              <>
                <ShieldCheck className="h-3.5 w-3.5 mr-1" />
                Refresh recommendation
              </>
            )}
          </Button>
          {uniqueTools.length > 0 && (
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-[11px]"
              onClick={handleVerifyAllTools}
              disabled={Boolean(verifyingToolName)}
            >
              {verifyingToolName ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                  Verifying
                </>
              ) : (
                <>
                  <ShieldCheck className="h-3.5 w-3.5 mr-1" />
                  Verify all tools
                </>
              )}
            </Button>
          )}
        </div>

        {secondaryGuidedActions.length > 0 && (
          <details className="rounded-md border border-border/50 bg-background/60 px-3 py-2">
            <summary className="cursor-pointer text-xs font-medium text-muted-foreground hover:text-foreground">
              Need an alternate action?
            </summary>
            <div className="space-y-2 pt-2">
              {secondaryGuidedActions.map((action) => (
                <div
                  key={action.id}
                  className="rounded-md border border-border/40 bg-background/70 px-2.5 py-2 flex items-start justify-between gap-3"
                >
                  <div className="min-w-0">
                    <p className="text-xs font-medium">{action.title}</p>
                    <p className="text-[11px] text-muted-foreground mt-1">{action.description}</p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-[11px] shrink-0"
                    onClick={() => handleGuidedAction(action)}
                  >
                    {actionVerb(action)}
                  </Button>
                </div>
              ))}
            </div>
          </details>
        )}

        {advisorError && (
          <p className="text-xs text-red-600 dark:text-red-400">{advisorError}</p>
        )}

        {showAdvisorInsights && (
          <details className="rounded-md border border-border/50 bg-background/60 px-3 py-2">
            <summary className="cursor-pointer text-xs font-medium text-muted-foreground hover:text-foreground">
              Why BaleyBot recommended this
            </summary>
            <div className="space-y-2 pt-2">
              {advisorResult?.analysis?.aiProvider && (
                <p className="text-xs">
                  <span className="font-medium">AI Runtime:</span>{' '}
                  {advisorResult.analysis.aiProvider.reason}
                </p>
              )}
              {advisorDatabaseInsights.length > 0 && (
                <div className="space-y-1">
                  {advisorDatabaseInsights.map((db) => (
                    <p key={`${db.type}-${db.tools.join(',')}`} className="text-xs">
                      <span className="font-medium capitalize">{db.type}:</span>{' '}
                      {db.configHints || `Required by ${db.tools.join(', ')}`}
                    </p>
                  ))}
                </div>
              )}
              {advisorRecommendations.length > 0 && (
                <div>
                  <p className="text-[11px] font-medium text-muted-foreground mb-1">Recommendations</p>
                  <ul className="space-y-1">
                    {advisorRecommendations.map((rec, idx) => (
                      <li key={`${rec}-${idx}`} className="text-xs text-muted-foreground">
                        - {rec}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {advisorWarnings.length > 0 && (
                <div>
                  <p className="text-[11px] font-medium text-amber-700 dark:text-amber-400 mb-1">Warnings</p>
                  <ul className="space-y-1">
                    {advisorWarnings.map((warning, idx) => (
                      <li key={`${warning}-${idx}`} className="text-xs text-amber-700 dark:text-amber-400">
                        - {warning}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </details>
        )}
      </div>

      <div className="rounded-lg border border-border/50 bg-muted/20 p-3 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="text-sm font-medium flex items-center gap-1.5">
              <Gauge className="h-4 w-4 text-muted-foreground" />
              Connection checklist
            </p>
            <p className="text-xs text-muted-foreground">
              Follow this order to avoid duplicate setup work.
            </p>
          </div>
          <span className="text-xs font-medium text-muted-foreground">
            {setupCompletionPercent}%
          </span>
        </div>
        <div className="h-1.5 rounded-full bg-muted overflow-hidden">
          <div
            className={cn(
              'h-full rounded-full transition-all duration-300',
              setupCompletionPercent >= 100 ? 'bg-green-500' : 'bg-primary'
            )}
            style={{ width: `${setupCompletionPercent}%` }}
          />
        </div>
        <div className="grid gap-2 sm:grid-cols-3">
          {setupProgress.map((step, index) => (
            <div
              key={step.id}
              className={cn(
                'rounded-md border px-2.5 py-2',
                step.complete
                  ? 'border-green-500/30 bg-green-500/5'
                  : 'border-border/60 bg-background/60'
              )}
            >
              <p className="text-[11px] font-medium flex items-center gap-1.5">
                {step.complete ? (
                  <CheckCircle2 className="h-3.5 w-3.5 text-green-600 dark:text-green-400" />
                ) : (
                  <AlertCircle className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
                )}
                {`Step ${index + 1}: ${step.label}`}
              </p>
              <p className="text-[11px] text-muted-foreground mt-1">{step.detail}</p>
            </div>
          ))}
        </div>
      </div>

      {/* AI Provider section */}
      <div>
        <h3 className="text-sm font-medium mb-2">Step 1: Connect an AI Provider</h3>
        <p className="text-xs text-muted-foreground mb-2.5">
          This is the runtime your BaleyBot uses for reasoning, generation, and tool decisions.
        </p>
        <div className="rounded-lg border border-border/50 p-3">
          {hasAiProvider ? (
            <div className="space-y-2">
              {aiProviders.map((provider) => (
                <div key={provider.id} className="flex items-center gap-2 text-sm">
                  <Bot className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="w-2 h-2 rounded-full bg-green-500 shrink-0" />
                  <span className="font-medium">{provider.name}</span>
                  <span className="text-xs text-muted-foreground">({provider.type})</span>
                  {provider.isDefault && (
                    <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-full ml-auto">
                      default
                    </span>
                  )}
                </div>
              ))}
              {aiProviderIssues.length > 0 && (
                <p className="text-xs text-muted-foreground pt-1 border-t border-border/30">
                  Also detected {aiProviderIssues.length} provider(s) needing attention.
                </p>
              )}
            </div>
          ) : (
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0" />
                <span className="text-sm text-muted-foreground">No AI provider connected</span>
              </div>
              <Button size="sm" variant="outline" onClick={() => setAddFormType('ai')}>
                <Plus className="h-3.5 w-3.5 mr-1" />
                Add
              </Button>
            </div>
          )}
        </div>
        {addFormType === 'ai' && (
          <div className="mt-3">
            <InlineConnectionForm
              mode="ai"
              existingNames={existingNames}
              onSuccess={handleFormSuccess}
              onCancel={() => setAddFormType(null)}
            />
          </div>
        )}
      </div>

      {/* Tool controls for non-database tools */}
      {nonDatabaseToolWiring.length > 0 && (
        <div>
          <h3 className="text-sm font-medium mb-2 flex items-center gap-1.5">
            <Sparkles className="h-4 w-4 text-muted-foreground" />
            Step 2: Review Tool Behavior
          </h3>
          <p className="text-xs text-muted-foreground mb-2.5">
            Confirm the purpose of each tool, then run verification so failures are caught before testing.
          </p>
          <div className="space-y-2">
            {nonDatabaseToolWiring.map((tool) => {
              const verificationResult = toolVerificationByName[tool.toolName];
              const metadata = tool.metadata;
              const selectedConnectionId =
                selectedConnectionByTool[tool.toolName] ?? tool.exactConnection?.id ?? undefined;

              return (
                <div key={tool.toolName} className="rounded-lg border border-border/50 p-3 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Wrench className="h-3.5 w-3.5 text-muted-foreground" />
                        <p className="font-mono text-xs">{tool.toolName}</p>
                        <StatusPill status={tool.readiness.status} />
                        {verificationResult && <VerificationPill status={verificationResult.status} />}
                        {metadata && <CategoryBadge category={metadata.category} />}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        {metadata?.description ?? tool.readiness.note}
                      </p>
                      {tool.binding.reason && (
                        <p className="text-[11px] text-muted-foreground mt-1">{tool.binding.reason}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-[11px]"
                        onClick={() => handleVerifyTool(tool.toolName, selectedConnectionId)}
                        disabled={verifyingToolName === tool.toolName}
                      >
                        {verifyingToolName === tool.toolName ? (
                          <>
                            <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                            Verifying
                          </>
                        ) : (
                          <>
                            <ShieldCheck className="h-3.5 w-3.5 mr-1" />
                            Verify
                          </>
                        )}
                      </Button>
                      {tool.readiness.status !== 'ready' && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-[11px]"
                          onClick={() => handleVerificationSetupAction(tool.toolName)}
                        >
                          Resolve
                        </Button>
                      )}
                    </div>
                  </div>

                  {metadata?.capabilities && metadata.capabilities.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {metadata.capabilities.map((capability) => (
                        <CapabilityBadge key={capability} capability={capability} />
                      ))}
                    </div>
                  )}

                  {verificationResult && (
                    <div
                      className={cn(
                        'rounded-md border p-2 text-xs',
                        verificationResult.status === 'verified' &&
                          'border-green-500/30 bg-green-500/5',
                        verificationResult.status === 'needs_setup' &&
                          'border-amber-500/30 bg-amber-500/5',
                        verificationResult.status === 'failed' &&
                          'border-red-500/30 bg-red-500/5',
                        verificationResult.status === 'manual_review' &&
                          'border-blue-500/30 bg-blue-500/5'
                      )}
                    >
                      <p>{verificationResult.summary}</p>
                      {verificationResult.details && verificationResult.details.length > 0 && (
                        <div className="mt-1 space-y-0.5">
                          {verificationResult.details.map((detail, index) => (
                            <p key={index} className="text-[11px] text-muted-foreground">- {detail}</p>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {metadata && (
                    <details className="text-xs">
                      <summary className="cursor-pointer text-muted-foreground hover:text-foreground transition-colors">
                        Tool contract
                      </summary>
                      <pre className="mt-1 rounded bg-muted/40 p-2 overflow-x-auto">
{JSON.stringify(metadata.inputSchema, null, 2)}
                      </pre>
                    </details>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Data source wiring section */}
      {databaseToolWiring.length > 0 && (
        <div>
          <h3 className="text-sm font-medium mb-2">Step 3: Map Data Sources</h3>
          <p className="text-xs text-muted-foreground mb-2.5">
            Match each database tool to the correct workspace connection, then apply mapping updates.
          </p>
          <div className="space-y-2">
            {databaseToolWiring.map((tool) => {
              const expectedLabel = tool.expectedSlug
                ? displaySourceNameFromSlug(tool.expectedSlug)
                : null;
              const dbType = tool.expectedType;
              const sameTypeConnections = dbType
                ? connections.filter((conn) => conn.type === dbType)
                : [];
              const selectedConnectionId =
                selectedConnectionByTool[tool.toolName] ??
                tool.exactConnection?.id ??
                '';
              const selectedConnection = sameTypeConnections.find(
                (conn) => conn.id === selectedConnectionId
              );
              const targetToolName =
                dbType && selectedConnection
                  ? buildConnectionDerivedToolName(dbType, selectedConnection.name)
                  : tool.toolName;
              const willRemap = targetToolName !== tool.toolName;
              const verificationResult = toolVerificationByName[tool.toolName];
              const mappedConnectionId = selectedConnectionId || tool.exactConnection?.id;

              return (
                <div key={tool.toolName} className="rounded-lg border border-border/50 p-3 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <Database className="h-3.5 w-3.5 text-muted-foreground" />
                        <p className="font-mono text-xs truncate">{tool.toolName}</p>
                        <StatusPill status={tool.readiness.status} />
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">{tool.readiness.note}</p>
                      {expectedLabel && (
                        <p className="text-xs text-muted-foreground">
                          Expected source: <span className="font-medium text-foreground">{expectedLabel}</span>
                        </p>
                      )}
                      {tool.exactConnection && (
                        <p className="text-xs text-muted-foreground">
                          Matched connection:{' '}
                          <span className="font-medium text-foreground">
                            {tool.exactConnection.name}
                          </span>
                          {tool.exactConnection.status !== 'connected'
                            ? ` (${tool.exactConnection.status})`
                            : ''}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {willRemap && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-500/10 text-blue-700 dark:text-blue-400 font-medium">
                          pending remap
                        </span>
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-[11px]"
                        onClick={() => handleVerifyTool(tool.toolName, mappedConnectionId || undefined)}
                        disabled={verifyingToolName === tool.toolName}
                      >
                        {verifyingToolName === tool.toolName ? (
                          <>
                            <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                            Verifying
                          </>
                        ) : (
                          'Verify Tool'
                        )}
                      </Button>
                      {tool.readiness.status !== 'ready' && dbType && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setRequestedDbProvider(dbType);
                            if (tool.expectedSlug) {
                              setRequestedDbName(
                                suggestedConnectionNameFromSlug(tool.expectedSlug, dbType)
                              );
                            } else {
                              setRequestedDbName(undefined);
                            }
                            setAddFormType('database');
                          }}
                        >
                          <Plus className="h-3.5 w-3.5 mr-1" />
                          Add Source
                        </Button>
                      )}
                    </div>
                  </div>

                  {verificationResult && (
                    <div
                      className={cn(
                        'rounded-md border p-2.5 space-y-1.5',
                        verificationResult.status === 'verified' &&
                          'border-green-500/30 bg-green-500/5',
                        verificationResult.status === 'needs_setup' &&
                          'border-amber-500/30 bg-amber-500/5',
                        verificationResult.status === 'failed' &&
                          'border-red-500/30 bg-red-500/5',
                        verificationResult.status === 'manual_review' &&
                          'border-blue-500/30 bg-blue-500/5'
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <VerificationPill status={verificationResult.status} />
                        <span className="text-[11px] text-muted-foreground">
                          {verificationResult.checkType}
                        </span>
                      </div>
                      <p className="text-xs">{verificationResult.summary}</p>
                      {verificationResult.details && verificationResult.details.length > 0 && (
                        <ul className="space-y-0.5">
                          {verificationResult.details.map((detail, index) => (
                            <li key={index} className="text-[11px] text-muted-foreground">
                              - {detail}
                            </li>
                          ))}
                        </ul>
                      )}
                      <div className="flex items-center gap-2 pt-1">
                        {verificationResult.status === 'needs_setup' && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-[11px]"
                            onClick={() => handleVerificationSetupAction(tool.toolName)}
                          >
                            Resolve Setup
                          </Button>
                        )}
                        {verificationResult.connection && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-[11px]"
                            disabled={testingConnectionId === verificationResult.connection.id}
                            onClick={() => handleTestConnection(verificationResult.connection!.id)}
                          >
                            {testingConnectionId === verificationResult.connection.id ? (
                              <>
                                <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                                Testing
                              </>
                            ) : (
                              'Test Connection'
                            )}
                          </Button>
                        )}
                      </div>
                    </div>
                  )}

                  {dbType && sameTypeConnections.length > 0 && (
                    <div className="rounded-md border border-border/40 bg-muted/20 p-2.5 space-y-2">
                      <p className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium">
                        Source mapping
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <div className="space-y-1">
                          <label className="text-[11px] text-muted-foreground">Mapped connection</label>
                          <select
                            value={selectedConnectionId}
                            onChange={(e) =>
                              setSelectedConnectionByTool((prev) => ({
                                ...prev,
                                [tool.toolName]: e.target.value,
                              }))
                            }
                            className="w-full px-2.5 py-1.5 text-xs rounded-md border border-border/50 bg-background focus:outline-none focus:ring-2 focus:ring-primary/20"
                          >
                            <option value="">Select source...</option>
                            {sameTypeConnections.map((conn) => (
                              <option key={conn.id} value={conn.id}>
                                {conn.name} ({conn.status})
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="space-y-1">
                          <label className="text-[11px] text-muted-foreground">Resulting tool</label>
                          <div className="px-2.5 py-1.5 text-xs rounded-md border border-border/50 bg-background font-mono">
                            {targetToolName}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {addFormType === 'database' && (
            <div className="mt-3">
              <InlineConnectionForm
                mode="database"
                defaultDbProvider={requestedDbProvider}
                suggestedName={requestedDbName}
                existingNames={existingNames}
                onSuccess={handleFormSuccess}
                onCancel={() => setAddFormType(null)}
              />
            </div>
          )}
        </div>
      )}

      {hasAdvancedSections && (
        <div className="rounded-lg border border-border/50 bg-muted/20 p-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-sm font-medium flex items-center gap-1.5">
                <SlidersHorizontal className="h-4 w-4 text-muted-foreground" />
                Diagnostics
              </p>
              <p className="text-xs text-muted-foreground">
                Manual checks for workspace connections and low-level troubleshooting.
              </p>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowAdvancedDetails((prev) => !prev)}
            >
              {showAdvancedDetails ? 'Hide' : 'Advanced troubleshooting'}
            </Button>
          </div>
          {!showAdvancedDetails && unresolvedNonDatabaseTools.length > 0 && (
            <p className="text-xs text-amber-700 dark:text-amber-400 mt-2">
              {unresolvedNonDatabaseTools.length} non-database tool binding(s) still need setup.
            </p>
          )}
        </div>
      )}

      {/* Workspace connection health */}
      {showAdvancedDetails && workspaceConnectionHealth.length > 0 && (
        <div>
          <h3 className="text-sm font-medium mb-2">Workspace Connections</h3>
          <div className="rounded-lg border border-border/50 divide-y divide-border/30">
            {workspaceConnectionHealth.map((conn) => (
              <div key={conn.id} className="px-3 py-2.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className={cn(
                        'w-2 h-2 rounded-full shrink-0',
                        conn.status === 'connected'
                          ? 'bg-green-500'
                          : conn.status === 'error'
                            ? 'bg-red-500'
                            : 'bg-amber-500'
                      )}
                    />
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{conn.name}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {conn.type} • {conn.status}
                        {conn.usedBy.length > 0
                          ? ` • used by ${conn.usedBy.join(', ')}`
                          : ' • currently unused'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-[11px]"
                      disabled={testingConnectionId === conn.id}
                      onClick={() => handleTestConnection(conn.id)}
                    >
                      {testingConnectionId === conn.id ? (
                        <>
                          <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                          Testing
                        </>
                      ) : (
                        'Test'
                      )}
                    </Button>
                    {conn.isDefault && (
                      <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-full">
                        default
                      </span>
                    )}
                  </div>
                </div>
                {testResultsByConnection[conn.id] && (
                  <p
                    className={cn(
                      'text-[11px] mt-1',
                      testResultsByConnection[conn.id]!.success
                        ? 'text-green-600 dark:text-green-400'
                        : 'text-red-600 dark:text-red-400'
                    )}
                  >
                    {testResultsByConnection[conn.id]!.message}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <Link
        href={ROUTES.connections.list}
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        Open full Connections manager
        <ExternalLink className="h-3 w-3" />
      </Link>
    </div>
  );
}
