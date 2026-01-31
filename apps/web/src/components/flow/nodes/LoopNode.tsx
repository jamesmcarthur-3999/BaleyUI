'use client';

import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { RotateCw } from 'lucide-react';

interface LoopNodeData extends Record<string, unknown> {
  name: string;
  maxIterations?: number;
  blockId?: string;
}

type LoopNodeType = Node<LoopNodeData, 'loop'>;

export function LoopNode({ data, selected }: NodeProps<LoopNodeType>) {
  return (
    <div
      className={cn(
        'rounded-lg border-2 bg-card shadow-md transition-all min-w-[200px]',
        selected
          ? 'border-primary shadow-lg'
          : 'border-primary/50'
      )}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="w-3 h-3 !bg-primary"
      />

      <div className="p-4 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 flex-1">
            <RotateCw className="h-4 w-4 text-primary" />
            <h3 className="font-medium text-sm">{data.name}</h3>
          </div>
          <Badge variant="default" className="text-xs">
            Loop
          </Badge>
        </div>

        {data.maxIterations && (
          <div className="text-xs text-muted-foreground">
            Max: {data.maxIterations} iterations
          </div>
        )}
      </div>

      <Handle
        type="source"
        position={Position.Bottom}
        className="w-3 h-3 !bg-primary"
      />
    </div>
  );
}
