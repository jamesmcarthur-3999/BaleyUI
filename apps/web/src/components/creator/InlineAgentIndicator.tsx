'use client';

import { useEffect, useRef, useState } from 'react';
import { Loader2, CheckCircle2, AlertCircle } from 'lucide-react';

// ============================================================================
// TYPES
// ============================================================================

interface AgentActivityEvent {
  event: Record<string, unknown>;
  entityName?: string;
  timestamp: number;
}

interface DerivedAgent {
  name: string;
  status: 'active' | 'done' | 'error';
  startedAt: number;
  durationMs?: number;
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Human-readable labels for known specialist bots.
 */
function humanizeBotName(name: string): string {
  const labels: Record<string, string> = {
    bal_generator: 'Generating BAL code',
    connection_advisor: 'Checking connections',
    test_orchestrator: 'Designing tests',
    deployment_advisor: 'Evaluating readiness',
  };
  return labels[name] ?? name.replace(/_/g, ' ');
}

/**
 * Derive agent statuses from raw event stream.
 * Reuses the same logic pattern as AgentActivityPanel.
 */
function deriveAgents(events: AgentActivityEvent[]): DerivedAgent[] {
  const agents = new Map<string, DerivedAgent>();

  for (const entry of events) {
    const evt = entry.event;
    const type = evt.type as string;

    if (type === 'child_bot_event') {
      const childName = evt.childBotName as string;
      if (!childName) continue;

      const childEvent = evt.event as Record<string, unknown> | undefined;
      const childType = childEvent?.type as string | undefined;

      const existing = agents.get(childName);
      if (!existing) {
        agents.set(childName, {
          name: childName,
          status: 'active',
          startedAt: entry.timestamp,
        });
      } else if (childType === 'done') {
        existing.status = 'done';
        existing.durationMs = entry.timestamp - existing.startedAt;
      }
    }
  }

  return Array.from(agents.values()).sort((a, b) => a.startedAt - b.startedAt);
}

// ============================================================================
// COMPONENTS
// ============================================================================

function InlineAgentIndicator({
  agentName,
  status,
  durationMs,
}: {
  agentName: string;
  status: 'active' | 'done' | 'error';
  durationMs?: number;
}) {
  const label = humanizeBotName(agentName);
  const duration = durationMs ? `${(durationMs / 1000).toFixed(1)}s` : undefined;

  return (
    <div className="flex items-center gap-2 py-2 my-2 text-xs text-muted-foreground/60">
      <div className="flex-1 h-px bg-border/30" />
      {status === 'active' ? (
        <Loader2 className="h-3 w-3 animate-spin text-primary/50" />
      ) : status === 'done' ? (
        <CheckCircle2 className="h-3 w-3 text-emerald-500/50" />
      ) : (
        <AlertCircle className="h-3 w-3 text-destructive/50" />
      )}
      <span className="whitespace-nowrap">{label}</span>
      {duration && <span className="tabular-nums">{duration}</span>}
      <div className="flex-1 h-px bg-border/30" />
    </div>
  );
}

/**
 * Renders inline agent activity indicators derived from raw agent events.
 * Shows as subtle dividers in the chat flow: `── [spinner] Generating BAL code  3.2s ──`
 */
export function InlineAgentIndicators({ events }: { events: AgentActivityEvent[] }) {
  const [agents, setAgents] = useState<DerivedAgent[]>([]);
  const prevCountRef = useRef(0);

  useEffect(() => {
    if (events.length === prevCountRef.current) return;
    prevCountRef.current = events.length;

    const id = requestAnimationFrame(() => {
      setAgents(deriveAgents(events));
    });
    return () => cancelAnimationFrame(id);
  }, [events]);

  if (agents.length === 0) return null;

  return (
    <>
      {agents.map((agent) => (
        <InlineAgentIndicator
          key={agent.name}
          agentName={agent.name}
          status={agent.status}
          durationMs={agent.durationMs}
        />
      ))}
    </>
  );
}
