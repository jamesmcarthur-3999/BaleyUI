'use client';

import { Handle, Position, type NodeProps, type Node } from '@xyflow/react';
import { cn } from '@/lib/utils';
import type { VisualNode } from '@/lib/baleybot/visual/types';

type BaleybotNodeData = VisualNode['data'];

// Define a custom node type for React Flow
type BaleybotNodeType = Node<BaleybotNodeData, 'baleybot'>;

// --- MCP prefix detection ---

export const MCP_PREFIXES: Record<string, string> = {
  'stripe_': 'Stripe', 'github_': 'GitHub', 'notion_': 'Notion',
  'linear_': 'Linear', 'hubspot_': 'HubSpot', 'sentry_': 'Sentry',
  'atlassian_': 'Atlassian', 'zapier_': 'Zapier', 'supabase_': 'Supabase',
  'neon_': 'Neon', 'cf_': 'Cloudflare', 'exa_': 'Exa',
  'paypal_': 'PayPal', 'square_': 'Square', 'canva_': 'Canva',
  'intercom_': 'Intercom', 'asana_': 'Asana', 'webflow_': 'Webflow',
  'maps_': 'Google Maps', 'telnyx_': 'Telnyx', 'box_': 'Box',
  'cloudinary_': 'Cloudinary', 'ramp_': 'Ramp', 'wiki_': 'DeepWiki',
  'hf_': 'Hugging Face', 'semgrep_': 'Semgrep', 'aws_': 'AWS',
  'mp_': 'Mercado Pago', 'wix_': 'Wix', 'buildkite_': 'Buildkite',
};

// --- Built-in tool display info ---

const BUILTIN_TOOLS: Record<string, { icon: string; label: string }> = {
  web_search: { icon: '🌐', label: 'Search' },
  fetch_url: { icon: '📡', label: 'Fetch' },
  spawn_baleybot: { icon: '🤖', label: 'Spawn' },
  send_notification: { icon: '🔔', label: 'Notify' },
  store_memory: { icon: '💾', label: 'Memory' },
  shared_storage: { icon: '📦', label: 'Storage' },
  schedule_task: { icon: '📅', label: 'Schedule' },
  create_agent: { icon: '🧬', label: 'Agent' },
  create_tool: { icon: '🔧', label: 'Tool' },
};

// --- Tool categorization ---

interface CategorizedTools {
  builtin: Array<{ icon: string; label: string }>;
  mcp: Array<{ name: string; toolCount: number }>;
  database: Array<{ type: string; name: string }>;
  custom: string[];
  approval: string[];
}

export function categorizeTools(tools: string[], canRequest: string[]): CategorizedTools {
  const result: CategorizedTools = {
    builtin: [],
    mcp: [],
    database: [],
    custom: [],
    approval: [...canRequest],
  };

  const mcpGroups = new Map<string, number>();

  for (const tool of tools) {
    // Check built-in
    if (BUILTIN_TOOLS[tool]) {
      result.builtin.push(BUILTIN_TOOLS[tool]);
      continue;
    }

    // Check database
    const pgMatch = tool.match(/^query_postgres_(.+)$/);
    if (pgMatch?.[1]) {
      result.database.push({ type: 'postgres', name: formatSourceSlug(pgMatch[1]) });
      continue;
    }
    const myMatch = tool.match(/^query_mysql_(.+)$/);
    if (myMatch?.[1]) {
      result.database.push({ type: 'mysql', name: formatSourceSlug(myMatch[1]) });
      continue;
    }

    // Check MCP prefix
    let isMcp = false;
    for (const [prefix, serviceName] of Object.entries(MCP_PREFIXES)) {
      if (tool.startsWith(prefix)) {
        mcpGroups.set(serviceName, (mcpGroups.get(serviceName) ?? 0) + 1);
        isMcp = true;
        break;
      }
    }
    if (isMcp) continue;

    // Everything else is custom
    result.custom.push(tool);
  }

  for (const [name, toolCount] of mcpGroups) {
    result.mcp.push({ name, toolCount });
  }

  return result;
}

// --- Node component ---

