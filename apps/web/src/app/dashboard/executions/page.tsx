'use client';

/**
 * Executions Page
 *
 * Lists all flow executions with filtering and status.
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { trpc } from '@/lib/trpc/client';
import { ExecutionList } from '@/components/executions';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Play, Activity, CheckCircle2, XCircle, Clock } from 'lucide-react';
import type { FlowExecutionStatus } from '@/lib/execution/types';
import { ROUTES } from '@/lib/routes';

export default function ExecutionsPage() {
  const router = useRouter();
  const [statusFilter, setStatusFilter] = useState<FlowExecutionStatus | 'all'>('all');
  const [flowFilter, setFlowFilter] = useState<string>('all');

  // Fetch executions
  const { data: executions, isLoading: executionsLoading } = trpc.flows.listExecutions.useQuery({
    status: statusFilter === 'all' ? undefined : statusFilter,
    flowId: flowFilter === 'all' ? undefined : flowFilter,
    limit: 50,
  });

  // Fetch flows for filter dropdown
  const { data: flows } = trpc.flows.list.useQuery();

  // Calculate stats
  const stats = {
    total: executions?.length || 0,
    running: executions?.filter((e) => e.status === 'running' || e.status === 'pending').length || 0,
    completed: executions?.filter((e) => e.status === 'completed').length || 0,
    failed: executions?.filter((e) => e.status === 'failed').length || 0,
  };

  // Transform executions for the list component
  const transformedExecutions = executions?.map((execution) => ({
    id: execution.id,
    flowId: execution.flowId,
    status: execution.status as FlowExecutionStatus,
    startedAt: execution.startedAt ?? new Date(),
    completedAt: execution.completedAt,
    triggeredBy: (execution.triggeredBy as { type: 'manual' | 'webhook' | 'schedule' }) ?? { type: 'manual' as const },
    flow: {
      name: execution.flow?.name || 'Unknown Flow',
    },
  })) || [];

  const handleRunFlow = () => {
    router.push(ROUTES.flows.list);
  };

  return (
    <div className="container py-10">
      <div className="flex flex-col gap-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Executions</h1>
            <p className="text-muted-foreground">
              Monitor and manage your flow executions
            </p>
          </div>
          <Button onClick={handleRunFlow}>
            <Play className="h-4 w-4 mr-2" />
            Run a Flow
          </Button>
        </div>

        {/* Stats */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Executions</CardTitle>
              <Activity className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.total}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Running</CardTitle>
              <Clock className="h-4 w-4 text-blue-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.running}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Completed</CardTitle>
              <CheckCircle2 className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.completed}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Failed</CardTitle>
              <XCircle className="h-4 w-4 text-red-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.failed}</div>
            </CardContent>
          </Card>
        </div>

        {/* Executions List */}
        <ExecutionList
          executions={transformedExecutions}
          isLoading={executionsLoading}
          statusFilter={statusFilter}
          onStatusFilterChange={setStatusFilter}
          flowFilter={flowFilter}
          flows={flows?.map((f) => ({ id: f.id, name: f.name })) || []}
          onFlowFilterChange={setFlowFilter}
          onRunFlow={handleRunFlow}
        />
      </div>
    </div>
  );
}
