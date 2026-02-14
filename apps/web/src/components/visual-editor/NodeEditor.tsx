'use client';

import { useState } from 'react';
import { X, Cpu, Zap, Wrench, Braces, Plus, Target } from 'lucide-react';
import { trpc } from '@/lib/trpc/client';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { SchemaBuilder } from '@/components/baleybot/SchemaBuilder';
import { cn } from '@/lib/utils';
import type { VisualNode } from '@/lib/baleybot/visual/types';
import type { NodeIntentResult } from '@/lib/baleybot/visual/visual-to-bal';
import type { BuilderPresentationMode } from '@/lib/baleybot/creator-types';
import { getNodeEmoji, formatNodeName, MCP_PREFIXES, BUILTIN_TOOLS } from './BaleybotNode';

interface NodeEditorProps {
  node: VisualNode;
  onUpdate: (data: Partial<VisualNode['data']>) => void;
  onApplyIntent?: (instruction: string) => NodeIntentResult;
  onClose: () => void;
  className?: string;
  toolSuggestions?: string[];
  presentationMode?: BuilderPresentationMode;
}

const TIER_LABELS: Record<string, string> = { ultra: 'Ultra', powerful: 'Powerful', balanced: 'Balanced', fast: 'Fast' };
const PROVIDER_LABELS: Record<string, string> = { anthropic: 'Anthropic', openai: 'OpenAI', ollama: 'Ollama' };

/** Tools that require user approval before executing */
const APPROVAL_TOOLS = new Set(['schedule_task', 'create_agent', 'create_tool']);

type ToolMode = 'tools' | 'canRequest';

/* ------------------------------------------------------------------ */
/*  Auto-generated summary                                             */
/* ------------------------------------------------------------------ */

