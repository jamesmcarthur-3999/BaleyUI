'use client';

import { useState } from 'react';
import { X, Target, Cpu, Zap, Wrench, Braces, Info } from 'lucide-react';
import { SchemaBuilder } from '@/components/baleybot/SchemaBuilder';
import { cn } from '@/lib/utils';
import type { VisualNode } from '@/lib/baleybot/visual/types';
import type { NodeIntentResult } from '@/lib/baleybot/visual/visual-to-bal';

interface NodeEditorProps {
  node: VisualNode;
  onUpdate: (data: Partial<VisualNode['data']>) => void;
  onApplyIntent?: (instruction: string) => NodeIntentResult;
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
  onApplyIntent,
  onClose,
  className,
}: NodeEditorProps) {
  const [intentInput, setIntentInput] = useState('');
  const [intentFeedback, setIntentFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

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

  const handleApplyIntent = () => {
    if (!onApplyIntent) return;
    const instruction = intentInput.trim();
    if (!instruction) {
      setIntentFeedback({ type: 'error', text: 'Enter a change request first.' });
      return;
    }

    const result = onApplyIntent(instruction);
    if (result.applied) {
      setIntentFeedback({ type: 'success', text: result.summary });
      setIntentInput('');
      return;
    }

    setIntentFeedback({
      type: 'error',
      text: result.error ?? result.summary,
    });
  };

  const outputSchema = node.data.output ?? {};

  return (
    <div
      className={cn(
        'w-96 bg-card border border-border rounded-2xl shadow-xl flex flex-col max-h-[calc(100vh-8rem)]',
        className
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
        <h3 className="font-semibold text-sm">Edit Node</h3>
        <button
          onClick={onClose}
          className="p-1 rounded-lg hover:bg-muted transition-colors"
        >
          <X className="h-4 w-4 text-muted-foreground" />
        </button>
      </div>

      {/* Content — scrollable */}
      <div className="p-4 space-y-4 overflow-y-auto min-h-0">
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
          <label className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <Braces className="h-3.5 w-3.5" />
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
              className={cn(
                'w-full flex items-center justify-center gap-2 px-3 py-3 text-xs rounded-lg transition-all',
                'text-muted-foreground border border-dashed border-border/80',
                'hover:border-primary/40 hover:text-primary hover:bg-primary/5'
              )}
            >
              <Braces className="h-3.5 w-3.5" />
              Add output schema
            </button>
          )}
        </div>

        {/* Intent editing */}
        {onApplyIntent && (
          <div className="space-y-1.5">
            <label className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
              <Zap className="h-3.5 w-3.5" />
              Quick Edit (Natural Language)
            </label>
            <textarea
              value={intentInput}
              onChange={(e) => setIntentInput(e.target.value)}
              rows={2}
              className={cn(
                'w-full px-3 py-2 text-sm rounded-lg',
                'border border-border bg-background',
                'focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/50',
                'resize-none'
              )}
              placeholder='Example: add a bot here that verifies the output'
            />
            <div className="flex items-center justify-between gap-2">
              <p className="text-[11px] text-muted-foreground">
                Add, delete, rename, or update tools/goals from plain language.
              </p>
              <button
                type="button"
                onClick={handleApplyIntent}
                className="px-2.5 py-1.5 text-xs rounded-lg border border-primary/30 bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
              >
                Apply
              </button>
            </div>
            {intentFeedback && (
              <p
                className={cn(
                  'text-[11px]',
                  intentFeedback.type === 'success'
                    ? 'text-green-600 dark:text-green-400'
                    : 'text-red-600 dark:text-red-400'
                )}
              >
                {intentFeedback.text}
              </p>
            )}
          </div>
        )}

        <div className="rounded-lg border border-border/50 bg-muted/20 p-3">
          <p className="flex items-start gap-2 text-[11px] text-muted-foreground">
            <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            BAL compatibility mode is active in visual editing. Advanced runtime fields are managed in Code view.
          </p>
        </div>
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
