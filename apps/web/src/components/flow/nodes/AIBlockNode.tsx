'use client';

import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { Sparkles } from 'lucide-react';

interface AIBlockNodeData extends Record<string, unknown> {
  name: string;
  model?: string;
  blockId?: string;
}

type AIBlockNodeType = Node<AIBlockNodeData, 'aiBlock'>;

export function AIBlockNode({ data, selected }: NodeProps<AIBlockNodeType>) {
  return (
    <div
      className={cn(
        'rounded-lg border-2 bg-card shadow-md transition-all min-w-[200px]',
        selected
          ? 'border-[hsl(var(--color-block-ai))] shadow-lg'
          : 'border-[hsl(var(--color-block-ai))]/50'
      )}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="w-3 h-3 !bg-[hsl(var(--color-block-ai))]"
      />

      <div className="p-4 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 flex-1">
            <Sparkles className="h-4 w-4 text-[hsl(var(--color-block-ai))]" />
            <h3 className="font-medium text-sm">{data.name}</h3>
          </div>
          <Badge variant="ai" className="text-xs">
            AI
          </Badge>
        </div>

        {data.model && (
          <div className="text-xs text-muted-foreground font-mono bg-muted px-2 py-1 rounded">
            {data.model}
          </div>
        )}
      </div>

      <Handle
        type="source"
        position={Position.Bottom}
        className="w-3 h-3 !bg-[hsl(var(--color-block-ai))]"
      />
    </div>
  );
}