function generateNodeSummary(data: VisualNode['data']): string {
  const parts: string[] = [];

  if (data.goal) {
    const goal = data.goal.endsWith('.') ? data.goal : `${data.goal}.`;
    parts.push(goal);
  }

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

  const approvalTools = data.canRequest ?? [];
  if (approvalTools.length > 0) {
    parts.push(`Requires approval for ${approvalTools.map(t => t.replace(/_/g, ' ')).join(', ')}.`);
  }

  const outputFields = data.output ? Object.keys(data.output) : [];
  if (outputFields.length > 0) {
    parts.push(`Returns ${outputFields.join(', ')}.`);
  }

  return parts.join(' ') || 'No configuration yet.';
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
  presentationMode = 'advanced',
}: NodeEditorProps) {
  const [intentInput, setIntentInput] = useState('');
  const [intentFeedback, setIntentFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [toolDraft, setToolDraft] = useState('');
  const [toolMode, setToolMode] = useState<ToolMode>('tools');
  const [toolFeedback, setToolFeedback] = useState<string | null>(null);

  const isSimple = presentationMode === 'simple';
  const runtimeTools = node.data.tools ?? [];
  const approvalTools = node.data.canRequest ?? [];
  const outputSchema = node.data.output ?? {};

  // Fetch available models filtered by workspace connections
  const { data: modelsByProvider } = trpc.models.forWorkspace.useQuery(undefined, {
    staleTime: 60_000,
  });


  // Compute connected tools not in BUILTIN_TOOLS (MCP, DB, custom from suggestions)
  const connectedTools = [...new Set(toolSuggestions)].filter(
    (t) => !BUILTIN_TOOLS[t]
  );

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

  const toggleBuiltinTool = (toolName: string) => {
    // If it's an approval-required tool, toggle in canRequest
    if (APPROVAL_TOOLS.has(toolName)) {
      if (approvalTools.includes(toolName)) {
        updateToolAssignments(runtimeTools, approvalTools.filter((t) => t !== toolName));
      } else {
        updateToolAssignments(runtimeTools, [...approvalTools, toolName]);
      }
      return;
    }
    // Otherwise toggle in runtime tools
    if (runtimeTools.includes(toolName)) {
      updateToolAssignments(runtimeTools.filter((t) => t !== toolName), approvalTools);
    } else {
      updateToolAssignments([...runtimeTools, toolName], approvalTools);
    }
  };

  const toggleConnectedTool = (toolName: string) => {
    if (runtimeTools.includes(toolName)) {
      updateToolAssignments(runtimeTools.filter((t) => t !== toolName), approvalTools);
    } else {
      updateToolAssignments([...runtimeTools, toolName], approvalTools);
    }
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

  const isToolActive = (toolName: string) =>
    runtimeTools.includes(toolName) || approvalTools.includes(toolName);

  return (
    <div
      className={cn(
        'w-[28rem] bg-card border border-border/40 rounded-2xl shadow-lg flex flex-col max-h-[calc(100vh-8rem)] relative overflow-hidden',
        className
      )}
    >
      {/* Premium gradient accent */}
      <div className="absolute inset-0 pointer-events-none before:absolute before:inset-0 before:bg-gradient-to-b before:from-primary/5 before:to-transparent before:h-32" />

      {/* Header — shows node name */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0 relative z-10">
        <h3 className="font-semibold text-base">
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

      {/* Quick Edit — hero position, always visible */}
      {onApplyIntent && (
        <div className="px-4 pt-3 pb-2 relative z-10">
          <div className="space-y-2">
            <div className="relative">
              <Zap className="absolute left-3 top-2.5 h-3.5 w-3.5 text-primary/60" />
              <textarea
                value={intentInput}
                onChange={(e) => setIntentInput(e.target.value)}
                rows={2}
                className={cn(
                  'w-full pl-8 pr-3 py-2 text-sm rounded-lg',
                  'border border-border bg-background',
                  'focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/50',
                  'resize-none'
                )}
                placeholder="Tell me what to change — e.g. 'add web search' or 'rename to data_validator'"
              />
            </div>
            <div className="flex items-center justify-between gap-2">
              {intentFeedback ? (
                <p
                  className={cn(
                    'text-xs flex-1',
                    intentFeedback.type === 'success'
                      ? 'text-green-600 dark:text-green-400'
                      : 'text-red-600 dark:text-red-400'
                  )}
                >
                  {intentFeedback.text}
                </p>
              ) : (
                <span className="flex-1" />
              )}
              <button
                type="button"
                onClick={handleApplyIntent}
                className="px-2.5 py-1.5 text-xs rounded-lg border border-primary/30 bg-primary/10 text-primary hover:bg-primary/20 transition-colors shrink-0"
              >
                Apply
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tabbed content — scrollable */}
      <div className="flex-1 overflow-y-auto min-h-0 relative z-10">
        <Tabs defaultValue="basics" className="px-4 pb-4">
          <TabsList className="w-full">
            <TabsTrigger value="basics" className="flex-1 gap-1.5">
              <Target className="h-3.5 w-3.5" />
              Basics
            </TabsTrigger>
            <TabsTrigger value="tools" className="flex-1 gap-1.5">
              <Wrench className="h-3.5 w-3.5" />
              Tools
              {toolCount > 0 && (
                <span className="inline-flex items-center justify-center px-1.5 py-0.5 rounded-full text-xs font-medium bg-primary/10 text-primary min-w-[1.25rem]">
                  {toolCount}
                </span>
              )}
            </TabsTrigger>
            {!isSimple && (
              <TabsTrigger value="output" className="flex-1 gap-1.5">
                <Braces className="h-3.5 w-3.5" />
                Output
                {outputFieldCount > 0 && (
                  <span className="inline-flex items-center justify-center px-1.5 py-0.5 rounded-full text-xs font-medium bg-primary/10 text-primary min-w-[1.25rem]">
                    {outputFieldCount}
                  </span>
                )}
              </TabsTrigger>
            )}
          </TabsList>

          {/* Basics tab — goal + model */}
          <TabsContent value="basics" className="space-y-3">
            <div>
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
                placeholder="What should this step do?"
              />
            </div>

            {!isSimple && (
              <div className="space-y-1.5">
                <label className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
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
                  <option value="">Default (GPT Mini)</option>
                  {modelsByProvider
                    ? Object.entries(modelsByProvider).map(([provider, models]) => (
                        <optgroup key={provider} label={PROVIDER_LABELS[provider] ?? provider}>
                          {models.map((model) => (
                            <option key={model.modelId} value={`${model.provider}:${model.modelId}`}>
                              {model.displayName} · {TIER_LABELS[model.tier] ?? model.tier}
                              {model.inputCostPer1mTokens ? ` · ~$${model.inputCostPer1mTokens}` : ''}
                            </option>
                          ))}
                        </optgroup>
                      ))
                    : null}
                </select>
              </div>
            )}
          </TabsContent>

          {/* Tools tab — visual grid + approval + custom input */}
          <TabsContent value="tools" className="space-y-3">
            {/* Built-in tools grid */}
            <div className="grid grid-cols-3 gap-2">
              {Object.entries(BUILTIN_TOOLS).map(([toolName, info]) => {
                // In simple mode, skip approval-only tools
                if (isSimple && APPROVAL_TOOLS.has(toolName)) return null;

                const active = isToolActive(toolName);
                const needsApproval = APPROVAL_TOOLS.has(toolName);

                return (
                  <button
                    key={toolName}
                    type="button"
                    onClick={() => toggleBuiltinTool(toolName)}
                    className={cn(
                      'flex flex-col items-center gap-1 px-2 py-2.5 rounded-lg border text-center transition-all',
                      active
                        ? 'border-primary/50 bg-primary/10 text-foreground shadow-sm'
                        : 'border-border/60 bg-background text-muted-foreground hover:border-primary/30 hover:bg-muted/30'
                    )}
                  >
                    <span className="text-lg leading-none">{info.icon}</span>
                    <span className="text-xs font-medium">{info.label}</span>
                    <span className="text-[10px] leading-tight text-muted-foreground line-clamp-1">
                      {needsApproval ? 'Needs your OK' : info.description}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Connected / MCP / custom tools from suggestions */}
            {connectedTools.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground">Connected</p>
                <div className="flex flex-wrap gap-1.5">
                  {connectedTools.map((tool) => {
                    const active = runtimeTools.includes(tool);
                    return (
                      <button
                        key={tool}
                        type="button"
                        onClick={() => toggleConnectedTool(tool)}
                        className={cn(
                          'inline-flex items-center gap-1 px-2 py-1 text-xs rounded-lg border transition-colors',
                          active
                            ? 'border-indigo-500/50 bg-indigo-500/10 text-indigo-700 dark:text-indigo-300'
                            : 'border-border/60 bg-background text-muted-foreground hover:border-indigo-500/30 hover:bg-indigo-500/5'
                        )}
                      >
                        🔌 {tool.replace(/_/g, ' ')}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Approval tools (advanced only) */}
            {!isSimple && approvalTools.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground">Needs your OK first</p>
                <div className="flex flex-wrap gap-1.5">
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
            )}

            {/* Custom tool input */}
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
                placeholder="Add custom tool..."
                className={cn(
                  'px-2.5 py-1.5 text-xs rounded-md',
                  'border border-border bg-background',
                  'focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/50'
                )}
              />
              {!isSimple && (
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
              )}
              <button
                type="button"
                onClick={handleAddTool}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-md border border-primary/30 bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
              >
                <Plus className="h-3 w-3" />
                Add
              </button>
            </div>

            {toolFeedback && <p className="text-xs text-amber-600 dark:text-amber-400">{toolFeedback}</p>}
          </TabsContent>

          {/* Output tab (advanced only) */}
          {!isSimple && (
            <TabsContent value="output">
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
                  Define what this step returns
                </button>
              )}
            </TabsContent>
          )}
        </Tabs>
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
        'inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full border',
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
