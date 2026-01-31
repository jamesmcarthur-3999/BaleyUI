'use client';

import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { Workflow } from 'lucide-react';

interface ParallelNodeData extends Record<string, unknown> {
  name: string;
  branches?: number;
  blockId?: string;
}

type ParallelNodeType = Node<ParallelNodeData, 'parallel'>;

export function ParallelNode({ data, selected }: NodeProps<ParallelNodeType>) {
  return (
    <div
      className={cn(
        'rounded-lg border-2 bg-card shadow-md transition-all min-w-[200px]',
        selected
          ? 'border-[hsl(var(--color-block-parallel))] shadow-lg'
          : 'border-[hsl(var(--color-block-parallel))]/50'
      )}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="w-3 h-3 !bg-[hsl(var(--color-block-parallel))]"
      />

      <div className="p-4 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 flex-1">
            <Workflow className="h-4 w-4 text-[hsl(var(--color-block-parallel))]" />
            <h3 className="font-medium text-sm">{data.name}</h3>
          </div>
          <Badge variant="parallel" className="text-xs">
            Parallel
          </Badge>
        </div>

        {data.branches && (
          <div className="text-xs text-muted-foreground">
            {data.branches} branch{data.branches !== 1 ? 'es' : ''}
          </div>
        )}
      </div>

      <Handle
        type="source"
        position={Position.Bottom}
        className="w-3 h-3 !bg-[hsl(var(--color-block-parallel))]"
      />
    </div>
  );
}
