'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { FlowCard } from '@/components/flow/FlowCard';
import { ListSkeleton } from '@/components/ui/list-skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { useToast } from '@/components/ui/use-toast';
import { trpc } from '@/lib/trpc/client';
import { Plus, Workflow, GitBranch, PlayCircle, Boxes, Link2, AlertTriangle, ArrowRight } from 'lucide-react';
import { ROUTES } from '@/lib/routes';

export default function FlowsPage() {
  const router = useRouter();
  const { toast } = useToast();
  const utils = trpc.useUtils();

  // Fetch flows from tRPC
  const { data: flows, isLoading } = trpc.flows.list.useQuery();

  // Create mutation
  const createMutation = trpc.flows.create.useMutation({
    onSuccess: (newFlow) => {
      if (!newFlow) return;
      toast({
        title: 'Flow Created',
        description: 'Your new flow has been created.',
      });
      router.push(ROUTES.flows.detail(newFlow.id));
    },
    onError: (error) => {
      toast({
        title: 'Failed to Create Flow',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Delete mutation
  const deleteMutation = trpc.flows.delete.useMutation({
    onSuccess: () => {
      toast({
        title: 'Flow Deleted',
        description: 'The flow has been deleted.',
      });
      utils.flows.list.invalidate();
    },
    onError: (error) => {
      toast({
        title: 'Failed to Delete Flow',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Duplicate mutation
  const duplicateMutation = trpc.flows.duplicate.useMutation({
    onSuccess: () => {
      toast({
        title: 'Flow Duplicated',
        description: 'The flow has been duplicated.',
      });
      utils.flows.list.invalidate();
    },
    onError: (error) => {
      toast({
        title: 'Failed to Duplicate Flow',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const handleCreateFlow = () => {
    createMutation.mutate({
      name: 'New Flow',
      description: '',
    });
  };

  const handleDeleteFlow = (id: string) => {
    if (confirm('Are you sure you want to delete this flow?')) {
      deleteMutation.mutate({ id });
    }
  };

  const handleDuplicateFlow = (id: string) => {
    duplicateMutation.mutate({ id });
  };

  // Transform flows data for FlowCard component
  const transformedFlows = flows?.map((flow) => ({
    id: flow.id,
    name: flow.name,
    description: flow.description,
    enabled: flow.enabled ?? false,
    nodes: Array.isArray(flow.nodes) ? flow.nodes : [],
    edges: Array.isArray(flow.edges) ? flow.edges : [],
    createdAt: new Date(flow.createdAt),
    updatedAt: new Date(flow.updatedAt),
  })) || [];

  // Loading state
  if (isLoading) {
    return (
      <div className="container py-10">
        <ListSkeleton variant="card" count={6} />
      </div>
    );
  }

  return (
    <div className="container py-10">
      {/* Deprecation Notice */}
      <Alert className="border-yellow-200 bg-yellow-50 dark:border-yellow-800 dark:bg-yellow-950/20 mb-8">
        <AlertTriangle className="h-4 w-4 text-yellow-600" />
        <AlertTitle className="text-yellow-800 dark:text-yellow-200">
          Legacy Feature
        </AlertTitle>
        <AlertDescription className="text-yellow-700 dark:text-yellow-300">
          Flows are being replaced by BaleyBots - a more powerful, task-focused approach with BAL code.
          <Link
            href={ROUTES.dashboard}
            className="inline-flex items-center gap-1 ml-2 font-medium underline hover:no-underline"
          >
            Try BaleyBots
            <ArrowRight className="h-3 w-3" />
          </Link>
        </AlertDescription>
      </Alert>

      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold">Flows</h1>
          <p className="text-muted-foreground mt-1">
            Visual composition of blocks into workflows
          </p>
        </div>
        <Button onClick={handleCreateFlow} disabled={createMutation.isPending}>
          <Plus className="h-4 w-4 mr-2" />
          {createMutation.isPending ? 'Creating...' : 'Create Flow'}
        </Button>
      </div>

      {/* Stats */}
      {flows && flows.length > 0 && (
        <div className="grid gap-4 md:grid-cols-4 mb-8">
          <Card>
            <CardContent className="flex items-center gap-3 p-4">
              <div className="rounded-lg bg-primary/10 p-2">
                <GitBranch className="h-4 w-4 text-primary" />
              </div>
              <div>
                <div className="text-2xl font-bold">{flows.length}</div>
                <div className="text-xs text-muted-foreground">Total Flows</div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center gap-3 p-4">
              <div className="rounded-lg bg-green-500/10 p-2">
                <PlayCircle className="h-4 w-4 text-green-500" />
              </div>
              <div>
                <div className="text-2xl font-bold">
                  {flows.filter((f) => f.enabled).length}
                </div>
                <div className="text-xs text-muted-foreground">Enabled</div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center gap-3 p-4">
              <div className="rounded-lg bg-purple-500/10 p-2">
                <Boxes className="h-4 w-4 text-purple-500" />
              </div>
              <div>
                <div className="text-2xl font-bold">
                  {flows.reduce((sum, f) => sum + (f.nodeCount || 0), 0)}
                </div>
                <div className="text-xs text-muted-foreground">Total Nodes</div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center gap-3 p-4">
              <div className="rounded-lg bg-blue-500/10 p-2">
                <Link2 className="h-4 w-4 text-blue-500" />
              </div>
              <div>
                <div className="text-2xl font-bold">
                  {flows.reduce((sum, f) => sum + (f.edgeCount || 0), 0)}
                </div>
                <div className="text-xs text-muted-foreground">Total Edges</div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {transformedFlows.length === 0 ? (
        <EmptyState
          icon={Workflow}
          title="No flows yet"
          description="Get started by creating your first flow. Compose blocks visually to build powerful workflows."
          action={{
            label: 'Create Your First Flow',
            onClick: handleCreateFlow,
          }}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {transformedFlows.map((flow) => (
            <FlowCard
              key={flow.id}
              flow={flow}
              onDelete={handleDeleteFlow}
              onDuplicate={handleDuplicateFlow}
            />
          ))}
        </div>
      )}
    </div>
  );
}
