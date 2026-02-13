/**
 * Workspace Health Hook
 *
 * Monitors workspace health (connection status, errors, pending actions)
 * and provides a summary for the companion's context-aware behavior.
 */

'use client';

import { trpc } from '@/lib/trpc/client';

export interface HealthIssue {
  type: 'connection_error' | 'no_connections' | 'unconfigured_connection' | 'pending_critical_actions';
  details: string;
}

export function useWorkspaceHealth() {
  const { data: connections } = trpc.connections.list.useQuery(undefined, {
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const { data: recCounts } = trpc.recommendations.counts.useQuery(undefined, {
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const issues: HealthIssue[] = [];

  if (connections) {
    const errorConnections = connections.filter(
      (c) => c.status === 'error'
    );
    if (errorConnections.length > 0) {
      issues.push({
        type: 'connection_error',
        details: `${errorConnections.length} connection(s) in error state: ${errorConnections.map((c) => c.name).join(', ')}`,
      });
    }

    const unconfigured = connections.filter(
      (c) => c.status === 'unconfigured'
    );
    if (unconfigured.length > 0) {
      issues.push({
        type: 'unconfigured_connection',
        details: `${unconfigured.length} connection(s) not yet configured`,
      });
    }

    if (connections.length === 0) {
      issues.push({
        type: 'no_connections',
        details:
          'No connections configured. BaleyBots need at least one AI provider to run.',
      });
    }
  }

  const criticalActions = recCounts?.pendingBySeverity?.critical ?? 0;
  const pendingActions = recCounts?.pending ?? 0;

  if (criticalActions > 0) {
    issues.push({
      type: 'pending_critical_actions',
      details: `${criticalActions} critical action(s) need attention`,
    });
  }

  const healthy = connections?.filter((c) => c.status === 'connected').length ?? 0;
  const total = connections?.length ?? 0;

  const parts = [
    `${healthy} healthy, ${issues.filter((i) => i.type !== 'pending_critical_actions').length} issues out of ${total} connections`,
  ];
  if (pendingActions > 0) {
    parts.push(`${pendingActions} pending actions (${criticalActions} critical)`);
  }
  const summary = connections ? parts.join(', ') : 'Loading...';

  return {
    issues,
    hasIssues: issues.length > 0,
    summary,
    connectionCount: total,
    healthyCount: healthy,
    pendingActions,
    criticalActions,
  };
}
