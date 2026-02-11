'use client';

import { useState, useEffect, useRef } from 'react';
import { ChevronDown, ChevronRight, Bot, Loader2, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';

// ============================================================================
// TYPES
// ============================================================================

interface AgentActivityEvent {
  event: Record<string, unknown>;
  entityName?: string;
  timestamp: number;
}

interface AgentStatus {
  name: string;
  state: 'active' | 'done' | 'idle';
  lastActivity: string;
  startedAt: number;
  completedAt?: number;
}

interface AgentActivityPanelProps {
  events: AgentActivityEvent[];
  className?: string;
}

// ============================================================================
// HELPERS
// ============================================================================

function deriveAgentStatuses(events: AgentActivityEvent[]): AgentStatus[] {
  const agents = new Map<string, AgentStatus>();

  for (const entry of events) {
    const evt = entry.event;
    const type = evt.type as string;

    // Track child bot activity
    if (type === 'child_bot_event') {
      const childName = evt.childBotName as string;
      if (!childName) continue;

      const childEvent = evt.event as Record<string, unknown> | undefined;
      const childType = childEvent?.type as string | undefined;

      const existing = agents.get(childName);
      if (!existing) {
        agents.set(childName, {
          name: childName,
          state: 'active',
          lastActivity: describeEvent(childType),
          startedAt: entry.timestamp,
        });
      } else {
        existing.lastActivity = describeEvent(childType);
        if (childType === 'done') {
          existing.state = 'done';
          existing.completedAt = entry.timestamp;
        }
      }
    }

    // Track tool calls from the main creator_bot
    if (type === 'tool_start') {
      const toolName = evt.toolName as string;
      if (toolName === 'spawn_baleybot') {
        // A spawn was initiated — the child bot events will track the spawned bot
      }
    }
  }

  return Array.from(agents.values()).sort((a, b) => a.startedAt - b.startedAt);
}

function describeEvent(type?: string): string {
  switch (type) {
    case 'text_delta':
      return 'Responding...';
    case 'reasoning':
      return 'Thinking...';
    case 'tool_start':
      return 'Using tool...';
    case 'tool_complete':
      return 'Tool complete';
    case 'tool_output':
      return 'Processing result...';
    case 'done':
      return 'Done';
    default:
      return 'Working...';
  }
}

function formatDuration(startedAt: number, completedAt?: number): string {
  const elapsed = ((completedAt ?? Date.now()) - startedAt) / 1000;
  if (elapsed < 1) return '<1s';
  return `${elapsed.toFixed(1)}s`;
}

// ============================================================================
// COMPONENT
// ============================================================================

export function AgentActivityPanel({ events, className }: AgentActivityPanelProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [agentStatuses, setAgentStatuses] = useState<AgentStatus[]>([]);
  const prevEventCountRef = useRef(0);

  // Batch-update statuses using RAF to avoid per-event re-renders
  useEffect(() => {
    if (events.length === prevEventCountRef.current) return;
    prevEventCountRef.current = events.length;

    const id = requestAnimationFrame(() => {
      setAgentStatuses(deriveAgentStatuses(events));
    });
    return () => cancelAnimationFrame(id);
  }, [events]);

  // Don't render if no child bot activity
  const hasChildActivity = agentStatuses.length > 0;
  if (!hasChildActivity) return null;

  const activeCount = agentStatuses.filter((a) => a.state === 'active').length;
  const totalCount = agentStatuses.length;

  return (
    <div className={cn('rounded-lg border border-border/40 bg-card/50 overflow-hidden', className)}>
      {/* Minimized header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground hover:bg-muted/30 transition-colors"
      >
        {isExpanded ? (
          <ChevronDown className="h-3 w-3 shrink-0" />
        ) : (
          <ChevronRight className="h-3 w-3 shrink-0" />
        )}
        <span className="font-medium">
          {activeCount > 0
            ? `Working with ${activeCount} agent${activeCount !== 1 ? 's' : ''}...`
            : `${totalCount} agent${totalCount !== 1 ? 's' : ''} finished`}
        </span>
      </button>

      {/* Expanded content */}
      {isExpanded && (
        <div className="border-t border-border/30 px-3 py-2 space-y-1.5">
          {agentStatuses.map((agent) => (
            <AgentRow key={agent.name} agent={agent} />
          ))}
        </div>
      )}
    </div>
  );
}

function AgentRow({ agent }: { agent: AgentStatus }) {
  const [, setTick] = useState(0);

  // Tick every second for active agents to update duration
  useEffect(() => {
    if (agent.state !== 'active') return;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [agent.state]);

  return (
    <div className="flex items-center gap-2 text-xs">
      {/* Status icon */}
      {agent.state === 'active' ? (
        <Loader2 className="h-3 w-3 text-primary animate-spin shrink-0" />
      ) : (
        <CheckCircle2 className="h-3 w-3 text-green-500 shrink-0" />
      )}

      {/* Bot icon + name */}
      <Bot className="h-3 w-3 text-muted-foreground shrink-0" />
      <span className="font-medium text-foreground/80 min-w-0 truncate">
        {agent.name}
      </span>

      {/* Activity description */}
      <span className="text-muted-foreground/60 truncate flex-1 text-right">
        {agent.lastActivity}
      </span>

      {/* Duration */}
      <span className="text-muted-foreground/40 tabular-nums shrink-0">
        {formatDuration(agent.startedAt, agent.completedAt)}
      </span>
    </div>
  );
}
