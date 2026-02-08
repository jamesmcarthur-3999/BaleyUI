// apps/web/src/components/creator/ConnectionsPanel.tsx
'use client';

import { useMemo, useState } from 'react';
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
  getConnectionSummary,
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

interface ConnectionsPanelProps {
  /** All tools used by this bot's entities */
  tools: string[];
  /** Connections available in the workspace */
  connections: ConnectionData[];
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

function StatusDot({ status }: { status: ToolReadinessInfo['status'] }) {
  return (
    <span
      className={cn(
        'w-2 h-2 rounded-full shrink-0',
        status === 'ready' && 'bg-green-500',
        status === 'needs-setup' && 'bg-amber-500',
        status === 'limited' && 'bg-blue-500'
      )}
    />
  );
}

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

  const utils = trpc.useUtils();
  const testConnectionMutation = trpc.connections.test.useMutation();
  const verifyToolMutation = trpc.baleybots.verifyTool.useMutation();

  const existingNames = connections.map((c) => c.name);
  const uniqueTools = useMemo(() => [...new Set(tools)], [tools]);

  const requirements = useMemo(() => scanToolRequirements(uniqueTools), [uniqueTools]);
  const summary = useMemo(() => getConnectionSummary(uniqueTools), [uniqueTools]);

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

  const requiredStatus = summary.required.map((req) => {
    const match = connections.find(
      (c) => c.type === req.connectionType && c.status === 'connected'
    );

    return {
      ...req,
      met: !!match,
      connectionName: match?.name,
    };
  });

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
  const verifiedToolCount = uniqueTools.filter(
    (toolName) => toolVerificationByName[toolName]?.status === 'verified'
  ).length;
  const setupProgress = [
    {
      id: 'runtime',
      label: 'Runtime provider',
      detail: hasAiProvider
        ? `${aiProviders.length} provider${aiProviders.length === 1 ? '' : 's'} connected`
        : 'Connect OpenAI, Anthropic, or Ollama',
      complete: hasAiProvider,
    },
    {
      id: 'sources',
      label: 'Tool-source wiring',
      detail:
        unresolvedToolWiring.length === 0
          ? 'All tools have valid bindings'
          : `${unresolvedToolWiring.length} binding${unresolvedToolWiring.length === 1 ? '' : 's'} need attention`,
      complete: unresolvedToolWiring.length === 0,
    },
    {
      id: 'verification',
      label: 'Tool verification',
      detail:
        verifiedToolCount > 0
          ? `${verifiedToolCount}/${uniqueTools.length} tools verified`
          : 'Run verification checks for confidence',
      complete: uniqueTools.length === 0 || verifiedToolCount >= uniqueTools.length,
    },
  ] as const;
  const completedSetupSteps = setupProgress.filter((step) => step.complete).length;
  const setupCompletionPercent = setupProgress.length > 0
    ? Math.round((completedSetupSteps / setupProgress.length) * 100)
    : 0;
  const hasAdvancedSections =
    workspaceConnectionHealth.length > 0 ||
    requiredStatus.length > 0 ||
    requirements.length > 0;

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

