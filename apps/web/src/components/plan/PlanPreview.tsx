'use client';

import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Workflow,
  Puzzle,
  Zap,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { PlanPreviewData, PlannedEntity, PlannedConnection } from '@/lib/baleybot/creator-types';

// ============================================================================
// TYPES
// ============================================================================

interface PlanPreviewProps {
  plan: PlanPreviewData;
  onApprove: () => void;
  onRevise: () => void;
  isStreaming?: boolean;
  className?: string;
}

// ============================================================================
// HELPERS
// ============================================================================

const TOPOLOGY_LABELS: Record<PlanPreviewData['topology'], string> = {
  single: 'Single Entity',
  chain: 'Sequential Chain',
  parallel: 'Parallel Execution',
  conditional: 'Conditional Routing',
  loop: 'Iterative Loop',
  mixed: 'Mixed Topology',
};

const COMPLEXITY_STYLES: Record<PlanPreviewData['complexity'], { label: string; className: string }> = {
  simple: { label: 'Simple', className: 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30' },
  moderate: { label: 'Moderate', className: 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30' },
  complex: { label: 'Complex', className: 'text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/30' },
};

function ConnectionStatusIcon({ status }: { status: PlannedConnection['status'] }) {
  switch (status) {
    case 'ready':
      return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />;
    case 'needs-setup':
      return <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />;
    case 'missing':
      return <XCircle className="h-3.5 w-3.5 text-rose-500" />;
  }
}

function connectionStatusLabel(status: PlannedConnection['status']): string {
  switch (status) {
    case 'ready': return 'Ready';
    case 'needs-setup': return 'Needs setup';
    case 'missing': return 'Missing';
  }
}

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

function EntityCard({ entity }: { entity: PlannedEntity }) {
  return (
    <div className="flex items-start gap-2.5 rounded-lg border border-border/60 bg-card/50 px-3 py-2.5">
      <span className="text-base leading-none mt-0.5">{entity.icon || '🤖'}</span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium truncate">{entity.name}</p>
        <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{entity.purpose}</p>
        {entity.tools.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1.5">
            {entity.tools.map((tool) => (
              <span
                key={tool}
                className="inline-flex items-center rounded-md bg-muted/60 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground"
              >
                {tool}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function FlowDiagram({ entities, topology }: { entities: PlannedEntity[]; topology: PlanPreviewData['topology'] }) {
  if (entities.length === 0) return null;

  const connector = topology === 'parallel' ? (
    <div className="flex items-center justify-center py-1">
      <span className="text-[10px] font-medium text-muted-foreground bg-muted/50 rounded-full px-2 py-0.5">parallel</span>
    </div>
  ) : (
    <div className="flex items-center justify-center py-0.5">
      <div className="h-4 w-px bg-border" />
    </div>
  );

  return (
    <div className="space-y-0">
      {entities.map((entity, i) => (
        <div key={entity.name}>
          <EntityCard entity={entity} />
          {i < entities.length - 1 && connector}
        </div>
      ))}
    </div>
  );
}

function ConnectionRow({ connection }: { connection: PlannedConnection }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <ConnectionStatusIcon status={connection.status} />
      <span className="flex-1 truncate">{connection.name}</span>
      <span className={cn(
        'text-xs',
        connection.status === 'ready' && 'text-emerald-600 dark:text-emerald-400',
        connection.status === 'needs-setup' && 'text-amber-600 dark:text-amber-400',
        connection.status === 'missing' && 'text-rose-600 dark:text-rose-400',
      )}>
        {connectionStatusLabel(connection.status)}
      </span>
    </div>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function PlanPreview({ plan, onApprove, onRevise, isStreaming, className }: PlanPreviewProps) {
  const complexity = COMPLEXITY_STYLES[plan.complexity];

  return (
    <div className={cn('h-full overflow-y-auto', className)}>
      <div className="max-w-2xl mx-auto py-6 px-2 space-y-5 animate-surface-enter">

        {/* Header */}
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <span className="text-2xl">{plan.icon || '🤖'}</span>
            <div className="flex-1 min-w-0">
              <h2 className="text-lg font-semibold truncate">{plan.name}</h2>
              <p className="text-sm text-muted-foreground line-clamp-2">{plan.description}</p>
            </div>
            <span className={cn('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium', complexity.className)}>
              {complexity.label}
            </span>
          </div>
        </div>

        {/* Flow section */}
        <section className="space-y-2.5">
          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <Workflow className="h-4 w-4" />
            <span>Flow</span>
            <span className="text-xs font-normal">({TOPOLOGY_LABELS[plan.topology]})</span>
          </div>
          {plan.topologyDescription && (
            <p className="text-xs text-muted-foreground pl-6">{plan.topologyDescription}</p>
          )}
          <div className="pl-6">
            <FlowDiagram entities={plan.entities} topology={plan.topology} />
          </div>
        </section>

        {/* Connections section */}
        {plan.connections.length > 0 && (
          <section className="space-y-2.5">
            <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <Puzzle className="h-4 w-4" />
              <span>Connections</span>
            </div>
            <div className="pl-6 space-y-1.5">
              {plan.connections.map((conn) => (
                <ConnectionRow key={conn.name} connection={conn} />
              ))}
            </div>
          </section>
        )}

        {/* Design rationale */}
        {plan.designRationale && (
          <section className="space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <Zap className="h-4 w-4" />
              <span>Rationale</span>
            </div>
            <p className="text-sm text-muted-foreground pl-6">{plan.designRationale}</p>
          </section>
        )}

        {/* Actions */}
        <div className="flex items-center gap-3 pt-2 border-t border-border/30">
          <Button onClick={onApprove} disabled={isStreaming} size="sm">
            Approve &amp; Build
          </Button>
          <Button onClick={onRevise} variant="outline" disabled={isStreaming} size="sm">
            Request Changes
          </Button>
        </div>

      </div>
    </div>
  );
}
