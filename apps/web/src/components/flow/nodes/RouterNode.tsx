'use client';

import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { GitBranch } from 'lucide-react';

interface RouterNodeData extends Record<string, unknown> {
  name: string;
  routes?: string[];
  blockId?: string;
}

type RouterNodeType = Node<RouterNodeData, 'router'>;

export function RouterNode({ data, selected }: NodeProps<RouterNodeType>) {
  return (
    <div
      className={cn(
        'rounded-lg border-2 bg-card shadow-md transition-all min-w-[200px]',
        selected
          ? 'border-[hsl(var(--color-block-router))] shadow-lg'
          : 'border-[hsl(var(--color-block-router))]/50'
      )}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="w-3 h-3 !bg-[hsl(var(--color-block-router))]"
      />

      <div className="p-4 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 flex-1">
            <GitBranch className="h-4 w-4 text-[hsl(var(--color-block-router))]" />
            <h3 className="font-medium text-sm">{data.name}</h3>
          </div>
          <Badge variant="router" className="text-xs">
            Router
          </Badge>
        </div>

        {data.routes && data.routes.length > 0 && (
          <div className="text-xs text-muted-foreground">
            {data.routes.length} route{data.routes.length !== 1 ? 's' : ''}
          </div>
        )}
      </div>

      <Handle
        type="source"
        position={Position.Bottom}
        className="w-3 h-3 !bg-[hsl(var(--color-block-router))]"
      />
    </div>
  );
}
