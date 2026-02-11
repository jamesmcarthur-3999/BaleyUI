'use client';

import { useState } from 'react';
import { trpc } from '@/lib/trpc/client';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { Badge } from '@/components/ui/badge';
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
import { Plug, Database, Bot, Search } from 'lucide-react';
import { AddConnectionDialog } from '@/components/connections';
import { ConnectionEditPanel } from '@/components/capabilities/ConnectionEditPanel';
import { ConnectionCard } from '@/components/capabilities/ConnectionCard';
import { ToolServiceCard } from '@/components/capabilities/ToolServiceCard';
import { MCPLibraryDialog } from '@/components/capabilities/MCPLibraryDialog';
import { MCPCustomDialog } from '@/components/capabilities/MCPCustomDialog';
import type { TestResult } from '@/components/capabilities/ConnectionCard';

// ============================================================================
// HELPERS
// ============================================================================

function isDbType(type: string): boolean {
  return type === 'postgres' || type === 'mysql';
}

// ============================================================================
// MAIN PAGE
// ============================================================================

export default function CapabilityConnectionsPage() {
  const { toast } = useToast();
  const utils = trpc.useUtils();
  const { data: connectionsList, isLoading } = trpc.connections.list.useQuery(undefined, {
    staleTime: 10 * 60 * 1000,
  });
  const { data: toolServices } = trpc.connections.toolServices.useQuery(undefined, {
    staleTime: 10 * 60 * 1000,
  });

  const [testResults, setTestResults] = useState<Record<string, TestResult>>({});
  const [testingId, setTestingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [editingConnectionId, setEditingConnectionId] = useState<string | null>(null);

  // Health summary counts
  const healthyCount = connectionsList?.filter((c) => c.status === 'connected').length ?? 0;
  const errorCount = connectionsList?.filter((c) => c.status === 'error').length ?? 0;
  const unconfiguredCount = connectionsList?.filter((c) => !c.status || c.status === 'unconfigured').length ?? 0;

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
  const aiConnections = connectionsList?.filter((c) => !isDbType(c.type) && c.type !== 'mcp') ?? [];
  const dbConnections = connectionsList?.filter((c) => isDbType(c.type)) ?? [];
  const mcpConnections = connectionsList?.filter((c) => c.type === 'mcp') ?? [];

  return (
    <div className="flex flex-col gap-8">
      {/* Action bar */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Connect AI providers, databases, and MCP servers to power your BaleyBots
        </p>
        <div className="flex items-center gap-2">
          <MCPLibraryDialog onInstalled={() => utils.connections.list.invalidate()} />
          <MCPCustomDialog onCreated={() => utils.connections.list.invalidate()} />
          <AddConnectionDialog />
        </div>
      </div>

      {/* Health Summary */}
      {connectionsList && connectionsList.length > 0 && (
        <div className="flex items-center gap-4 text-sm">
          {healthyCount > 0 && (
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2 w-2 rounded-full bg-green-500" />
              {healthyCount} healthy
            </span>
          )}
          {unconfiguredCount > 0 && (
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2 w-2 rounded-full bg-gray-400" />
              {unconfiguredCount} unconfigured
            </span>
          )}
          {errorCount > 0 && (
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2 w-2 rounded-full bg-red-500" />
              {errorCount} errors
            </span>
          )}
        </div>
      )}

      {/* Tool Services — always visible */}
      {toolServices && toolServices.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Search className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-lg font-semibold">Tool Services</h2>
            <Badge variant="secondary" className="ml-1">{toolServices.length}</Badge>
          </div>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {toolServices.map((service) => (
              <ToolServiceCard
                key={service.id}
                service={service}
                onSaved={() => utils.connections.toolServices.invalidate()}
              />
            ))}
          </div>
        </div>
      )}

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
                  <ConnectionCard
                    key={connection.id}
                    connection={connection as typeof connection & { config: Record<string, unknown>; availableModels: unknown }}
                    testResult={testResults[connection.id]}
                    onTest={handleTest}
                    isTesting={testingId === connection.id}
                    onDelete={handleDelete}
                    onSetDefault={handleSetDefault}
                    onEdit={setEditingConnectionId}
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
                  <ConnectionCard
                    key={connection.id}
                    connection={connection as typeof connection & { config: Record<string, unknown>; availableModels: unknown }}
                    testResult={testResults[connection.id]}
                    onTest={handleTest}
                    isTesting={testingId === connection.id}
                    onDelete={handleDelete}
                    onSetDefault={handleSetDefault}
                    onEdit={setEditingConnectionId}
                  />
                ))}
              </div>
            </div>
          )}

          {/* MCP Connections section */}
          {mcpConnections.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Plug className="h-4 w-4 text-muted-foreground" />
                <h2 className="text-lg font-semibold">MCP Servers</h2>
                <Badge variant="secondary" className="ml-1">{mcpConnections.length}</Badge>
              </div>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {mcpConnections.map((connection) => (
                  <ConnectionCard
                    key={connection.id}
                    connection={connection as typeof connection & { config: Record<string, unknown>; availableModels: unknown }}
                    testResult={testResults[connection.id]}
                    onTest={handleTest}
                    isTesting={testingId === connection.id}
                    onDelete={handleDelete}
                    onSetDefault={handleSetDefault}
                    onEdit={setEditingConnectionId}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Mixed (single section when all same type) */}
          {aiConnections.length === 0 && dbConnections.length === 0 && mcpConnections.length === 0 && (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {connectionsList.map((connection) => (
                <ConnectionCard
                  key={connection.id}
                  connection={connection as typeof connection & { config: Record<string, unknown>; availableModels: unknown }}
                  testResult={testResults[connection.id]}
                  onTest={handleTest}
                  isTesting={testingId === connection.id}
                  onDelete={handleDelete}
                  onSetDefault={handleSetDefault}
                  onEdit={setEditingConnectionId}
                />
              ))}
            </div>
          )}
        </div>
      ) : (
        <EmptyState
          icon={Plug}
          title="No connections"
          description="Add a connection to an AI provider, database, or MCP server to power your BaleyBots."
        />
      )}

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

      {/* Edit Panel */}
      <ConnectionEditPanel
        connectionId={editingConnectionId}
        open={!!editingConnectionId}
        onOpenChange={(open) => !open && setEditingConnectionId(null)}
      />
    </div>
  );
}
