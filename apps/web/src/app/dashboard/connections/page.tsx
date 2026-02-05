'use client';

import { useState } from 'react';
import Link from 'next/link';
import { trpc } from '@/lib/trpc/client';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { Plug, Plus, Wifi, WifiOff, Trash2, RefreshCw } from 'lucide-react';

/**
 * Map connection type to a badge variant. Falls back to 'secondary'
 * for database connection types that have no dedicated badge variant.
 */
function typeBadgeVariant(type: string): 'openai' | 'anthropic' | 'ollama' | 'secondary' {
  switch (type) {
    case 'openai':
      return 'openai';
    case 'anthropic':
      return 'anthropic';
    case 'ollama':
      return 'ollama';
    default:
      return 'secondary';
  }
}

/**
 * Render a colored status dot based on connection status.
 */
function StatusDot({ status }: { status: string }) {
  let colorClass: string;

  switch (status) {
    case 'connected':
      colorClass = 'bg-green-500';
      break;
    case 'error':
      colorClass = 'bg-red-500';
      break;
    default:
      colorClass = 'bg-gray-400';
      break;
  }

  return (
    <span className={cn('inline-block h-2.5 w-2.5 rounded-full shrink-0', colorClass)} />
  );
}

/**
 * Track per-connection test results for inline feedback.
 */
interface TestResult {
  success: boolean;
  message?: string;
}

/**
 * Connections management page.
 *
 * Lists all workspace connections with their type, status,
 * and actions to test or delete.
 */
export default function ConnectionsPage() {
  const utils = trpc.useUtils();
  const { data: connectionsList, isLoading } = trpc.connections.list.useQuery();

  const testMutation = trpc.connections.test.useMutation({
    onSuccess() {
      utils.connections.list.invalidate();
    },
  });

  const deleteMutation = trpc.connections.delete.useMutation({
    onSuccess() {
      utils.connections.list.invalidate();
    },
  });

  const [testResults, setTestResults] = useState<Record<string, TestResult>>({});

  async function handleTest(id: string): Promise<void> {
    // Clear previous result
    setTestResults((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });

    try {
      const result = await testMutation.mutateAsync({ id });
      setTestResults((prev) => ({
        ...prev,
        [id]: { success: result.success, message: result.success ? 'Connected' : 'Failed' },
      }));
    } catch {
      setTestResults((prev) => ({
        ...prev,
        [id]: { success: false, message: 'Test failed' },
      }));
    }
  }

  function handleDelete(id: string): void {
    deleteMutation.mutate({ id });
  }

  return (
    <div className="container py-10">
      <div className="flex flex-col gap-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Connections</h1>
            <p className="text-muted-foreground">
              Manage AI provider and database connections
            </p>
          </div>
          <Button asChild>
            <Link href="#">
              <Plus className="h-4 w-4 mr-2" />
              Add Connection
            </Link>
          </Button>
        </div>

        {/* Connections Grid */}
        {isLoading ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <Skeleton key={i} className="h-44" />
            ))}
          </div>
        ) : connectionsList && connectionsList.length > 0 ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {connectionsList.map((connection) => {
              const testResult = testResults[connection.id];

              return (
                <Card key={connection.id}>
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <StatusDot status={connection.status ?? 'unconfigured'} />
                        <CardTitle className="truncate text-base">
                          {connection.name}
                        </CardTitle>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <Badge variant={typeBadgeVariant(connection.type)}>
                          {connection.type}
                        </Badge>
                        {connection.isDefault && (
                          <Badge variant="outline">Default</Badge>
                        )}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {/* Test result feedback */}
                    {testResult && (
                      <div
                        className={cn(
                          'text-xs mb-3 flex items-center gap-1.5',
                          testResult.success
                            ? 'text-green-600'
                            : 'text-red-600'
                        )}
                      >
                        {testResult.success ? (
                          <Wifi className="h-3.5 w-3.5" />
                        ) : (
                          <WifiOff className="h-3.5 w-3.5" />
                        )}
                        {testResult.message}
                      </div>
                    )}

                    {/* Actions */}
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleTest(connection.id)}
                        disabled={testMutation.isPending}
                      >
                        <RefreshCw
                          className={cn(
                            'h-3.5 w-3.5 mr-1.5',
                            testMutation.isPending && 'animate-spin'
                          )}
                        />
                        Test
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDelete(connection.id)}
                        disabled={deleteMutation.isPending}
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                        Delete
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        ) : (
          <EmptyState
            icon={Plug}
            title="No connections"
            description="Add a connection to an AI provider or database to get started."
          />
        )}
      </div>
    </div>
  );
}
