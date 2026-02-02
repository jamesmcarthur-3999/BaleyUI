'use client';

import { useUser } from '@clerk/nextjs';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { trpc } from '@/lib/trpc/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { KeyboardShortcut } from '@/components/ui/kbd';
import { ROUTES } from '@/lib/routes';
import {
  Bot,
  Workflow,
  Play,
  ArrowRight,
  Plus,
  Clock,
  CheckCircle2,
  XCircle,
} from 'lucide-react';

export default function HomePage() {
  const { user } = useUser();
  const router = useRouter();

  // Fetch recent data
  const { data: blocks, isLoading: blocksLoading } = trpc.blocks.list.useQuery();
  const { data: executions, isLoading: executionsLoading } = trpc.flows.listExecutions.useQuery({
    limit: 5,
  });

  const isLoading = blocksLoading || executionsLoading;
  const hasAgents = (blocks?.length || 0) > 0;
  const recentExecutions = executions?.slice(0, 3) || [];

  // Greeting based on time
  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  };

  return (
    <div className="container max-w-4xl py-12">
      {/* Greeting */}
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">
          {getGreeting()}{user?.firstName ? `, ${user.firstName}` : ''}
        </h1>
        <p className="text-muted-foreground mt-1">
          What would you like to do?
        </p>
      </div>

      {/* Primary Actions - Job-Oriented */}
      <div className="grid gap-4 sm:grid-cols-2 mb-8">
        <Card
          className="cursor-pointer transition-colors hover:bg-muted/50 group"
          onClick={() => router.push(ROUTES.blocks.create)}
        >
          <CardHeader className="pb-2">
            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center mb-2">
              <Plus className="h-5 w-5 text-primary" />
            </div>
            <CardTitle className="text-base flex items-center gap-2">
              Create an agent
              <ArrowRight className="h-4 w-4 opacity-0 group-hover:opacity-100 transition-opacity" />
            </CardTitle>
            <CardDescription>
              Build AI that analyzes data, generates reports, or automates tasks
            </CardDescription>
          </CardHeader>
        </Card>

        <Card
          className="cursor-pointer transition-colors hover:bg-muted/50 group"
          onClick={() => router.push(ROUTES.flows.create)}
        >
          <CardHeader className="pb-2">
            <div className="h-10 w-10 rounded-lg bg-blue-500/10 flex items-center justify-center mb-2">
              <Workflow className="h-5 w-5 text-blue-500" />
            </div>
            <CardTitle className="text-base flex items-center gap-2">
              Build a workflow
              <ArrowRight className="h-4 w-4 opacity-0 group-hover:opacity-100 transition-opacity" />
            </CardTitle>
            <CardDescription>
              Connect multiple agents into automated pipelines
            </CardDescription>
          </CardHeader>
        </Card>
      </div>

      {/* Recent Agents */}
      {isLoading ? (
        <div className="space-y-3 mb-8">
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : hasAgents ? (
        <div className="mb-8">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-medium text-muted-foreground">Your agents</h2>
            <Button variant="ghost" size="sm" asChild>
              <Link href={ROUTES.blocks.list}>
                View all
                <ArrowRight className="h-3 w-3 ml-1" />
              </Link>
            </Button>
          </div>
          <div className="space-y-2">
            {blocks?.slice(0, 3).map((block) => (
              <Link
                key={block.id}
                href={ROUTES.blocks.detail(block.id)}
                className="flex items-center gap-3 p-3 rounded-lg border hover:bg-muted/50 transition-colors"
              >
                <div className="h-9 w-9 rounded-md bg-muted flex items-center justify-center">
                  <Bot className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">{block.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {block.type === 'ai' ? 'AI Agent' : 'Function'}
                  </p>
                </div>
                <Button variant="ghost" size="sm">
                  <Play className="h-4 w-4" />
                </Button>
              </Link>
            ))}
          </div>
        </div>
      ) : (
        <Card className="mb-8 border-dashed">
          <CardContent className="py-8">
            <EmptyState
              icon={Bot}
              title="No agents yet"
              description="Create your first agent to get started with AI automation."
              action={{
                label: 'Create Agent',
                href: ROUTES.blocks.create,
              }}
            />
          </CardContent>
        </Card>
      )}

      {/* Recent Activity */}
      {recentExecutions.length > 0 && (
        <div className="mb-8">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-medium text-muted-foreground">Recent activity</h2>
            <Button variant="ghost" size="sm" asChild>
              <Link href={ROUTES.executions.list}>
                View all
                <ArrowRight className="h-3 w-3 ml-1" />
              </Link>
            </Button>
          </div>
          <div className="space-y-2">
            {recentExecutions.map((execution) => (
              <Link
                key={execution.id}
                href={ROUTES.executions.detail(execution.id)}
                className="flex items-center gap-3 p-3 rounded-lg border hover:bg-muted/50 transition-colors"
              >
                {execution.status === 'completed' ? (
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                ) : execution.status === 'failed' ? (
                  <XCircle className="h-4 w-4 text-red-500" />
                ) : (
                  <Clock className="h-4 w-4 text-muted-foreground" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">
                    {execution.flow?.name || 'Unknown'}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {execution.startedAt
                      ? new Date(execution.startedAt).toLocaleString()
                      : 'Pending'}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Keyboard Shortcut Hint */}
      <div className="text-center text-sm text-muted-foreground">
        Press <KeyboardShortcut shortcut="mod+k" /> anytime to search or run commands
      </div>
    </div>
  );
}
