/**
 * Tool Summary Registry
 *
 * Maps tool names to human-readable labels, icons, and summary generators.
 * This is the core of the anti-clutter approach — users see "Searching for X"
 * instead of `web_search({"query": "X"})`.
 *
 * Uses SDK's ToolCallSegment status values: 'running' | 'completed' | 'failed'
 */

import type { LucideIcon } from 'lucide-react';
import {
  Search, Globe, Bot, Bell, Database, Clock,
  Wrench, PlusCircle, Sparkles, FileText, Code,
} from 'lucide-react';
import type { ToolCallSegment } from '@baleybots/chat';

type ToolStatus = ToolCallSegment['status'];

export interface ToolSummary {
  /** Human-friendly verb phrase: "Searching the web", "Fetching page" */
  activeLabel: string;
  /** Past tense: "Searched the web", "Fetched page" */
  doneLabel: string;
  /** Icon component */
  icon: LucideIcon;
  /** Optional: extract key info from args for the summary line */
  summarizeArgs?: (args: unknown) => string | null;
  /** Optional: extract key info from result */
  summarizeResult?: (result: unknown) => string | null;
}

// ============================================================================
// BUILT-IN TOOL SUMMARIES
// ============================================================================

const TOOL_SUMMARIES: Record<string, ToolSummary> = {
  web_search: {
    activeLabel: 'Searching the web',
    doneLabel: 'Searched the web',
    icon: Search,
    summarizeArgs: (args) => {
      const query = safeGet(args, 'query');
      return query ? `for "${truncate(String(query), 50)}"` : null;
    },
    summarizeResult: (result) => {
      if (Array.isArray(result)) return `${result.length} results`;
      return null;
    },
  },
  fetch_url: {
    activeLabel: 'Fetching page',
    doneLabel: 'Fetched page',
    icon: Globe,
    summarizeArgs: (args) => {
      const url = safeGet(args, 'url');
      if (!url) return null;
      try { return new URL(String(url)).hostname; } catch { return truncate(String(url), 40); }
    },
  },
  spawn_baleybot: {
    activeLabel: 'Running bot',
    doneLabel: 'Ran bot',
    icon: Bot,
    summarizeArgs: (args) => {
      const name = safeGet(args, 'botName') ?? safeGet(args, 'name');
      return name ? String(name) : null;
    },
  },
  send_notification: {
    activeLabel: 'Sending notification',
    doneLabel: 'Sent notification',
    icon: Bell,
  },
  store_memory: {
    activeLabel: 'Saving data',
    doneLabel: 'Saved data',
    icon: Database,
    summarizeArgs: (args) => {
      const key = safeGet(args, 'key');
      return key ? `"${truncate(String(key), 30)}"` : null;
    },
  },
  schedule_task: {
    activeLabel: 'Scheduling task',
    doneLabel: 'Scheduled task',
    icon: Clock,
  },
  create_agent: {
    activeLabel: 'Creating agent',
    doneLabel: 'Created agent',
    icon: PlusCircle,
  },
  create_tool: {
    activeLabel: 'Creating tool',
    doneLabel: 'Created tool',
    icon: Wrench,
  },
  // Companion tools
  list_pending_actions: {
    activeLabel: 'Checking your actions',
    doneLabel: 'Checked actions',
    icon: FileText,
  },
  apply_action: {
    activeLabel: 'Applying recommendation',
    doneLabel: 'Applied recommendation',
    icon: Sparkles,
  },
  get_workspace_health: {
    activeLabel: 'Checking workspace health',
    doneLabel: 'Checked workspace health',
    icon: Sparkles,
  },
  review_execution: {
    activeLabel: 'Analyzing execution',
    doneLabel: 'Analyzed execution',
    icon: Code,
  },
  diagnose_failure: {
    activeLabel: 'Diagnosing failure',
    doneLabel: 'Diagnosed failure',
    icon: Search,
  },
};

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Get the human-readable label for a tool call.
 *
 * @returns "Searching the web for "quantum computing"" or "Searched the web — 5 results"
 */
export function getToolLabel(
  toolName: string,
  status: ToolStatus,
  args?: unknown,
  result?: unknown,
): string {
  const summary = TOOL_SUMMARIES[toolName];
  const isDone = status === 'completed';
  const isError = status === 'failed';

  // Base label
  const baseLabel = summary
    ? (isDone || isError ? summary.doneLabel : summary.activeLabel)
    : formatToolNameFallback(toolName, isDone || isError);

  // Arg summary (for active and done states)
  const argSummary = summary?.summarizeArgs?.(args);
  const resultSummary = isDone ? summary?.summarizeResult?.(result) : null;

  const parts = [baseLabel];
  if (argSummary) parts.push(argSummary);
  if (resultSummary) parts.push(`— ${resultSummary}`);

  return parts.join(' ');
}

/**
 * Get the icon for a tool.
 */
export function getToolIcon(toolName: string): LucideIcon {
  return TOOL_SUMMARIES[toolName]?.icon ?? Wrench;
}

/**
 * Register a custom tool summary (for workspace-specific tools).
 */
export function registerToolSummary(toolName: string, summary: ToolSummary): void {
  TOOL_SUMMARIES[toolName] = summary;
}

// ============================================================================
// HELPERS
// ============================================================================

function safeGet(obj: unknown, key: string): unknown {
  if (obj && typeof obj === 'object' && key in obj) {
    return (obj as Record<string, unknown>)[key];
  }
  return undefined;
}

function truncate(str: string, maxLen: number): string {
  return str.length > maxLen ? str.slice(0, maxLen) + '...' : str;
}

/** Fallback: web_search → "Running Web Search" / "Ran Web Search" */
function formatToolNameFallback(name: string, isDone: boolean): string {
  const humanName = name.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  return isDone ? `Ran ${humanName}` : `Running ${humanName}`;
}
