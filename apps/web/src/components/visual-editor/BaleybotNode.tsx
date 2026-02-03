'use client';

import { Handle, Position, type NodeProps, type Node } from '@xyflow/react';
import { Zap, Clock, Globe, Wrench, Target } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { VisualNode } from '@/lib/baleybot/visual/bal-to-nodes';

type BaleybotNodeData = VisualNode['data'];

// Define a custom node type for React Flow
type BaleybotNodeType = Node<BaleybotNodeData, 'baleybot'>;

export function BaleybotNode({ data, selected }: NodeProps<BaleybotNodeType>) {
  const nodeData = data;

  const getTriggerIcon = () => {
    if (!nodeData.trigger) return null;
    switch (nodeData.trigger.type) {
      case 'schedule':
        return <Clock className="h-3 w-3 text-amber-500" />;
      case 'webhook':
        return <Globe className="h-3 w-3 text-blue-500" />;
      case 'other_bb':
        return <Zap className="h-3 w-3 text-emerald-500" />;
      default:
        return null;
    }
  };

  const getTriggerLabel = () => {
    if (!nodeData.trigger) return null;
    switch (nodeData.trigger.type) {
      case 'schedule':
        return nodeData.trigger.schedule || 'Scheduled';
      case 'webhook':
        return 'Webhook';
      case 'other_bb':
        return `On ${nodeData.trigger.completionType || 'completion'}`;
      default:
        return null;
    }
  };

  const toolCount = (nodeData.tools?.length || 0) + (nodeData.canRequest?.length || 0);

  return (
    <>
      {/* Input handle */}
      <Handle
        type="target"
        position={Position.Left}
        className="!w-3 !h-3 !bg-primary !border-2 !border-background"
      />

      <div
        className={cn(
          'w-[260px] rounded-xl border bg-card shadow-lg transition-all',
          selected
            ? 'border-primary ring-2 ring-primary/20'
            : 'border-border hover:border-primary/50'
        )}
      >
        {/* Header */}
        <div className="px-4 py-3 border-b border-border/50">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center text-lg">
                {getNodeEmoji(nodeData.name)}
              </div>
              <div>
                <h4 className="font-semibold text-sm">{formatNodeName(nodeData.name)}</h4>
                {nodeData.model && (
                  <p className="text-xs text-muted-foreground">{formatModel(nodeData.model)}</p>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="px-4 py-3 space-y-2">
          {/* Goal */}
          <div className="flex items-start gap-2">
            <Target className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
            <p className="text-xs text-muted-foreground line-clamp-2">
              {nodeData.goal || 'No goal specified'}
            </p>
          </div>

          {/* Tools count */}
          {toolCount > 0 && (
            <div className="flex items-center gap-2">
              <Wrench className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">
                {toolCount} tool{toolCount !== 1 ? 's' : ''}
              </span>
            </div>
          )}

          {/* Trigger badge */}
          {nodeData.trigger && nodeData.trigger.type !== 'manual' && (
            <div className="flex items-center gap-1.5">
              {getTriggerIcon()}
              <span className="text-xs text-muted-foreground">{getTriggerLabel()}</span>
            </div>
          )}
        </div>

        {/* Output schema indicator */}
        {nodeData.output && Object.keys(nodeData.output).length > 0 && (
          <div className="px-4 py-2 bg-muted/30 border-t border-border/50 rounded-b-xl">
            <p className="text-xs text-muted-foreground">
              Output: {Object.keys(nodeData.output).join(', ')}
            </p>
          </div>
        )}
      </div>

      {/* Output handle */}
      <Handle
        type="source"
        position={Position.Right}
        className="!w-3 !h-3 !bg-primary !border-2 !border-background"
      />
    </>
  );
}

function formatNodeName(name: string): string {
  return name
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function formatModel(model: string): string {
  // Extract just the model name, e.g., "openai:gpt-4o-mini" -> "GPT-4o Mini"
  const parts = model.split(':');
  const modelName = parts[1] || parts[0] || model;

  return modelName
    .replace(/gpt-(\d+)/i, 'GPT-$1')
    .replace(/claude-/i, 'Claude ')
    .replace(/-mini/i, ' Mini')
    .replace(/-/g, ' ');
}

function getNodeEmoji(name: string): string {
  // Try to infer an appropriate emoji from the node name
  const lowerName = name.toLowerCase();

  if (lowerName.includes('analyze') || lowerName.includes('analysis')) return '🔍';
  if (lowerName.includes('report') || lowerName.includes('summary')) return '📊';
  if (lowerName.includes('search') || lowerName.includes('query')) return '🔎';
  if (lowerName.includes('poll') || lowerName.includes('fetch')) return '📥';
  if (lowerName.includes('notify') || lowerName.includes('alert')) return '🔔';
  if (lowerName.includes('email') || lowerName.includes('send')) return '📧';
  if (lowerName.includes('validate') || lowerName.includes('check')) return '✅';
  if (lowerName.includes('transform') || lowerName.includes('process')) return '⚙️';
  if (lowerName.includes('store') || lowerName.includes('save')) return '💾';
  if (lowerName.includes('schedule') || lowerName.includes('task')) return '📅';

  return '🤖';
}
