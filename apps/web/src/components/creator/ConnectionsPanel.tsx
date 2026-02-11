// apps/web/src/components/creator/ConnectionsPanel.tsx
'use client';

import { useMemo, useState } from 'react';
import {
  ArrowRight,
  CheckCircle2,
  CircleDashed,
  Plus,
  Zap,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import {
  connectionNameToSlug,
  evaluateToolConnectionBinding,
  parseConnectionTool,
} from '@/lib/baleybot/tools/requirements-scanner';
import { isBuiltInTool } from '@/lib/baleybot/tools/built-in';
import { InlineConnectionForm } from './InlineConnectionForm';

// ============================================================================
// TYPES
// ============================================================================

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
  tools: string[];
  connections: ConnectionData[];
  baleybotId?: string;
  balCode?: string;
  entitySummaries?: EntitySummaryInput[];
  isLoading: boolean;
  onConnectionCreated?: () => void;
  onApplyToolRemap?: (remaps: Array<{ fromTool: string; toTool: string }>) => void;
  onNavigateToTest?: () => void;
  className?: string;
}

type ToolStatus = 'ready' | 'needs-setup' | 'checking';

interface ToolStatusInfo {
  toolName: string;
  status: ToolStatus;
  label: string;
  connectionType?: string;
  connectionSlug?: string;
}

// ============================================================================
// HELPERS
// ============================================================================

function getToolStatus(
  toolName: string,
  connections: ConnectionData[]
): ToolStatusInfo {
  if (isBuiltInTool(toolName)) {
    return { toolName, status: 'ready', label: 'Built-in' };
  }

  const binding = evaluateToolConnectionBinding(toolName, connections);
  if (binding.status === 'ready') {
    return {
      toolName,
      status: 'ready',
      label: binding.matchedConnectionName ?? 'Connected',
    };
  }

  const parsed = parseConnectionTool(toolName);
  return {
    toolName,
    status: 'needs-setup',
    label: binding.reason,
    connectionType: parsed.connectionType ?? undefined,
    connectionSlug: parsed.connectionSlug,
  };
}

