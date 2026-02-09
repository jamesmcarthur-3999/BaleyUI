'use client';

import { useMemo, useState } from 'react';
import { X, Target, Cpu, Zap, Wrench, Braces, Info, Plus } from 'lucide-react';
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
  toolSuggestions?: string[];
}

const AVAILABLE_MODELS = [
  { value: 'openai:gpt-4o', label: 'GPT-4o' },
  { value: 'openai:gpt-4o-mini', label: 'GPT-4o Mini' },
  { value: 'anthropic:claude-sonnet-4-20250514', label: 'Claude Sonnet' },
  { value: 'anthropic:claude-3-5-haiku-20241022', label: 'Claude Haiku' },
];

const DEFAULT_TOOL_SUGGESTIONS = [
  'web_search',
  'fetch_url',
  'send_notification',
  'schedule_task',
  'store_memory',
  'shared_storage',
  'spawn_baleybot',
  'create_agent',
  'create_tool',
];

type ToolMode = 'tools' | 'canRequest';

export function NodeEditor({
  node,
  onUpdate,
  onApplyIntent,
  onClose,
  className,
  toolSuggestions = [],
}: NodeEditorProps) {
  const [intentInput, setIntentInput] = useState('');
  const [intentFeedback, setIntentFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [toolDraft, setToolDraft] = useState('');
  const [toolMode, setToolMode] = useState<ToolMode>('tools');
  const [toolFeedback, setToolFeedback] = useState<string | null>(null);

  const runtimeTools = node.data.tools ?? [];
  const approvalTools = node.data.canRequest ?? [];
  const outputSchema = node.data.output ?? {};
  const mergedToolSuggestions = useMemo(
    () => [...new Set([...toolSuggestions, ...DEFAULT_TOOL_SUGGESTIONS])],
    [toolSuggestions]
  );

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

  const updateToolAssignments = (nextTools: string[], nextCanRequest: string[]) => {
    onUpdate({
      tools: nextTools,
      canRequest: nextCanRequest,
    });
  };

  const handleRemoveTool = (tool: string, mode: ToolMode) => {
    const nextTools = mode === 'tools' ? runtimeTools.filter((value) => value !== tool) : runtimeTools;
    const nextCanRequest =
      mode === 'canRequest' ? approvalTools.filter((value) => value !== tool) : approvalTools;
    updateToolAssignments(nextTools, nextCanRequest);
    setToolFeedback(null);
  };

  const addTool = (value: string, mode: ToolMode) => {
    const normalizedTool = normalizeToolName(value);
    if (!normalizedTool) {
      setToolFeedback('Enter a tool name first.');
      return;
    }

    const alreadyExists =
      (mode === 'tools' ? runtimeTools : approvalTools).includes(normalizedTool);
    if (alreadyExists) {
      setToolFeedback(`"${normalizedTool}" is already listed.`);
      return;
    }

    const nextTools =
      mode === 'tools'
        ? [...runtimeTools, normalizedTool]
        : runtimeTools.filter((tool) => tool !== normalizedTool);
    const nextCanRequest =
      mode === 'canRequest'
        ? [...approvalTools, normalizedTool]
        : approvalTools.filter((tool) => tool !== normalizedTool);

    updateToolAssignments(nextTools, nextCanRequest);
    setToolFeedback(null);
  };

  const handleAddTool = () => {
    addTool(toolDraft, toolMode);
    setToolDraft('');
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

  return (
    <div
      className={cn(
        'w-[28rem] bg-card border border-border rounded-2xl shadow-xl flex flex-col max-h-[calc(100vh-8rem)]',
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

        {/* Tools */}
        <div className="space-y-2.5">
          <label className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <Wrench className="h-3.5 w-3.5" />
            Tool Access
          </label>

          <div className="rounded-lg border border-border/70 bg-muted/20 p-2.5 space-y-2.5">
            <div className="space-y-1">
              <p className="text-[11px] font-medium text-muted-foreground">Runtime tools</p>
              <div className="flex flex-wrap gap-1.5">
                {runtimeTools.length === 0 && (
                  <span className="text-[11px] text-muted-foreground">No runtime tools yet.</span>
                )}
                {runtimeTools.map((tool) => (
                  <ToolPill
                    key={`runtime-${tool}`}
                    label={tool}
                    tone="runtime"
                    onRemove={() => handleRemoveTool(tool, 'tools')}
                  />
                ))}
              </div>
            </div>

            <div className="space-y-1">
              <p className="text-[11px] font-medium text-muted-foreground">Approval required</p>
              <div className="flex flex-wrap gap-1.5">
                {approvalTools.length === 0 && (
                  <span className="text-[11px] text-muted-foreground">No approval-only tools yet.</span>
                )}
                {approvalTools.map((tool) => (
                  <ToolPill
                    key={`approval-${tool}`}
                    label={tool}
                    tone="approval"
                    onRemove={() => handleRemoveTool(tool, 'canRequest')}
                  />
                ))}
              </div>
            </div>

            <div className="grid grid-cols-[1fr_auto_auto] gap-2">
              <input
                value={toolDraft}
                onChange={(e) => setToolDraft(e.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    handleAddTool();
                  }
                }}
                placeholder="tool name (e.g. web_search)"
                className={cn(
                  'px-2.5 py-1.5 text-xs rounded-md',
                  'border border-border bg-background',
                  'focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/50'
                )}
              />
              <select
                value={toolMode}
                onChange={(e) => setToolMode(e.target.value as ToolMode)}
                className={cn(
                  'px-2 py-1.5 text-xs rounded-md',
                  'border border-border bg-background',
                  'focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/50'
                )}
              >
                <option value="tools">Runtime</option>
                <option value="canRequest">Approval</option>
              </select>
              <button
                type="button"
                onClick={handleAddTool}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-md border border-primary/30 bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
              >
                <Plus className="h-3 w-3" />
                Add
              </button>
            </div>

            {mergedToolSuggestions.length > 0 && (
              <div className="space-y-1">
                <p className="text-[11px] text-muted-foreground">Suggestions</p>
                <div className="flex flex-wrap gap-1.5">
                  {mergedToolSuggestions.slice(0, 16).map((tool) => (
                    <button
                      key={tool}
                      type="button"
                      onClick={() => addTool(tool, toolMode)}
                      className="px-2 py-0.5 text-[11px] rounded-full border border-border/60 bg-background hover:bg-muted transition-colors"
                    >
                      {tool}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {toolFeedback && <p className="text-[11px] text-amber-600 dark:text-amber-400">{toolFeedback}</p>}
          </div>
        </div>

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

function ToolPill({
  label,
  tone,
  onRemove,
}: {
  label: string;
  tone: 'runtime' | 'approval';
  onRemove: () => void;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 px-2 py-0.5 text-[11px] rounded-full border',
        tone === 'runtime'
          ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30'
          : 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30'
      )}
    >
      {label}
      <button
        type="button"
        aria-label={`Remove ${label}`}
        onClick={onRemove}
        className="inline-flex items-center justify-center rounded-full hover:bg-black/10 dark:hover:bg-white/10 transition-colors"
      >
        <X className="h-3 w-3" />
      </button>
    </span>
  );
}

function normalizeToolName(value: string): string {
  return value
    .trim()
    .replace(/\s+/g, '_')
    .toLowerCase();
}

function formatNodeName(name: string): string {
  return name
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}
