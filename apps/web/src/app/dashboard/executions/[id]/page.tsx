'use client';

/**
 * Execution Detail Page
 *
 * Shows real-time execution timeline with SSE streaming.
 */

import { use } from 'react';
import Link from 'next/link';
import { trpc } from '@/lib/trpc/client';
import { ExecutionTimeline } from '@/components/executions';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { ArrowLeft, Loader2, XCircle } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import type { FlowNodeType } from '@/lib/baleybots/types';
import type { FlowExecutionStatus } from '@/lib/execution/types';
import { ROUTES } from '@/lib/routes';
import { Breadcrumbs } from '@/components/ui/breadcrumbs';

interface ExecutionPageProps {
  params: Promise<{ id: string }>;
}

export default function ExecutionPage({ params }: ExecutionPageProps) {
  const { id } = use(params);
  const { toast } = useToast();
  const utils = trpc.useUtils();

  // Fetch execution details
  const { data: execution, isLoading: executionLoading } = trpc.flows.getExecution.useQuery(
    { id },
    { enabled: !!id }
  );

  // Fetch the flow to get node information
  const { data: flow, isLoading: flowLoading } = trpc.flows.getById.useQuery(
    { id: execution?.flowId ?? '' },
    { enabled: !!execution?.flowId }
  );

  // Cancel mutation
  const cancelMutation = trpc.flows.cancelExecution.useMutation({
    onSuccess: () => {
      toast({
        title: 'Execution Cancelled',
        description: 'The execution has been cancelled.',
      });
      utils.flows.getExecution.invalidate({ id });
    },
    onError: (error) => {
      toast({
        title: 'Failed to Cancel',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const handleCancel = async () => {
    cancelMutation.mutate({ id });
  };

  const handleRetry = async () => {
    // Re-run the flow with the same input
    if (!execution?.flowId || !execution?.input) return;

    try {
      const response = await fetch(`/api/flows/${execution.flowId}/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input: execution.input }),
      });

      if (!response.ok) throw new Error('Failed to start execution');

      const data = await response.json();
      toast({
        title: 'Execution Started',
        description: 'A new execution has been started.',
      });

      // Navigate to the new execution
      window.location.href = ROUTES.executions.detail(data.executionId);
    } catch (error) {
      toast({
        title: 'Failed to Retry',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      });
    }
  };

  // Loading state
  if (executionLoading || flowLoading) {
    return (
      <div className="container py-10">
        <div className="flex items-center gap-4 mb-8">
          <Skeleton className="h-10 w-10 rounded-md" />
          <div className="space-y-2">
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-4 w-48" />
          </div>
        </div>
        <Skeleton className="h-64 w-full rounded-lg" />
      </div>
    );
  }

  // Not found state
  if (!execution) {
    return (
      <div className="container py-10">
        <EmptyState
          icon={XCircle}
          title="Execution not found"
          description="The execution you are looking for does not exist or has been deleted."
          action={{
            label: 'Back to Executions',
            href: ROUTES.executions.list,
          }}
        />
      </div>
    );
  }

  // Transform flow nodes for the timeline
  const nodes = (flow?.nodes as Array<{
    id: string;
    type: string;
    data: { label?: string; name?: string; blockId?: string };
  }> || []).map((node) => ({
    id: node.id,
    type: node.type as FlowNodeType,
    data: node.data,
  }));

  return (
    <div className="container py-10">
      <Breadcrumbs
        items={[
          { label: 'Executions', href: ROUTES.executions.list },
          { label: `Execution ${id.slice(0, 8)}...` }
        ]}
        className="mb-6"
      />

      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-4">
          <Button variant="outline" size="icon" asChild aria-label="Back to executions list">
            <Link href={ROUTES.executions.list}>
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              {flow?.name || 'Flow Execution'}
            </h1>
            <p className="text-sm text-muted-foreground">
              Execution ID: {execution.id}
            </p>
          </div>
        </div>
        {execution.status === 'running' && (
          <div className="flex items-center gap-2 text-blue-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-sm font-medium">Running...</span>
          </div>
        )}
      </div>

      {/* Timeline */}
      <ExecutionTimeline
        executionId={execution.id}
        nodes={nodes}
        initialExecution={{
          status: execution.status as FlowExecutionStatus,
          output: execution.output as unknown,
          error: typeof execution.error === 'string' ? execution.error : undefined,
          startedAt: execution.startedAt ?? undefined,
          completedAt: execution.completedAt,
          metrics: {
            durationMs: execution.completedAt && execution.startedAt
              ? new Date(execution.completedAt).getTime() - new Date(execution.startedAt).getTime()
              : undefined,
          },
        }}
        onCancel={handleCancel}
        onRetry={handleRetry}
      />
    </div>
  );
}
