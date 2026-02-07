'use client';

import { useState } from 'react';
import { trpc } from '@/lib/trpc/client';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/components/ui/use-toast';
import { cn } from '@/lib/utils';
import { Plug, Wifi, WifiOff, Trash2, RefreshCw, Star, Database, Bot } from 'lucide-react';
import { AddConnectionDialog } from '@/components/connections';
import { PROVIDERS } from '@/lib/connections/providers';
import type { ProviderType } from '@/lib/connections/providers';

// ============================================================================
// HELPERS
// ============================================================================

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


function isDbType(type: string): boolean {
  return type === 'postgres' || type === 'mysql';
}

function getCategoryIcon(type: string) {
  return isDbType(type) ? Database : Bot;
}

// ============================================================================
// CONNECTION CARD
// ============================================================================

interface TestResult {
  success: boolean;
  message?: string;
  tableCount?: number;
}

function ConnectionCardItem({
  connection,
  testResult,
  onTest,
  isTesting,
  onDelete,
  onSetDefault,
}: {
  connection: {
    id: string;
    type: string;
    name: string;
    status: string | null;
    isDefault: boolean | null;
    config: Record<string, unknown>;
    lastCheckedAt: Date | null;
    availableModels: unknown;
  };
  testResult?: TestResult;
  onTest: (id: string) => void;
  isTesting: boolean;
  onDelete: (id: string) => void;
  onSetDefault: (id: string) => void;
}) {
  const provider = PROVIDERS[connection.type as ProviderType];
  const config = (connection.config ?? {}) as Record<string, string | number | boolean | null | undefined>;
  const CategoryIcon = getCategoryIcon(connection.type);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <StatusDot status={connection.status ?? 'unconfigured'} />
            <CategoryIcon className="h-4 w-4 text-muted-foreground shrink-0" />
            <CardTitle className="truncate text-base">
              {connection.name}
            </CardTitle>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <Badge variant={typeBadgeVariant(connection.type)}>
              {provider?.name ?? connection.type}
            </Badge>
            {connection.isDefault && (
              <Badge variant="outline" className="gap-1">
                <Star className="h-3 w-3 fill-current" />
                Default
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {/* Connection details */}
        <div className="space-y-1 text-sm mb-3">
          <p className="text-xs text-muted-foreground">
            {provider?.description}
          </p>

          {/* AI provider details */}
          {!isDbType(connection.type) && (
            <>
              {!!config.baseUrl && (
                <div className="flex items-center gap-1.5">
                  <span className="text-muted-foreground text-xs">URL:</span>
                  <span className="font-mono text-xs truncate">{String(config.baseUrl)}</span>
                </div>
              )}
              {!!config._hasApiKey && (
                <div className="flex items-center gap-1.5">
                  <span className="text-muted-foreground text-xs">API Key:</span>
                  <span className="font-mono text-xs">{String(config.apiKey)}</span>
                </div>
              )}
            </>
          )}

          {/* Database provider details */}
          {isDbType(connection.type) && (
            <>
              {!!config.host && (
                <div className="flex items-center gap-1.5">
                  <span className="text-muted-foreground text-xs">Host:</span>
                  <span className="font-mono text-xs">
                    {String(config.host)}{config.port ? `:${String(config.port)}` : ''}
                  </span>
                </div>
              )}
              {!!config.database && (
                <div className="flex items-center gap-1.5">
                  <span className="text-muted-foreground text-xs">Database:</span>
                  <span className="font-mono text-xs">{String(config.database)}</span>
                </div>
              )}
              {!!config.username && (
                <div className="flex items-center gap-1.5">
                  <span className="text-muted-foreground text-xs">User:</span>
                  <span className="font-mono text-xs">{String(config.username)}</span>
                </div>
              )}
              {!!config._hasPassword && (
                <div className="flex items-center gap-1.5">
                  <span className="text-muted-foreground text-xs">Password:</span>
                  <span className="font-mono text-xs">{String(config.password)}</span>
                </div>
              )}
              {!!config.ssl && (
                <div className="flex items-center gap-1.5">
                  <span className="text-muted-foreground text-xs">SSL:</span>
                  <Badge variant="outline" className="text-xs px-1 py-0">Enabled</Badge>
                </div>
              )}
            </>
          )}

          {/* Schema info for database connections */}
          {isDbType(connection.type) && !!connection.availableModels && typeof connection.availableModels === 'object' && (
            <div className="flex items-center gap-1.5">
              <span className="text-muted-foreground text-xs">Tables:</span>
              <span className="text-xs">
                {Array.isArray((connection.availableModels as { tables?: unknown[] }).tables)
                  ? `${((connection.availableModels as { tables: unknown[] }).tables).length} cached`
                  : 'Schema cached'}
              </span>
            </div>
          )}

          {connection.lastCheckedAt && (
            <div className="flex items-center gap-1.5">
              <span className="text-muted-foreground text-xs">Checked:</span>
              <span className="text-xs">
                {new Date(connection.lastCheckedAt).toLocaleString()}
              </span>
            </div>
          )}
        </div>

        {/* Test result feedback */}
        {testResult && (
          <div
            className={cn(
              'text-xs mb-3 flex items-center gap-1.5 rounded-md px-2 py-1.5',
              testResult.success
                ? 'bg-green-50 text-green-700 dark:bg-green-950/30 dark:text-green-400'
                : 'bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-400'
            )}
          >
            {testResult.success ? (
              <Wifi className="h-3.5 w-3.5 shrink-0" />
            ) : (
              <WifiOff className="h-3.5 w-3.5 shrink-0" />
            )}
            <span className="truncate">{testResult.message}</span>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onTest(connection.id)}
            disabled={isTesting}
          >
            <RefreshCw
              className={cn(
                'h-3.5 w-3.5 mr-1.5',
                isTesting && 'animate-spin'
              )}
            />
            Test
          </Button>
          {!connection.isDefault && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onSetDefault(connection.id)}
            >
              <Star className="h-3.5 w-3.5 mr-1.5" />
              Set Default
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onDelete(connection.id)}
            className="text-destructive hover:text-destructive ml-auto"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================================================
// MAIN PAGE
// ============================================================================

export default function ConnectionsPage() {
  const { toast } = useToast();
  const utils = trpc.useUtils();
  const { data: connectionsList, isLoading } = trpc.connections.list.useQuery(undefined, {
    staleTime: 10 * 60 * 1000,
  });

  const [testResults, setTestResults] = useState<Record<string, TestResult>>({});
  const [testingId, setTestingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);

  const testMutation = trpc.connections.test.useMutation({
    onSuccess: (_data, variables) => {
      utils.connections.list.invalidate();
      if (variables.id) {
        setTestResults((prev) => ({
          ...prev,
          [variables.id!]: {
            success: _data.success,
            message: _data.message,
            tableCount: _data.details?.tableCount,
          },
        }));
      }
    },
    onSettled: () => {
      setTestingId(null);
    },
  });

  const deleteMutation = trpc.connections.delete.useMutation({
    onSuccess: () => {
      toast({
        title: 'Connection Deleted',
        description: 'The connection has been removed.',
      });
      utils.connections.list.invalidate();
      setDeleteTarget(null);
    },
    onError: (error) => {
      toast({
        title: 'Delete Failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const setDefaultMutation = trpc.connections.setDefault.useMutation({
    onSuccess: () => {
      toast({
        title: 'Default Updated',
        description: 'This connection is now the default for its type.',
      });
      utils.connections.list.invalidate();
    },
    onError: (error) => {
      toast({
        title: 'Update Failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  function handleTest(id: string) {
    setTestingId(id);
    setTestResults((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    testMutation.mutate({ id });
  }

  function handleDelete(id: string) {
    const connection = connectionsList?.find((c) => c.id === id);
    setDeleteTarget(connection ? { id, name: connection.name } : { id, name: 'this connection' });
  }

  function confirmDelete() {
    if (deleteTarget) {
      deleteMutation.mutate({ id: deleteTarget.id });
    }
  }

  function handleSetDefault(id: string) {
    setDefaultMutation.mutate({ id });
  }

  // Group connections by category
  const aiConnections = connectionsList?.filter((c) => !isDbType(c.type)) ?? [];
  const dbConnections = connectionsList?.filter((c) => isDbType(c.type)) ?? [];

  return (
    <div className="container py-10">
      <div className="flex flex-col gap-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Connections</h1>
            <p className="text-muted-foreground">
              Manage AI provider and database connections for your BaleyBots.
            </p>
          </div>
          <AddConnectionDialog />
        </div>

        {/* Content */}
        {isLoading ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <Skeleton key={i} className="h-52" />
            ))}
          </div>
        ) : connectionsList && connectionsList.length > 0 ? (
          <div className="space-y-8">
            {/* AI Providers section */}
            {aiConnections.length > 0 && (
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <Bot className="h-4 w-4 text-muted-foreground" />
                  <h2 className="text-lg font-semibold">AI Providers</h2>
                  <Badge variant="secondary" className="ml-1">{aiConnections.length}</Badge>
                </div>
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {aiConnections.map((connection) => (
                    <ConnectionCardItem
                      key={connection.id}
                      connection={connection as typeof connection & { config: Record<string, unknown>; availableModels: unknown }}
                      testResult={testResults[connection.id]}
                      onTest={handleTest}
                      isTesting={testingId === connection.id}
                      onDelete={handleDelete}
                      onSetDefault={handleSetDefault}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Database Connections section */}
            {dbConnections.length > 0 && (
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <Database className="h-4 w-4 text-muted-foreground" />
                  <h2 className="text-lg font-semibold">Databases</h2>
                  <Badge variant="secondary" className="ml-1">{dbConnections.length}</Badge>
                </div>
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {dbConnections.map((connection) => (
                    <ConnectionCardItem
                      key={connection.id}
                      connection={connection as typeof connection & { config: Record<string, unknown>; availableModels: unknown }}
                      testResult={testResults[connection.id]}
                      onTest={handleTest}
                      isTesting={testingId === connection.id}
                      onDelete={handleDelete}
                      onSetDefault={handleSetDefault}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Mixed (single section when all same type) */}
            {aiConnections.length === 0 && dbConnections.length === 0 && (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {connectionsList.map((connection) => (
                  <ConnectionCardItem
                    key={connection.id}
                    connection={connection as typeof connection & { config: Record<string, unknown>; availableModels: unknown }}
                    testResult={testResults[connection.id]}
                    onTest={handleTest}
                    isTesting={testingId === connection.id}
                    onDelete={handleDelete}
                    onSetDefault={handleSetDefault}
                  />
                ))}
              </div>
            )}
          </div>
        ) : (
          <EmptyState
            icon={Plug}
            title="No connections"
            description="Add a connection to an AI provider or database to power your BaleyBots."
          />
        )}
      </div>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Connection</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &ldquo;{deleteTarget?.name}&rdquo;? BaleyBots using this
              connection will lose access to it.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
