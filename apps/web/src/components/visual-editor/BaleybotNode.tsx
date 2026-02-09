'use client';

import { Handle, Position, type NodeProps, type Node } from '@xyflow/react';
import { Zap, Clock, Globe, Wrench, Target, Shield, Thermometer, Brain, RotateCcw, Database, Puzzle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { VisualNode } from '@/lib/baleybot/visual/types';

type BaleybotNodeData = VisualNode['data'];

// Define a custom node type for React Flow
type BaleybotNodeType = Node<BaleybotNodeData, 'baleybot'>;

export function BaleybotNode({ data, selected }: NodeProps<BaleybotNodeType>) {
  const nodeData = data;
  const dataSources = extractDataSources(nodeData.tools ?? []);

  const getTriggerIcon = () => {
    if (!nodeData.trigger) return null;
    switch (nodeData.trigger.type) {
      case 'schedule':
        return <Clock className="h-3 w-3 text-amber-500" />;
      case 'webhook':
        return <Globe className="h-3 w-3 text-blue-500" />;
      case 'other_bb':
        return <Zap className="h-3 w-3 text-emerald-500" />;
      case 'db_event':
        return <Database className="h-3 w-3 text-cyan-500" />;
      case 'mcp_event':
        return <Puzzle className="h-3 w-3 text-violet-500" />;
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
      case 'db_event': {
        const table = nodeData.trigger.dbTable?.trim();
        const dbEvent = nodeData.trigger.dbEvent?.trim();
        if (table && dbEvent) return `${table}:${dbEvent}`;
        if (table) return table;
        if (dbEvent) return `DB ${dbEvent}`;
        return 'DB event';
      }
      case 'mcp_event': {
        const server = nodeData.trigger.mcpServer?.trim();
        const tool = nodeData.trigger.mcpTool?.trim();
        const resource = nodeData.trigger.mcpResource?.trim();
        if (server && tool) return `${server}/${tool}`;
        if (server && resource) return `${server}:${resource}`;
        if (server) return `MCP ${server}`;
        return 'MCP event';
      }
      default:
        return null;
    }
  };

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
          'w-[290px] rounded-xl border bg-card shadow-lg transition-all',
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

          {/* Individual tools */}
          {nodeData.tools && nodeData.tools.length > 0 && (
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5">
                <Wrench className="h-3 w-3 text-muted-foreground shrink-0" />
                <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Tools</span>
              </div>
              <div className="flex flex-wrap gap-1">
                {nodeData.tools.map((tool) => (
                  <span
                    key={tool}
                    className={cn(
                      'inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium',
                      getToolStyle(tool)
                    )}
                  >
                    <span>{getToolIcon(tool)}</span>
                    {formatToolName(tool)}
                  </span>
                ))}
              </div>
            </div>
          )}

          {dataSources.length > 0 && (
            <div className="space-y-1">
              <div className="flex items-center gap-1.5">
                <Database className="h-3 w-3 text-cyan-500 shrink-0" />
                <span className="text-[10px] font-medium text-cyan-700 dark:text-cyan-300 uppercase tracking-wider">
                  Data Sources
                </span>
              </div>
              <div className="flex flex-wrap gap-1">
                {dataSources.map((source) => (
                  <span
                    key={source.id}
                    className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-cyan-500/10 text-cyan-700 dark:text-cyan-300 border border-cyan-500/20"
                  >
                    {source.label}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Approval-required tools */}
          {nodeData.canRequest && nodeData.canRequest.length > 0 && (
            <div className="space-y-1">
              <div className="flex items-center gap-1.5">
                <Shield className="h-3 w-3 text-amber-500 shrink-0" />
                <span className="text-[10px] font-medium text-amber-600 dark:text-amber-400 uppercase tracking-wider">Approval</span>
              </div>
              <div className="flex flex-wrap gap-1">
                {nodeData.canRequest.map((tool) => (
                  <span
                    key={tool}
                    className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/20"
                  >
                    {getToolIcon(tool)} {formatToolName(tool)}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Advanced config badges (only when selected) */}
          {selected && (nodeData.temperature !== undefined || nodeData.reasoning || nodeData.retries) && (
            <div className="flex flex-wrap gap-1.5">
              {nodeData.temperature !== undefined && (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-orange-500/10 text-orange-700 dark:text-orange-300 border border-orange-500/20">
                  <Thermometer className="h-2.5 w-2.5" />
                  {nodeData.temperature}
                </span>
              )}
              {nodeData.reasoning && (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-purple-500/10 text-purple-700 dark:text-purple-300 border border-purple-500/20">
                  <Brain className="h-2.5 w-2.5" />
                  {typeof nodeData.reasoning === 'object' ? nodeData.reasoning.effort : 'on'}
                </span>
              )}
              {nodeData.retries !== undefined && nodeData.retries > 0 && (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-500/10 text-blue-700 dark:text-blue-300 border border-blue-500/20">
                  <RotateCcw className="h-2.5 w-2.5" />
                  {nodeData.retries}x
                </span>
              )}
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

function getToolIcon(tool: string): string {
  if (tool === 'web_search') return '🔍';
  if (tool === 'fetch_url') return '🌐';
  if (tool === 'spawn_baleybot') return '🤖';
  if (tool === 'send_notification') return '🔔';
  if (tool === 'store_memory') return '💾';
  if (tool === 'shared_storage') return '📦';
  if (tool === 'schedule_task') return '📅';
  if (tool === 'create_agent') return '🧬';
  if (tool === 'create_tool') return '🔧';
  if (tool.startsWith('query_postgres')) return '🐘';
  if (tool.startsWith('query_mysql')) return '🐬';
  return '⚡';
}

function getToolStyle(tool: string): string {
  if (tool === 'spawn_baleybot') return 'bg-purple-500/10 text-purple-700 dark:text-purple-300 border border-purple-500/20';
  if (tool === 'store_memory' || tool === 'shared_storage') return 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/20';
  if (tool.startsWith('query_')) return 'bg-blue-500/10 text-blue-700 dark:text-blue-300 border border-blue-500/20';
  return 'bg-muted text-muted-foreground border border-border/50';
}

function formatToolName(tool: string): string {
  return tool.replace(/_/g, ' ');
}

function extractDataSources(
  tools: string[]
): Array<{ id: string; label: string }> {
  const sources = new Map<string, { id: string; label: string }>();

  for (const tool of tools) {
    const postgresMatch = tool.match(/^query_postgres_(.+)$/);
    if (postgresMatch?.[1]) {
      const slug = postgresMatch[1];
      sources.set(tool, {
        id: tool,
        label: `Postgres: ${formatSourceSlug(slug)}`,
      });
      continue;
    }

    const mysqlMatch = tool.match(/^query_mysql_(.+)$/);
    if (mysqlMatch?.[1]) {
      const slug = mysqlMatch[1];
      sources.set(tool, {
        id: tool,
        label: `MySQL: ${formatSourceSlug(slug)}`,
      });
    }
  }

  return Array.from(sources.values());
}

function formatSourceSlug(slug: string): string {
  return slug
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}