  async function handleVerifyTool(toolName: string, mappedConnectionId?: string) {
    setVerifyingToolName(toolName);
    try {
      const result = await verifyToolMutation.mutateAsync({
        toolName,
        ...(mappedConnectionId ? { mappedConnectionId } : {}),
      });
      setToolVerificationByName((prev) => ({
        ...prev,
        [toolName]: result as ToolVerificationResult,
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Tool verification failed';
      setToolVerificationByName((prev) => ({
        ...prev,
        [toolName]: {
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
        },
      }));
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

  function handleOpenFirstMissingDatabaseSource() {
    const missingDbTool = databaseToolWiring.find(
      (tool) => tool.readiness.status !== 'ready' && tool.expectedType
    );
    if (!missingDbTool?.expectedType) return;

    setRequestedDbProvider(missingDbTool.expectedType);
    setRequestedDbName(
      missingDbTool.expectedSlug
        ? suggestedConnectionNameFromSlug(missingDbTool.expectedSlug, missingDbTool.expectedType)
        : undefined
    );
    setAddFormType('database');
  }

  async function handleVerifyAllTools() {
    for (const tool of toolWiring) {
      if (toolVerificationByName[tool.toolName]?.status === 'verified') {
        continue;
      }

      const selectedConnectionId =
        selectedConnectionByTool[tool.toolName] ?? tool.exactConnection?.id ?? undefined;
      await handleVerifyTool(tool.toolName, selectedConnectionId);
    }
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
      {/* Status header */}
      <div
        className={cn(
          'rounded-lg border p-4',
          allMet
            ? 'border-green-500/30 bg-green-500/5'
            : 'border-amber-500/30 bg-amber-500/5'
        )}
      >
        <div className="flex items-center gap-2">
          {allMet ? (
            <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />
          ) : (
            <AlertCircle className="h-5 w-5 text-amber-600 dark:text-amber-400" />
          )}
          <p className="text-sm font-medium">
            {allMet ? 'All connections are ready' : 'Some connections need attention'}
          </p>
        </div>
        {!allMet && (
          <p className="text-xs text-muted-foreground mt-1 ml-7">
            {!hasAiProvider ? 'No AI provider connected. ' : ''}
            {unresolvedToolWiring.length > 0
              ? `${unresolvedToolWiring.length} tool binding(s) need setup.`
              : ''}
          </p>
        )}
        {allMet && onNavigateToTest && (
          <button
            onClick={onNavigateToTest}
            className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400 hover:underline mt-1 ml-7"
          >
            Proceed to Testing
            <ArrowRight className="h-3 w-3" />
          </button>
        )}
      </div>

      <div className="rounded-lg border border-border/50 bg-muted/20 p-3 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="text-sm font-medium flex items-center gap-1.5">
              <Gauge className="h-4 w-4 text-muted-foreground" />
              Guided Setup
            </p>
            <p className="text-xs text-muted-foreground">
              Progress through runtime, wiring, and verification before moving to tests.
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
          {setupProgress.map((step) => (
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
                {step.label}
              </p>
              <p className="text-[11px] text-muted-foreground mt-1">{step.detail}</p>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {!hasAiProvider && (
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-[11px]"
              onClick={() => setAddFormType('ai')}
            >
              <Plus className="h-3.5 w-3.5 mr-1" />
              Connect AI Runtime
            </Button>
          )}
          {databaseToolWiring.some((tool) => tool.readiness.status !== 'ready') && (
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-[11px]"
              onClick={handleOpenFirstMissingDatabaseSource}
            >
              <Database className="h-3.5 w-3.5 mr-1" />
              Add Missing Data Source
            </Button>
          )}
          {onApplyToolRemap && remapPlans.length > 0 && (
            <Button size="sm" className="h-7 text-[11px]" onClick={handleApplyRemaps}>
              <ArrowRight className="h-3.5 w-3.5 mr-1" />
              Apply {remapPlans.length} BAL Mapping Change{remapPlans.length === 1 ? '' : 's'}
            </Button>
          )}
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
                  Verify All Tools
                </>
              )}
            </Button>
          )}
        </div>
      </div>

      {/* Blueprint summary */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
        <div className="rounded-lg border border-border/50 p-3">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Tools</p>
          <p className="text-sm font-semibold mt-1">{uniqueTools.length}</p>
        </div>
        <div className="rounded-lg border border-border/50 p-3">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Data Sources</p>
          <p className="text-sm font-semibold mt-1">{summary.required.length}</p>
        </div>
        <div className="rounded-lg border border-border/50 p-3">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Connected</p>
          <p className="text-sm font-semibold mt-1">
            {connections.filter((c) => c.status === 'connected').length}
          </p>
        </div>
        <div className="rounded-lg border border-border/50 p-3">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Needs Setup</p>
          <p className="text-sm font-semibold mt-1">
            {unresolvedToolWiring.length + (hasAiProvider ? 0 : 1)}
          </p>
        </div>
      </div>

      {/* AI Provider section */}
      <div>
        <h3 className="text-sm font-medium mb-2">AI Provider Runtime</h3>
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
            Tool Controls
          </h3>
          <p className="text-xs text-muted-foreground mb-2.5">
            Review each tool, confirm its purpose, and verify behavior before testing.
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
          <h3 className="text-sm font-medium mb-2">Data Source Wiring</h3>
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
                        Source Control
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
                Advanced Controls
              </p>
              <p className="text-xs text-muted-foreground">
                Detailed tool contracts, source inventories, and low-level verification controls.
              </p>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowAdvancedDetails((prev) => !prev)}
            >
              {showAdvancedDetails ? 'Hide' : 'Show'}
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

      {/* Required source types summary */}
      {showAdvancedDetails && requiredStatus.length > 0 && (
        <div>
          <h3 className="text-sm font-medium mb-2">Required Source Types</h3>
          <div className="space-y-2">
            {requiredStatus.map((req) => (
              <div key={req.connectionType} className="rounded-lg border border-border/50 p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        'w-2 h-2 rounded-full shrink-0',
                        req.met ? 'bg-green-500' : 'bg-amber-500'
                      )}
                    />
                    <div>
                      <p className="text-sm font-medium capitalize">{req.connectionType}</p>
                      <p className="text-xs text-muted-foreground">Used by: {req.tools.join(', ')}</p>
                    </div>
                  </div>
                  {req.met ? (
                    <span className="text-xs text-green-600 dark:text-green-400">{req.connectionName}</span>
                  ) : (
                    <span className="text-xs text-amber-600 dark:text-amber-400">Not connected</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tool detail table */}
      {showAdvancedDetails && requirements.length > 0 && (
        <div>
          <h3 className="text-sm font-medium mb-2">Tools and Configuration Detail</h3>
          <div className="rounded-lg border border-border/50 divide-y divide-border/30">
            {requirements.map((req) => {
              const readiness = getToolReadinessStatus(req.toolName, connections);
              const metadata = getBuiltInToolMetadata(req.toolName);
              const parsed = parseConnectionTool(req.toolName);
              const expectedSource = parsed.connectionSlug
                ? displaySourceNameFromSlug(parsed.connectionSlug)
                : null;
              const wiring = toolWiringByName.get(req.toolName);
              const selectedConnectionId = wiring?.expectedType
                ? selectedConnectionByTool[req.toolName] ??
                  wiring.exactConnection?.id ??
                  undefined
                : undefined;
              const verificationResult = toolVerificationByName[req.toolName];

              return (
                <div key={req.toolName} className="px-3 py-2.5 space-y-1">
                  <div className="flex items-start gap-2 text-sm">
                    <StatusDot status={readiness.status} />
                    <Wrench className="h-3.5 w-3.5 text-muted-foreground mt-0.5" />
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs">{req.toolName}</span>
                        <StatusPill status={readiness.status} />
                        {verificationResult && <VerificationPill status={verificationResult.status} />}
                      </div>
                      <span className="text-xs text-muted-foreground block">{readiness.note}</span>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-[11px] shrink-0"
                      onClick={() => handleVerifyTool(req.toolName, selectedConnectionId)}
                      disabled={verifyingToolName === req.toolName}
                    >
                      {verifyingToolName === req.toolName ? (
                        <>
                          <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                          Verifying
                        </>
                      ) : (
                        'Verify'
                      )}
                    </Button>
                  </div>
                  {expectedSource && (
                    <p className="text-xs text-muted-foreground ml-4">
                      Expected source name:{' '}
                      <span className="font-medium text-foreground">{expectedSource}</span>
                    </p>
                  )}
                  {metadata && (
                    <div className="ml-4 space-y-1">
                      <p className="text-xs text-muted-foreground line-clamp-1">
                        {metadata.description}
                      </p>
                      <div className="flex items-center gap-1 flex-wrap">
                        <CategoryBadge category={metadata.category} />
                        {metadata.capabilities.map((capability) => (
                          <CapabilityBadge key={capability} capability={capability} />
                        ))}
                        {metadata.approvalRequired && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-500/10 text-red-700 dark:text-red-400 font-medium">
                            approval
                          </span>
                        )}
                      </div>
                      <details className="text-xs">
                        <summary className="cursor-pointer text-muted-foreground hover:text-foreground transition-colors">
                          View tool contract
                        </summary>
                        <pre className="mt-1 rounded bg-muted/40 p-2 overflow-x-auto">
{JSON.stringify(metadata.inputSchema, null, 2)}
                        </pre>
                      </details>
                    </div>
                  )}
                  {!metadata && (req.connectionType === 'postgres' || req.connectionType === 'mysql') && (
                    <details className="ml-4 text-xs">
                      <summary className="cursor-pointer text-muted-foreground hover:text-foreground transition-colors">
                        View tool contract
                      </summary>
                      <pre className="mt-1 rounded bg-muted/40 p-2 overflow-x-auto">
{JSON.stringify({
  type: 'object',
  properties: {
    query: { type: 'string', description: 'Natural-language database question' },
    table: { type: 'string', description: 'Optional target table' },
    limit: { type: 'number', description: 'Optional max rows' },
  },
  required: ['query'],
}, null, 2)}
                      </pre>
                    </details>
                  )}
                  {verificationResult && (
                    <div
                      className={cn(
                        'ml-4 rounded-md border p-2 space-y-1',
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
                      {(verificationResult.status === 'needs_setup' || verificationResult.connection) && (
                        <div className="flex items-center gap-2 pt-1">
                          {verificationResult.status === 'needs_setup' && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-[11px]"
                              onClick={() => handleVerificationSetupAction(req.toolName)}
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
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <Link
        href={ROUTES.connections.list}
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        Manage and edit all connections
        <ExternalLink className="h-3 w-3" />
      </Link>
    </div>
  );
}