function humanToolName(toolName: string): string {
  return toolName
    .replace(/^query_(postgres|pg|mysql)_/, '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
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

export function ConnectionsPanel({
  tools,
  connections,
  baleybotId: _baleybotId,
  balCode: _balCode,
  entitySummaries: _entitySummaries,
  isLoading,
  onConnectionCreated,
  onApplyToolRemap,
  onNavigateToTest,
  className,
}: ConnectionsPanelProps) {
  const [addFormType, setAddFormType] = useState<'ai' | 'database' | null>(null);
  const [addFormDbType, setAddFormDbType] = useState<'postgres' | 'mysql' | undefined>();
  const [addFormSuggestedName, setAddFormSuggestedName] = useState<string | undefined>();

  const existingNames = connections.map(c => c.name);
  const uniqueTools = useMemo(() => [...new Set(tools)], [tools]);

  // Categorize connections
  const aiProviders = connections.filter(
    c => ['openai', 'anthropic', 'ollama'].includes(c.type) && c.status === 'connected'
  );
  const hasAiProvider = aiProviders.length > 0;

  // Categorize tools
  const toolStatuses = uniqueTools.map(t => getToolStatus(t, connections));
  const readyTools = toolStatuses.filter(t => t.status === 'ready');
  const needsSetupTools = toolStatuses.filter(t => t.status === 'needs-setup');
  const allReady = hasAiProvider && needsSetupTools.length === 0;

  // Auto-remap: if user creates a connection that matches a missing tool, apply the remap
  const pendingRemaps = needsSetupTools
    .filter(t => t.connectionType)
    .map(t => {
      const match = connections.find(
        c => c.type === t.connectionType && c.status === 'connected'
      );
      if (!match) return null;
      const newToolName = buildConnectionDerivedToolName(
        t.connectionType as 'postgres' | 'mysql',
        match.name
      );
      if (newToolName === t.toolName) return null;
      return { fromTool: t.toolName, toTool: newToolName };
    })
    .filter(Boolean) as Array<{ fromTool: string; toTool: string }>;

  function handleFormSuccess() {
    setAddFormType(null);
    setAddFormDbType(undefined);
    setAddFormSuggestedName(undefined);
    onConnectionCreated?.();
  }

  function handleSetupTool(tool: ToolStatusInfo) {
    if (tool.connectionType === 'postgres' || tool.connectionType === 'mysql') {
      setAddFormDbType(tool.connectionType);
      if (tool.connectionSlug) {
        setAddFormSuggestedName(
          tool.connectionSlug
            .split('_')
            .map(w => w.charAt(0).toUpperCase() + w.slice(1))
            .join(' ')
        );
      }
      setAddFormType('database');
    }
  }

  if (isLoading) {
    return (
      <div className={cn('space-y-4', className)}>
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    );
  }

  return (
    <div className={cn('space-y-5', className)}>
      {/* Progress summary */}
      <div className="rounded-xl border bg-card p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Zap className={cn('h-4 w-4', allReady ? 'text-green-500' : 'text-amber-500')} />
            <span className="text-sm font-medium">
              {allReady ? 'Everything connected' : 'Setup needed'}
            </span>
          </div>
          {allReady && onNavigateToTest && (
            <Button size="sm" onClick={onNavigateToTest}>
              Continue to Testing
              <ArrowRight className="h-3.5 w-3.5 ml-1" />
            </Button>
          )}
        </div>

        {!allReady && (
          <p className="text-sm text-muted-foreground">
            {!hasAiProvider && needsSetupTools.length > 0
              ? 'Connect an AI provider and set up data sources to get started.'
              : !hasAiProvider
                ? 'Connect an AI provider (OpenAI, Anthropic, or Ollama) to power your bot.'
                : `${needsSetupTools.length} tool${needsSetupTools.length === 1 ? '' : 's'} still need a data source.`}
          </p>
        )}

        {pendingRemaps.length > 0 && onApplyToolRemap && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => onApplyToolRemap(pendingRemaps)}
          >
            Update {pendingRemaps.length} tool binding{pendingRemaps.length === 1 ? '' : 's'}
          </Button>
        )}
      </div>

      {/* AI Provider */}
      <div className="space-y-2">
        <h3 className="text-sm font-medium">AI Provider</h3>
        {hasAiProvider ? (
          <div className="rounded-lg border p-3 space-y-1.5">
            {aiProviders.map(provider => (
              <div key={provider.id} className="flex items-center gap-2 text-sm">
                <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                <span>{provider.name}</span>
                <span className="text-xs text-muted-foreground">({provider.type})</span>
                {provider.isDefault && (
                  <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-full ml-auto">
                    default
                  </span>
                )}
              </div>
            ))}
          </div>
        ) : (
          <button
            onClick={() => setAddFormType('ai')}
            className="w-full rounded-lg border border-dashed border-amber-500/50 bg-amber-500/5 p-3 text-left hover:bg-amber-500/10 transition-colors"
          >
            <div className="flex items-center gap-2">
              <CircleDashed className="h-4 w-4 text-amber-500 shrink-0" />
              <div>
                <p className="text-sm font-medium">Connect AI provider</p>
                <p className="text-xs text-muted-foreground">
                  Add OpenAI, Anthropic, or Ollama to power your bot
                </p>
              </div>
            </div>
          </button>
        )}
        {addFormType === 'ai' && (
          <InlineConnectionForm
            mode="ai"
            existingNames={existingNames}
            onSuccess={handleFormSuccess}
            onCancel={() => setAddFormType(null)}
          />
        )}
      </div>

      {/* Tools */}
      {uniqueTools.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium">Tools ({readyTools.length}/{uniqueTools.length} ready)</h3>

          <div className="rounded-lg border divide-y">
            {toolStatuses.map(tool => (
              <div key={tool.toolName} className="flex items-center justify-between gap-3 px-3 py-2.5">
                <div className="flex items-center gap-2 min-w-0">
                  {tool.status === 'ready' ? (
                    <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                  ) : (
                    <CircleDashed className="h-4 w-4 text-amber-500 shrink-0" />
                  )}
                  <div className="min-w-0">
                    <p className="text-sm truncate">{humanToolName(tool.toolName)}</p>
                    <p className="text-xs text-muted-foreground truncate">{tool.label}</p>
                  </div>
                </div>
                {tool.status === 'needs-setup' && tool.connectionType && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="shrink-0"
                    onClick={() => handleSetupTool(tool)}
                  >
                    <Plus className="h-3.5 w-3.5 mr-1" />
                    Connect
                  </Button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Database connection form */}
      {addFormType === 'database' && (
        <InlineConnectionForm
          mode="database"
          defaultDbProvider={addFormDbType}
          suggestedName={addFormSuggestedName}
          existingNames={existingNames}
          onSuccess={handleFormSuccess}
          onCancel={() => setAddFormType(null)}
        />
      )}
    </div>
  );
}
