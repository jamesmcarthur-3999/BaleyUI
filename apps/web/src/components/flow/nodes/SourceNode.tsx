'use client';

import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { Play } from 'lucide-react';

interface SourceNodeData extends Record<string, unknown> {
  name: string;
  triggerType?: 'webhook' | 'schedule' | 'manual';
}

type SourceNodeType = Node<SourceNodeData, 'source'>;

export function SourceNode({ data, selected }: NodeProps<SourceNodeType>) {
  return (
    <div
      className={cn(
        'rounded-lg border-2 bg-card shadow-md transition-all min-w-[200px]',
        selected
          ? 'border-[hsl(var(--color-success))] shadow-lg'
          : 'border-[hsl(var(--color-success))]/50'
      )}
    >
      <div className="p-4 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 flex-1">
            <Play className="h-4 w-4 text-[hsl(var(--color-success))]" />
            <h3 className="font-medium text-sm">{data.name}</h3>
          </div>
          <Badge variant="connected" className="text-xs">
            Start
          </Badge>
        </div>

        {data.triggerType && (
          <div className="text-xs text-muted-foreground capitalize">
            Trigger: {data.triggerType}
          </div>
        )}
      </div>

      <Handle
        type="source"
        position={Position.Bottom}
        className="w-3 h-3 !bg-[hsl(var(--color-success))]"
      />
    </div>
  );
}
