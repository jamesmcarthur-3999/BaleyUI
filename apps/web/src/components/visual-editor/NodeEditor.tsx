'use client';

import { X, Target, Cpu, Zap, Wrench } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { VisualNode } from '@/lib/baleybot/visual/bal-to-nodes';

interface NodeEditorProps {
  node: VisualNode;
  onUpdate: (data: Partial<VisualNode['data']>) => void;
  onClose: () => void;
  className?: string;
}

const AVAILABLE_MODELS = [
  { value: 'openai:gpt-4o', label: 'GPT-4o' },
  { value: 'openai:gpt-4o-mini', label: 'GPT-4o Mini' },
  { value: 'anthropic:claude-sonnet-4-20250514', label: 'Claude Sonnet' },
  { value: 'anthropic:claude-3-5-haiku-20241022', label: 'Claude Haiku' },
];

export function NodeEditor({
  node,
  onUpdate,
  onClose,
  className,
}: NodeEditorProps) {
  const handleGoalChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    onUpdate({ goal: e.target.value });
  };

  const handleModelChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    onUpdate({ model: e.target.value || undefined });
  };

  return (
    <div
      className={cn(
        'w-80 bg-card border border-border rounded-2xl shadow-xl',
        className
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <h3 className="font-semibold text-sm">Edit Node</h3>
        <button
          onClick={onClose}
          className="p-1 rounded-lg hover:bg-muted transition-colors"
        >
          <X className="h-4 w-4 text-muted-foreground" />
        </button>
      </div>

      {/* Content */}
      <div className="p-4 space-y-4">
        {/* Node name (read-only) */}
        <div className="space-y-1.5">
          <label className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <Zap className="h-3.5 w-3.5" />
            Name
          </label>
          <div className="px-3 py-2 bg-muted/50 rounded-lg text-sm">
            {formatNodeName(node.data.name)}
          </div>
        </div>

        {/* Goal */}
        <div className="space-y-1.5">
          <label className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <Target className="h-3.5 w-3.5" />
            Goal
          </label>
          <textarea
            value={node.data.goal}
            onChange={handleGoalChange}
            rows={3}
            className={cn(
              'w-full px-3 py-2 text-sm rounded-lg',
              'border border-border bg-background',
              'focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/50',
              'resize-none'
            )}
            placeholder="Describe what this entity should accomplish..."
          />
        </div>

        {/* Model */}
        <div className="space-y-1.5">
          <label className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <Cpu className="h-3.5 w-3.5" />
            Model
          </label>
          <select
            value={node.data.model || ''}
            onChange={handleModelChange}
            className={cn(
              'w-full px-3 py-2 text-sm rounded-lg',
              'border border-border bg-background',
              'focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/50'
            )}
          >
            <option value="">Default (GPT-4o Mini)</option>
            {AVAILABLE_MODELS.map((model) => (
              <option key={model.value} value={model.value}>
                {model.label}
              </option>
            ))}
          </select>
        </div>

        {/* Tools (read-only display) */}
        {(node.data.tools.length > 0 || node.data.canRequest.length > 0) && (
          <div className="space-y-1.5">
            <label className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
              <Wrench className="h-3.5 w-3.5" />
              Tools
            </label>
            <div className="flex flex-wrap gap-1.5">
              {node.data.tools.map((tool) => (
                <span
                  key={tool}
                  className="px-2 py-0.5 text-xs rounded-full bg-emerald-500/10 text-emerald-600"
                >
                  {tool}
                </span>
              ))}
              {node.data.canRequest.map((tool) => (
                <span
                  key={tool}
                  className="px-2 py-0.5 text-xs rounded-full bg-amber-500/10 text-amber-600"
                >
                  {tool} (approval)
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Output schema (read-only) */}
        {node.data.output && Object.keys(node.data.output).length > 0 && (
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              Output Schema
            </label>
            <div className="px-3 py-2 bg-muted/50 rounded-lg text-xs font-mono">
              {Object.entries(node.data.output).map(([key, type]) => (
                <div key={key}>
                  {key}: {type}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function formatNodeName(name: string): string {
  return name
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}
