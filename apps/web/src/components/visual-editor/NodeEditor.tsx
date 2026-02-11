'use client';

import { useState, type ReactNode } from 'react';
import { X, Cpu, Zap, Wrench, Braces, Plus, Target, ChevronDown } from 'lucide-react';
import { SchemaBuilder } from '@/components/baleybot/SchemaBuilder';
import { cn } from '@/lib/utils';
import type { VisualNode } from '@/lib/baleybot/visual/types';
import type { NodeIntentResult } from '@/lib/baleybot/visual/visual-to-bal';
import { getNodeEmoji, formatNodeName, MCP_PREFIXES } from './BaleybotNode';

interface NodeEditorProps {
  node: VisualNode;
  onUpdate: (data: Partial<VisualNode['data']>) => void;
  onApplyIntent?: (instruction: string) => NodeIntentResult;
  onClose: () => void;
  className?: string;
  toolSuggestions?: string[];
  showAdvancedConfig?: boolean;
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

/* ------------------------------------------------------------------ */
/*  Auto-generated summary                                             */
/* ------------------------------------------------------------------ */

function generateNodeSummary(data: VisualNode['data']): string {
  const parts: string[] = [];

  // Start with the goal
  if (data.goal) {
    const goal = data.goal.endsWith('.') ? data.goal : `${data.goal}.`;
    parts.push(goal);
  }

  // Mention tools
  const tools = data.tools ?? [];
  const mcpServices: string[] = [];
  const builtinNames: string[] = [];
  const dbNames: string[] = [];

  for (const tool of tools) {
    if (['web_search', 'fetch_url', 'send_notification', 'store_memory', 'shared_storage', 'spawn_baleybot', 'schedule_task', 'create_agent', 'create_tool'].includes(tool)) {
      builtinNames.push(tool.replace(/_/g, ' '));
      continue;
    }
    if (tool.startsWith('query_postgres_') || tool.startsWith('query_mysql_')) {
      const name = tool.replace(/^query_(postgres|mysql)_/, '').replace(/_/g, ' ');
      dbNames.push(name);
      continue;
    }
    for (const [prefix, serviceName] of Object.entries(MCP_PREFIXES)) {
      if (tool.startsWith(prefix)) {
        if (!mcpServices.includes(serviceName)) mcpServices.push(serviceName);
        break;
      }
    }
  }

  if (builtinNames.length > 0) {
    parts.push(`Uses ${builtinNames.join(', ')}.`);
  }
  if (mcpServices.length > 0) {
    parts.push(`Connected to ${mcpServices.join(', ')}.`);
  }
  if (dbNames.length > 0) {
    parts.push(`Queries ${dbNames.join(', ')}.`);
  }

  // Approval tools
  const approvalTools = data.canRequest ?? [];
  if (approvalTools.length > 0) {
    parts.push(`Requires approval for ${approvalTools.map(t => t.replace(/_/g, ' ')).join(', ')}.`);
  }

  // Output
  const outputFields = data.output ? Object.keys(data.output) : [];
  if (outputFields.length > 0) {
    parts.push(`Returns ${outputFields.join(', ')}.`);
  }

  return parts.join(' ') || 'No configuration yet.';
}

/* ------------------------------------------------------------------ */
/*  Collapsible EditorSection                                          */
/* ------------------------------------------------------------------ */

function EditorSection({
  icon,
  title,
  badge,
  defaultOpen = true,
  children,
}: {
  icon: ReactNode;
  title: string;
  badge?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="rounded-lg border border-border/60 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 w-full px-3 py-2.5 text-left hover:bg-muted/30 transition-colors"
      >
        <span className="text-muted-foreground">{icon}</span>
        <span className="text-xs font-medium flex-1">{title}</span>
        {badge}
        <ChevronDown
          className={cn(
            'h-3.5 w-3.5 text-muted-foreground transition-transform duration-200',
            open && 'rotate-180'
          )}
        />
      </button>
      {open && (
        <div className="px-3 pb-3 animate-slide-down">
          {children}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  NodeEditor                                                         */
/* ------------------------------------------------------------------ */

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
  const allTools = [...new Set([...toolSuggestions, ...DEFAULT_TOOL_SUGGESTIONS])];

  const handleGoalChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    onUpdate({ goal: e.target.value });
  };

  const handleModelChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    onUpdate({ model: e.target.value || undefined });
  };

  const handleSchemaChange = (newSchema: Record<string, string>) => {
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

  const toolCount = runtimeTools.length + approvalTools.length;
  const outputFieldCount = Object.keys(outputSchema).length;

  return (
    <div
      className={cn(
        'w-[28rem] bg-card border border-border rounded-2xl shadow-xl flex flex-col max-h-[calc(100vh-8rem)] relative overflow-hidden',
        className
      )}
    >
      {/* Premium gradient accent */}
      <div className="absolute inset-0 pointer-events-none before:absolute before:inset-0 before:bg-gradient-to-b before:from-primary/5 before:to-transparent before:h-32" />

      {/* Header — shows node name */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0 relative z-10">
        <h3 className="font-semibold text-sm">
          {getNodeEmoji(node.data.name)} {formatNodeName(node.data.name)}
        </h3>
        <button
          onClick={onClose}
          className="p-1 rounded-lg hover:bg-muted transition-colors"
        >
          <X className="h-4 w-4 text-muted-foreground" />
        </button>
      </div>

      {/* Auto-generated summary */}
      <div className="px-4 py-3 border-b border-border/50 bg-muted/20 relative z-10">
        <p className="text-xs leading-relaxed text-muted-foreground">
          {generateNodeSummary(node.data)}
        </p>
      </div>

      {/* Content — scrollable */}
      <div className="p-4 space-y-3 overflow-y-auto min-h-0 relative z-10">
        {/* Purpose Section (was Identity) */}
        <EditorSection
          icon={<Target className="h-3.5 w-3.5" />}
          title="Purpose"
          defaultOpen={true}
        >
          <div className="pt-1">
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
        </EditorSection>

        {/* Capabilities Section */}
        <EditorSection
          icon={<Wrench className="h-3.5 w-3.5" />}
          title="Capabilities"
          badge={
            toolCount > 0 ? (
              <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-primary/10 text-primary">
                {toolCount}
              </span>
            ) : undefined
          }
          defaultOpen={true}
        >
          <div className="space-y-3 pt-1">
            {/* Model */}
            <div className="space-y-1.5">
              <label className="flex items-center gap-2 text-[11px] font-medium text-muted-foreground">
                <Cpu className="h-3 w-3" />
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

              {allTools.length > 0 && (
                <div className="space-y-1">
                  <p className="text-[11px] text-muted-foreground">Suggestions</p>
                  <div className="flex flex-wrap gap-1.5">
                    {allTools.slice(0, 16).map((tool) => (
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
        </EditorSection>

        {/* Output Section */}
        <EditorSection
          icon={<Braces className="h-3.5 w-3.5" />}
          title="Output"
          badge={
            outputFieldCount > 0 ? (
              <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-primary/10 text-primary">
                {outputFieldCount}
              </span>
            ) : undefined
          }
          defaultOpen={outputFieldCount > 0}
        >
          <div className="pt-1">
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
        </EditorSection>

        {/* Quick Edit Section */}
        {onApplyIntent && (
          <EditorSection
            icon={<Zap className="h-3.5 w-3.5" />}
            title="Quick Edit"
            defaultOpen={false}
          >
            <div className="space-y-2 pt-1">
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
          </EditorSection>
        )}
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
