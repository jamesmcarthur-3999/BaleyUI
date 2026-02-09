'use client';

import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';
import { Database, PlayCircle, FolderKanban, Workflow, Activity } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { VisualNode } from '@/lib/baleybot/visual/types';

type ContextNodeType = Node<VisualNode['data']>;

function getKindMeta(kind?: string) {
  switch (kind) {
    case 'trigger':
      return {
        title: 'Start',
        Icon: PlayCircle,
        accent: 'text-emerald-600 dark:text-emerald-300',
        background: 'bg-emerald-500/10 border-emerald-500/30',
      };
    case 'datasource':
      return {
        title: 'Input source',
        Icon: Database,
        accent: 'text-cyan-700 dark:text-cyan-300',
        background: 'bg-cyan-500/10 border-cyan-500/30',
      };
    case 'storage_bucket':
      return {
        title: 'Shared memory',
        Icon: FolderKanban,
        accent: 'text-amber-700 dark:text-amber-300',
        background: 'bg-amber-500/10 border-amber-500/30',
      };
    case 'bb_cluster':
      return {
        title: 'Bot group',
        Icon: Workflow,
        accent: 'text-violet-700 dark:text-violet-300',
        background: 'bg-violet-500/10 border-violet-500/30',
      };
    default:
      return {
        title: 'Helper',
        Icon: Activity,
        accent: 'text-muted-foreground',
        background: 'bg-muted/40 border-border/60',
      };
  }
}

function getRuntimeTone(status?: VisualNode['data']['runtimeStatus']) {
  if (status === 'running') return 'ring-2 ring-sky-500/40 border-sky-500/40';
  if (status === 'completed') return 'ring-2 ring-emerald-500/40 border-emerald-500/40';
  if (status === 'needs_attention') return 'ring-2 ring-red-500/40 border-red-500/40';
  return '';
}

export function ContextNode({ data, selected }: NodeProps<ContextNodeType>) {
  const meta = getKindMeta(data.kind);
  const Icon = meta.Icon;

  return (
    <>
      <Handle
        type="target"
        position={Position.Left}
        className="!w-2.5 !h-2.5 !bg-border !border-2 !border-background"
      />

      <div
        className={cn(
          'w-[210px] rounded-xl border px-3 py-2.5 bg-card shadow-sm transition-all',
          selected ? 'border-primary ring-2 ring-primary/20' : 'border-border/60',
          meta.background,
          getRuntimeTone(data.runtimeStatus)
        )}
      >
        <div className="flex items-center gap-2">
          <div className={cn('h-7 w-7 rounded-lg bg-background/80 border border-border/40 flex items-center justify-center', meta.accent)}>
            <Icon className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{meta.title}</p>
            <p className="text-sm font-medium truncate">{data.name || 'Untitled'}</p>
          </div>
        </div>
      </div>

      <Handle
        type="source"
        position={Position.Right}
        className="!w-2.5 !h-2.5 !bg-border !border-2 !border-background"
      />
    </>
  );
}
