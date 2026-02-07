'use client';

import { useState } from 'react';
import { X, Target, Cpu, Zap, Wrench, Thermometer, Brain, RotateCcw, ChevronDown } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { SchemaBuilder } from '@/components/baleybot/SchemaBuilder';
import { cn } from '@/lib/utils';
import type { VisualNode } from '@/lib/baleybot/visual/types';

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
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const handleGoalChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    onUpdate({ goal: e.target.value });
  };

  const handleModelChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    onUpdate({ model: e.target.value || undefined });
  };

  const handleSchemaChange = (newSchema: Record<string, string>) => {
    // Pass {} for empty schemas — rebuildBAL skips output when keys are empty,
    // and applyNodeChangeFromParsed only triggers on !== undefined
    onUpdate({ output: newSchema });
  };

  const outputSchema = node.data.output ?? {};

  return (
    <div
      className={cn(
        'w-96 bg-card border border-border rounded-2xl shadow-xl',
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

        {/* Output Schema (editable) */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">
            Output Schema
          </label>
          {Object.keys(outputSchema).length > 0 ? (
            <SchemaBuilder
              value={outputSchema}
              onChange={handleSchemaChange}
              className="text-sm"
            />
          ) : (
            <button
              onClick={() => handleSchemaChange({ result: 'string' })}
              className="w-full px-3 py-2 text-xs text-muted-foreground border border-dashed border-border rounded-lg hover:bg-muted/50 transition-colors"
            >
              + Add output schema
            </button>
          )}
        </div>

        {/* Advanced section (collapsed by default) */}
        <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
          <CollapsibleTrigger className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
            <ChevronDown className={cn('h-3 w-3 transition-transform', advancedOpen && 'rotate-180')} />
            Advanced
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-3 space-y-4">
            {/* Temperature */}
            <div className="space-y-1.5">
              <label className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                <Thermometer className="h-3.5 w-3.5" />
                Temperature
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min="0"
                  max="2"
                  step="0.1"
                  value={node.data.temperature ?? 0.7}
                  onChange={(e) => onUpdate({ temperature: parseFloat(e.target.value) })}
                  className="flex-1 h-1.5 accent-primary"
                />
                <span className="text-xs font-mono w-8 text-right">
                  {(node.data.temperature ?? 0.7).toFixed(1)}
                </span>
              </div>
              <div className="flex justify-between text-[10px] text-muted-foreground">
                <span>Precise</span>
                <span>Creative</span>
              </div>
            </div>

            {/* Reasoning */}
            <div className="space-y-1.5">
              <label className="flex items-center justify-between text-xs font-medium text-muted-foreground">
                <span className="flex items-center gap-2">
                  <Brain className="h-3.5 w-3.5" />
                  Extended Thinking
                </span>
                <button
                  type="button"
                  onClick={() => onUpdate({ reasoning: !node.data.reasoning })}
                  className={cn(
                    'relative inline-flex h-5 w-9 items-center rounded-full transition-colors',
                    node.data.reasoning ? 'bg-primary' : 'bg-muted-foreground/30'
                  )}
                >
                  <span
                    className={cn(
                      'inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform',
                      node.data.reasoning ? 'translate-x-4.5' : 'translate-x-0.5'
                    )}
                  />
                </button>
              </label>
              {node.data.reasoning && (
                <p className="text-[10px] text-muted-foreground">
                  For o1/o3/o4 models. Ignored on other models.
                </p>
              )}
            </div>

            {/* Retries */}
            <div className="space-y-1.5">
              <label className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                <RotateCcw className="h-3.5 w-3.5" />
                Max Retries
              </label>
              <input
                type="number"
                min="0"
                max="10"
                value={node.data.retries ?? 0}
                onChange={(e) => onUpdate({ retries: parseInt(e.target.value) || 0 })}
                className={cn(
                  'w-full px-3 py-2 text-sm rounded-lg',
                  'border border-border bg-background',
                  'focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/50'
                )}
              />
            </div>
          </CollapsibleContent>
        </Collapsible>
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