export function BaleybotNode({ data, selected }: NodeProps<BaleybotNodeType>) {
  const nodeData = data;
  const categorized = categorizeTools(nodeData.tools ?? [], nodeData.canRequest ?? []);

  const runtimeTone =
    nodeData.runtimeStatus === 'running'
      ? 'border-sky-500/40 ring-2 ring-sky-500/30'
      : nodeData.runtimeStatus === 'completed'
        ? 'border-emerald-500/40 ring-2 ring-emerald-500/30'
        : nodeData.runtimeStatus === 'needs_attention'
          ? 'border-red-500/40 ring-2 ring-red-500/30'
          : '';

  const statusDot =
    nodeData.runtimeStatus === 'running'
      ? 'bg-sky-500'
      : nodeData.runtimeStatus === 'completed'
        ? 'bg-emerald-500'
        : nodeData.runtimeStatus === 'needs_attention'
          ? 'bg-red-500'
          : null;

  const triggerIcon = nodeData.trigger && nodeData.trigger.type !== 'manual'
    ? getTriggerIcon(nodeData.trigger.type)
    : null;

  const hasTools = categorized.builtin.length > 0
    || categorized.mcp.length > 0
    || categorized.database.length > 0
    || categorized.custom.length > 0
    || categorized.approval.length > 0;

  const outputFields = nodeData.output ? Object.keys(nodeData.output) : [];

  return (
    <>
      {/* Input handle */}
      <Handle
        type="target"
        position={Position.Left}
        className="!w-2 !h-2 !bg-muted-foreground/50 !border-2 !border-background"
      />

      <div
        className={cn(
          'w-[290px] rounded-xl border bg-card shadow-sm transition-all',
          selected
            ? 'border-primary ring-2 ring-primary/20'
            : 'border-border hover:border-primary/50',
          runtimeTone
        )}
      >
        {/* Header */}
        <div className="px-4 py-3 border-b border-border/50">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 min-w-0">
              <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center text-lg shrink-0">
                {getNodeEmoji(nodeData.name)}
              </div>
              <h4 className="font-semibold text-sm truncate min-w-0">
                {formatNodeName(nodeData.name)}
              </h4>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              {statusDot && (
                <span className={cn('h-2 w-2 rounded-full', statusDot)} />
              )}
              {triggerIcon && (
                <span className="text-xs">{triggerIcon}</span>
              )}
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="px-4 py-3 space-y-2.5">
          {/* Goal */}
          <p className="text-xs text-muted-foreground line-clamp-2">
            {nodeData.goal || 'No goal specified'}
          </p>

          {/* Tools section */}
          {hasTools && (
            <div className="flex flex-wrap gap-1">
              {/* Built-in tools */}
              {categorized.builtin.map((t) => (
                <span
                  key={t.label}
                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-muted text-muted-foreground"
                >
                  {t.icon} {t.label}
                </span>
              ))}

              {/* MCP connections */}
              {categorized.mcp.map((m) => (
                <span
                  key={m.name}
                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-indigo-500/10 text-indigo-700 dark:text-indigo-300"
                >
                  🔌 {m.name}
                </span>
              ))}

              {/* Database connections */}
              {categorized.database.map((d) => (
                <span
                  key={`${d.type}-${d.name}`}
                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-cyan-500/10 text-cyan-700 dark:text-cyan-300"
                >
                  🗄️ {d.name}
                </span>
              ))}

              {/* Custom tools */}
              {categorized.custom.map((t) => (
                <span
                  key={t}
                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-muted text-muted-foreground"
                >
                  ⚡ {t.replace(/_/g, ' ')}
                </span>
              ))}

              {/* Approval tools */}
              {categorized.approval.map((t) => (
                <span
                  key={`approval-${t}`}
                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-500/10 text-amber-700 dark:text-amber-300"
                >
                  🛡️ {t.replace(/_/g, ' ')}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Output field names — subtle footer */}
        {outputFields.length > 0 && (
          <div className="px-4 py-2 bg-muted/30 border-t border-border/50 rounded-b-xl">
            <p className="text-[10px] text-muted-foreground truncate">
              → {outputFields.join(' · ')}
            </p>
          </div>
        )}
      </div>

      {/* Output handle */}
      <Handle
        type="source"
        position={Position.Right}
        className="!w-2 !h-2 !bg-muted-foreground/50 !border-2 !border-background"
      />
    </>
  );
}

// --- Exported helpers ---

export function formatNodeName(name: string): string {
  return name
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export function getNodeEmoji(name: string): string {
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

// --- Internal helpers ---

function getTriggerIcon(type: string): string {
  switch (type) {
    case 'schedule': return '⏰';
    case 'webhook': return '🌐';
    case 'other_bb': return '⚡';
    case 'db_event': return '🗄️';
    case 'mcp_event': return '🔌';
    case 'file_upload': return '📤';
    default: return '';
  }
}

function formatSourceSlug(slug: string): string {
  return slug
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}
