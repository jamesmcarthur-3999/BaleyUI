// apps/web/src/components/creator/ConnectionsPanel.tsx
'use client';

import { Cable, CheckCircle2, AlertCircle, Plus, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { getConnectionSummary, scanToolRequirements } from '@/lib/baleybot/tools/requirements-scanner';

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
  /** Callback to navigate to connections settings */
  onManageConnections?: () => void;
  className?: string;
}

/**
 * ConnectionsPanel shows which connections the bot needs vs what's available.
 * Three sections: AI Provider, Required Connections, All Workspace Connections.
 */
export function ConnectionsPanel({
  tools,
  connections,
  isLoading,
  onManageConnections,
  className,
}: ConnectionsPanelProps) {
  const summary = getConnectionSummary(tools);
  const requirements = scanToolRequirements(tools);

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
              <Button size="sm" variant="outline" onClick={onManageConnections}>
                <Plus className="h-3.5 w-3.5 mr-1" />
                Add
              </Button>
            </div>
          )}
        </div>
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
                    <Button size="sm" variant="outline" onClick={onManageConnections}>
                      <Plus className="h-3.5 w-3.5 mr-1" />
                      Add
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* All tools summary */}
      {requirements.length > 0 && (
        <div>
          <h3 className="text-sm font-medium mb-2">Tools Overview</h3>
          <div className="rounded-lg border border-border/50 divide-y divide-border/30">
            {requirements.map((req) => (
              <div key={req.toolName} className="flex items-center gap-2 px-3 py-2 text-sm">
                <Cable className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <span className="font-mono text-xs">{req.toolName}</span>
                <span className="text-xs text-muted-foreground ml-auto">
                  {req.connectionType === 'none' ? 'built-in' : req.connectionType}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Manage button */}
      {onManageConnections && (
        <Button variant="outline" className="w-full" onClick={onManageConnections}>
          <ExternalLink className="h-4 w-4 mr-2" />
          Manage Connections
        </Button>
      )}
    </div>
  );
}
