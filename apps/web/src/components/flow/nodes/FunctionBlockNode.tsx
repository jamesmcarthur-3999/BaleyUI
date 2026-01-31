'use client';

import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { Code2 } from 'lucide-react';

interface FunctionBlockNodeData extends Record<string, unknown> {
  name: string;
  blockId?: string;
}

type FunctionBlockNodeType = Node<FunctionBlockNodeData, 'functionBlock'>;

export function FunctionBlockNode({ data, selected }: NodeProps<FunctionBlockNodeType>) {
  return (
    <div
      className={cn(
        'rounded-lg border-2 bg-card shadow-md transition-all min-w-[200px]',
        selected
          ? 'border-[hsl(var(--color-block-function))] shadow-lg'
          : 'border-[hsl(var(--color-block-function))]/50'
      )}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="w-3 h-3 !bg-[hsl(var(--color-block-function))]"
      />

      <div className="p-4 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 flex-1">
            <Code2 className="h-4 w-4 text-[hsl(var(--color-block-function))]" />
            <h3 className="font-medium text-sm">{data.name}</h3>
          </div>
          <Badge variant="function" className="text-xs">
            Function
          </Badge>
        </div>
      </div>

      <Handle
        type="source"
        position={Position.Bottom}
        className="w-3 h-3 !bg-[hsl(var(--color-block-function))]"
      />
    </div>
  );
}
