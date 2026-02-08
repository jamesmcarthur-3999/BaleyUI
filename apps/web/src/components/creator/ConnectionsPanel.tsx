// apps/web/src/components/creator/ConnectionsPanel.tsx
'use client';

import { useState } from 'react';
import { CheckCircle2, AlertCircle, Plus, ExternalLink, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { getConnectionSummary, scanToolRequirements } from '@/lib/baleybot/tools/requirements-scanner';
import { getBuiltInToolMetadata } from '@/lib/baleybot/tools/built-in';
import { InlineConnectionForm } from './InlineConnectionForm';
import { ROUTES } from '@/lib/routes';
import Link from 'next/link';

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
  /** Callback to navigate to the test tab (shown as CTA when all connections ready) */
  onNavigateToTest?: () => void;
  className?: string;
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
  // Built-in tools that always work
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

  // Database tools require a connection
  if (toolName.startsWith('query_postgres_') || toolName.startsWith('query_pg_')) {
    const hasPostgres = connections.some(c => c.type === 'postgres' && c.status === 'connected');
    return hasPostgres
      ? { status: 'ready', note: 'Connected database' }
      : { status: 'needs-setup', note: 'Requires PostgreSQL connection' };
  }

  if (toolName.startsWith('query_mysql_')) {
    const hasMysql = connections.some(c => c.type === 'mysql' && c.status === 'connected');
    return hasMysql
      ? { status: 'ready', note: 'Connected database' }
      : { status: 'needs-setup', note: 'Requires MySQL connection' };
  }

  // Unknown/custom tools — assume ready
  return { status: 'ready', note: 'Custom tool' };
}

// ============================================================================
// STATUS DOT
// ============================================================================

function StatusDot({ status }: { status: ToolReadinessInfo['status'] }) {
  return (
    <span
      className={cn(
        'w-2 h-2 rounded-full shrink-0',
        status === 'ready' && 'bg-green-500',
        status === 'needs-setup' && 'bg-amber-500',
        status === 'limited' && 'bg-yellow-500'
      )}
    />
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

// ============================================================================
// COMPONENT
// ============================================================================

/**
 * ConnectionsPanel shows which connections the bot needs vs what's available.
 * Supports inline connection creation — never navigates away from the page.
 */
export function ConnectionsPanel({
  tools,
  connections,
  isLoading,
  onConnectionCreated,
  onNavigateToTest,
  className,
}: ConnectionsPanelProps) {
  const [addFormType, setAddFormType] = useState<'ai' | 'database' | null>(null);
  const [requestedDbProvider, setRequestedDbProvider] = useState<'postgres' | 'mysql' | undefined>();
  const existingNames = connections.map(c => c.name);

  const uniqueTools = [...new Set(tools)];
  const summary = getConnectionSummary(uniqueTools);
  const requirements = scanToolRequirements(uniqueTools);

  // Check if an AI provider is connected
  const aiProviders = connections.filter(c =>
    ['openai', 'anthropic', 'ollama'].includes(c.type) && c.status === 'connected'
  );
  const hasAiProvider = aiProviders.length > 0;

  // Check which required connection types are met
  const requiredStatus = summary.required.map(req => {
    const match = connections.find(c =>
      c.type === req.connectionType && c.status === 'connected'
    );
    return {
      ...req,
      met: !!match,
      connectionName: match?.name,
    };
  });

  const allMet = hasAiProvider && requiredStatus.every(r => r.met);

  function handleFormSuccess() {
    setAddFormType(null);
    onConnectionCreated?.();
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
      <div className={cn(
        'rounded-lg border p-4',
        allMet ? 'border-green-500/30 bg-green-500/5' : 'border-amber-500/30 bg-amber-500/5'
      )}>
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
            {requiredStatus.filter(r => !r.met).length > 0 && `${requiredStatus.filter(r => !r.met).length} required connection(s) missing.`}
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

      {/* AI Provider section */}
      <div>
        <h3 className="text-sm font-medium mb-2">AI Provider</h3>
        <div className="rounded-lg border border-border/50 p-3">
          {hasAiProvider ? (
            <div className="space-y-2">
              {aiProviders.map(p => (
                <div key={p.id} className="flex items-center gap-2 text-sm">
                  <span className="w-2 h-2 rounded-full bg-green-500 shrink-0" />
                  <span className="font-medium">{p.name}</span>
                  <span className="text-xs text-muted-foreground">({p.type})</span>
                  {p.isDefault && (
                    <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-full ml-auto">default</span>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0" />
                <span className="text-sm text-muted-foreground">No AI provider connected</span>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setAddFormType('ai')}
              >
                <Plus className="h-3.5 w-3.5 mr-1" />
                Add
              </Button>
            </div>
          )}
        </div>
        {/* Inline AI form */}
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

      {/* Tool-required connections */}
      {requiredStatus.length > 0 && (
        <div>
          <h3 className="text-sm font-medium mb-2">Required by Tools</h3>
          <div className="space-y-2">
            {requiredStatus.map((req) => (
              <div key={req.connectionType} className="rounded-lg border border-border/50 p-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className={cn(
                      'w-2 h-2 rounded-full shrink-0',
                      req.met ? 'bg-green-500' : 'bg-amber-500'
                    )} />
                    <div>
                      <p className="text-sm font-medium capitalize">{req.connectionType}</p>
                      <p className="text-xs text-muted-foreground">
                        Used by: {req.tools.join(', ')}
                      </p>
                    </div>
                  </div>
                  {req.met ? (
                    <span className="text-xs text-green-600 dark:text-green-400">{req.connectionName}</span>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setRequestedDbProvider(req.connectionType as 'postgres' | 'mysql');
                        setAddFormType('database');
                      }}
                    >
                      <Plus className="h-3.5 w-3.5 mr-1" />
                      Add
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
          {/* Inline database form */}
          {addFormType === 'database' && (
            <div className="mt-3">
              <InlineConnectionForm
                mode="database"
                defaultDbProvider={requestedDbProvider}
                existingNames={existingNames}
                onSuccess={handleFormSuccess}
                onCancel={() => setAddFormType(null)}
              />
            </div>
          )}
        </div>
      )}

      {/* All tools summary with readiness status */}
      {requirements.length > 0 && (
        <div>
          <h3 className="text-sm font-medium mb-2">Tools Overview</h3>
          <div className="rounded-lg border border-border/50 divide-y divide-border/30">
            {requirements.map((req) => {
              const readiness = getToolReadinessStatus(req.toolName, connections);
              const metadata = getBuiltInToolMetadata(req.toolName);
              return (
                <div key={req.toolName} className="px-3 py-2.5 space-y-1">
                  <div className="flex items-center gap-2 text-sm">
                    <StatusDot status={readiness.status} />
                    <span className="font-mono text-xs">{req.toolName}</span>
                    <span className="text-xs text-muted-foreground ml-auto">
                      {readiness.note}
                    </span>
                  </div>
                  {metadata && (
                    <div className="ml-4 space-y-1">
                      <p className="text-xs text-muted-foreground line-clamp-1">
                        {metadata.description}
                      </p>
                      <div className="flex items-center gap-1 flex-wrap">
                        <CategoryBadge category={metadata.category} />
                        {metadata.capabilities.map((cap) => (
                          <CapabilityBadge key={cap} capability={cap} />
                        ))}
                        {metadata.approvalRequired && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-500/10 text-red-700 dark:text-red-400 font-medium">
                            approval
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Subtle link to full connections page */}
      <Link
        href={ROUTES.connections.list}
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        Manage all connections
        <ExternalLink className="h-3 w-3" />
      </Link>
    </div>
  );
}
