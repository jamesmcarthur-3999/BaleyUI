'use client';

import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { Flag } from 'lucide-react';

interface SinkNodeData extends Record<string, unknown> {
  name: string;
  outputType?: string;
}

type SinkNodeType = Node<SinkNodeData, 'sink'>;

export function SinkNode({ data, selected }: NodeProps<SinkNodeType>) {
  return (
    <div
      className={cn(
        'rounded-lg border-2 bg-card shadow-md transition-all min-w-[200px]',
        selected
          ? 'border-destructive shadow-lg'
          : 'border-destructive/50'
      )}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="w-3 h-3 !bg-destructive"
      />

      <div className="p-4 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 flex-1">
            <Flag className="h-4 w-4 text-destructive" />
            <h3 className="font-medium text-sm">{data.name}</h3>
          </div>
          <Badge variant="destructive" className="text-xs">
            End
          </Badge>
        </div>

        {data.outputType && (
          <div className="text-xs text-muted-foreground">
            Output: {data.outputType}
          </div>
        )}
      </div>
    </div>
  );
}
