'use client';

import { useUser } from '@clerk/nextjs';
import Link from 'next/link';
import { trpc } from '@/lib/trpc/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusBadge } from '@/components/ui/status-badge';
import { EmptyState } from '@/components/ui/empty-state';
import { ROUTES } from '@/lib/routes';
import {
  Blocks,
  Workflow,
  Play,
  Activity,
  Plus,
  ArrowRight,
  Clock,
  CheckCircle2,
  XCircle,
  Settings,
} from 'lucide-react';

export default function DashboardPage() {
  const { user } = useUser();

  // Fetch data for stats
  const { data: blocks, isLoading: blocksLoading } = trpc.blocks.list.useQuery();
  const { data: flows, isLoading: flowsLoading } = trpc.flows.list.useQuery();
  const { data: executions, isLoading: executionsLoading } = trpc.flows.listExecutions.useQuery({
    limit: 10,
  });
  const { data: connections, isLoading: connectionsLoading } = trpc.connections.list.useQuery();

  const isLoading = blocksLoading || flowsLoading || executionsLoading || connectionsLoading;

  // Calculate stats
  const stats = {
    totalBlocks: blocks?.length || 0,
    aiBlocks: blocks?.filter((b) => b.type === 'ai').length || 0,
    functionBlocks: blocks?.filter((b) => b.type === 'function').length || 0,
    totalFlows: flows?.length || 0,
    enabledFlows: flows?.filter((f) => f.enabled).length || 0,
    totalExecutions: executions?.length || 0,
    runningExecutions: executions?.filter((e) => e.status === 'running' || e.status === 'pending').length || 0,
    completedExecutions: executions?.filter((e) => e.status === 'completed').length || 0,
    failedExecutions: executions?.filter((e) => e.status === 'failed').length || 0,
    totalConnections: connections?.length || 0,
    configuredConnections: connections?.filter((c) => c.status === 'connected').length || 0,
  };

  // Get recent executions for activity feed
  const recentExecutions = executions?.slice(0, 5) || [];

  return (
    <div className="container py-10">
      <div className="flex flex-col gap-8">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            Welcome back{user?.firstName ? `, ${user.firstName}` : ''}
          </h1>
          <p className="text-muted-foreground">
            Manage your AI blocks, flows, and connections from here.
          </p>
        </div>

        {/* Main Stats */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Blocks</CardTitle>
              <Blocks className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-8 w-16" />
              ) : (
                <>
                  <div className="text-2xl font-bold">{stats.totalBlocks}</div>
                  <p className="text-xs text-muted-foreground">
                    {stats.aiBlocks} AI, {stats.functionBlocks} Function
                  </p>
                </>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Active Flows</CardTitle>
              <Workflow className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-8 w-16" />
              ) : (
                <>
                  <div className="text-2xl font-bold">{stats.enabledFlows}</div>
                  <p className="text-xs text-muted-foreground">
                    of {stats.totalFlows} total flows
                  </p>
                </>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Executions</CardTitle>
              <Activity className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-8 w-16" />
              ) : (
                <>
                  <div className="text-2xl font-bold">{stats.totalExecutions}</div>
                  <p className="text-xs text-muted-foreground">
                    {stats.runningExecutions} running, {stats.completedExecutions} completed
                  </p>
                </>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Connections</CardTitle>
              <Settings className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-8 w-16" />
              ) : (
                <>
                  <div className="text-2xl font-bold">{stats.configuredConnections}</div>
                  <p className="text-xs text-muted-foreground">
                    of {stats.totalConnections} configured
                  </p>
                </>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {/* Recent Activity */}
          <Card>
            <CardHeader>
              <CardTitle>Recent Activity</CardTitle>
              <CardDescription>Latest flow executions</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="space-y-3">
                  {[1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : recentExecutions.length > 0 ? (
                <div className="space-y-3">
                  {recentExecutions.map((execution) => (
                    <Link
                      key={execution.id}
                      href={ROUTES.executions.detail(execution.id)}
                      className="flex items-center justify-between rounded-lg border p-3 hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        {execution.status === 'completed' ? (
                          <CheckCircle2 className="h-4 w-4 text-green-500" />
                        ) : execution.status === 'failed' ? (
                          <XCircle className="h-4 w-4 text-red-500" />
                        ) : execution.status === 'running' ? (
                          <Play className="h-4 w-4 text-blue-500 animate-pulse" />
                        ) : (
                          <Clock className="h-4 w-4 text-muted-foreground" />
                        )}
                        <div>
                          <p className="text-sm font-medium">
                            {execution.flow?.name || 'Unknown Flow'}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {execution.startedAt
                              ? new Date(execution.startedAt).toLocaleString()
                              : 'Pending'}
                          </p>
                        </div>
                      </div>
                      <StatusBadge status={execution.status as 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'} />
                    </Link>
                  ))}
                  <Button variant="ghost" className="w-full" asChild>
                    <Link href={ROUTES.executions.list}>
                      View All Executions
                      <ArrowRight className="h-4 w-4 ml-2" />
                    </Link>
                  </Button>
                </div>
              ) : (
                <EmptyState
                  icon={Play}
                  title="No executions yet"
                  description="Run a flow to see activity here."
                  action={{
                    label: 'Go to Flows',
                    href: ROUTES.flows.list,
                  }}
                />
              )}
            </CardContent>
          </Card>

          {/* Quick Actions */}
          <Card>
            <CardHeader>
              <CardTitle>Quick Actions</CardTitle>
              <CardDescription>Common tasks to get started</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button className="w-full justify-start" asChild>
                <Link href={ROUTES.blocks.list}>
                  <Plus className="h-4 w-4 mr-2" />
                  Create New Block
                </Link>
              </Button>
              <Button variant="outline" className="w-full justify-start" asChild>
                <Link href={ROUTES.flows.list}>
                  <Workflow className="h-4 w-4 mr-2" />
                  Create New Flow
                </Link>
              </Button>
              <Button variant="outline" className="w-full justify-start" asChild>
                <Link href={ROUTES.settings.connections}>
                  <Settings className="h-4 w-4 mr-2" />
                  Configure Connections
                </Link>
              </Button>
              <Button variant="outline" className="w-full justify-start" asChild>
                <Link href={ROUTES.decisions.list}>
                  <Activity className="h-4 w-4 mr-2" />
                  View AI Decisions
                </Link>
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Getting Started (show if no data) */}
        {!isLoading && stats.totalBlocks === 0 && stats.totalConnections === 0 && (
          <Card className="border-dashed">
            <CardHeader>
              <CardTitle>Getting Started</CardTitle>
              <CardDescription>
                Follow these steps to set up your first AI workflow
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-3">
                <div className="flex flex-col items-center text-center p-4">
                  <div className="rounded-full bg-primary/10 p-3 mb-3">
                    <Settings className="h-6 w-6 text-primary" />
                  </div>
                  <h3 className="font-medium mb-1">1. Add a Connection</h3>
                  <p className="text-sm text-muted-foreground mb-3">
                    Connect to OpenAI, Anthropic, or Ollama
                  </p>
                  <Button size="sm" asChild>
                    <Link href={ROUTES.settings.connections}>Add Connection</Link>
                  </Button>
                </div>
                <div className="flex flex-col items-center text-center p-4">
                  <div className="rounded-full bg-primary/10 p-3 mb-3">
                    <Blocks className="h-6 w-6 text-primary" />
                  </div>
                  <h3 className="font-medium mb-1">2. Create a Block</h3>
                  <p className="text-sm text-muted-foreground mb-3">
                    Build reusable AI or function blocks
                  </p>
                  <Button size="sm" variant="outline" asChild>
                    <Link href={ROUTES.blocks.list}>Create Block</Link>
                  </Button>
                </div>
                <div className="flex flex-col items-center text-center p-4">
                  <div className="rounded-full bg-primary/10 p-3 mb-3">
                    <Workflow className="h-6 w-6 text-primary" />
                  </div>
                  <h3 className="font-medium mb-1">3. Build a Flow</h3>
                  <p className="text-sm text-muted-foreground mb-3">
                    Compose blocks into visual workflows
                  </p>
                  <Button size="sm" variant="outline" asChild>
                    <Link href={ROUTES.flows.list}>Build Flow</Link>
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
