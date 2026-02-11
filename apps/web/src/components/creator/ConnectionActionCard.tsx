'use client';

import { CheckCircle2, XCircle, Database, Plug, Trash2, List, Star } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface ConnectionAction {
  action: string;
  result: Record<string, unknown>;
  timestamp: number;
}

interface ConnectionActionCardProps {
  action: ConnectionAction;
  className?: string;
}

/**
 * Renders connection operation results as rich inline cards in the chat.
 * Each action type gets a distinct visual treatment.
 */
export function ConnectionActionCard({ action, className }: ConnectionActionCardProps) {
  const { action: toolName, result } = action;

  switch (toolName) {
    case 'create_connection':
      return <CreateConnectionCard result={result} className={className} />;
    case 'test_connection':
      return <TestConnectionCard result={result} className={className} />;
    case 'list_connections':
      return <ListConnectionsCard result={result} className={className} />;
    case 'set_default_connection':
      return <SetDefaultCard result={result} className={className} />;
    case 'delete_connection':
      return <DeleteConnectionCard result={result} className={className} />;
    default:
      return null;
  }
}

function CreateConnectionCard({ result, className }: { result: Record<string, unknown>; className?: string }) {
  const success = result.success === true;
  const name = String(result.connectionName ?? 'Connection');
  const isDefault = result.isDefault === true;
  const testResult = String(result.testResult ?? '');

  return (
    <div className={cn(
      'rounded-lg border p-3 text-sm animate-fade-in',
      success ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-red-500/30 bg-red-500/5',
      className,
    )}>
      <div className="flex items-center gap-2 mb-1.5">
        <Plug className={cn('h-3.5 w-3.5', success ? 'text-emerald-500' : 'text-red-400')} />
        <span className="font-medium text-foreground/90">Connection Created</span>
        {isDefault && (
          <span className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-600">
            <Star className="h-2.5 w-2.5" />
            Default
          </span>
        )}
      </div>
      <p className="text-muted-foreground">
        <span className="font-medium text-foreground/80">{name}</span>
        {testResult && <> &mdash; {testResult}</>}
      </p>
    </div>
  );
}

function TestConnectionCard({ result, className }: { result: Record<string, unknown>; className?: string }) {
  const success = result.success === true;
  const name = String(result.connectionName ?? 'Connection');
  const message = String(result.message ?? (success ? 'Test passed' : 'Test failed'));

  return (
    <div className={cn(
      'rounded-lg border p-3 text-sm animate-fade-in',
      success ? 'border-blue-500/30 bg-blue-500/5' : 'border-red-500/30 bg-red-500/5',
      className,
    )}>
      <div className="flex items-center gap-2 mb-1.5">
        {success
          ? <CheckCircle2 className="h-3.5 w-3.5 text-blue-500" />
          : <XCircle className="h-3.5 w-3.5 text-red-400" />
        }
        <span className="font-medium text-foreground/90">
          {name} &mdash; {success ? 'Passed' : 'Failed'}
        </span>
      </div>
      <p className="text-muted-foreground">{message}</p>
    </div>
  );
}

function ListConnectionsCard({ result, className }: { result: Record<string, unknown>; className?: string }) {
  const conns = Array.isArray(result.connections) ? result.connections as Array<Record<string, unknown>> : [];
  const total = typeof result.total === 'number' ? result.total : conns.length;

  return (
    <div className={cn(
      'rounded-lg border border-border/60 bg-card/50 p-3 text-sm animate-fade-in',
      className,
    )}>
      <div className="flex items-center gap-2 mb-1.5">
        <List className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="font-medium text-foreground/90">
          {total} Connection{total === 1 ? '' : 's'}
        </span>
      </div>
      {conns.length > 0 && (
        <div className="space-y-1 mt-1">
          {conns.slice(0, 6).map((c, i) => {
            const status = String(c.status ?? 'unknown');
            const isConnected = status === 'connected';
            return (
              <div key={i} className="flex items-center gap-2 text-muted-foreground">
                <span className={cn(
                  'w-1.5 h-1.5 rounded-full shrink-0',
                  isConnected ? 'bg-emerald-500' : status === 'error' ? 'bg-red-400' : 'bg-muted-foreground/40',
                )} />
                <Database className="h-3 w-3 shrink-0" />
                <span className="truncate">{String(c.name ?? 'Unnamed')}</span>
                <span className="text-[10px] text-muted-foreground/60 ml-auto shrink-0">{String(c.type ?? '')}</span>
              </div>
            );
          })}
          {conns.length > 6 && (
            <p className="text-[11px] text-muted-foreground/50 pl-5">
              +{conns.length - 6} more
            </p>
          )}
        </div>
      )}
      {total === 0 && (
        <p className="text-muted-foreground">No connections configured yet.</p>
      )}
    </div>
  );
}

function SetDefaultCard({ result, className }: { result: Record<string, unknown>; className?: string }) {
  const success = result.success === true;
  const message = String(result.message ?? (success ? 'Default updated' : String(result.error ?? 'Failed')));

  return (
    <div className={cn(
      'rounded-lg border p-3 text-sm animate-fade-in',
      success ? 'border-amber-500/30 bg-amber-500/5' : 'border-red-500/30 bg-red-500/5',
      className,
    )}>
      <div className="flex items-center gap-2 mb-1">
        <Star className={cn('h-3.5 w-3.5', success ? 'text-amber-500' : 'text-red-400')} />
        <span className="font-medium text-foreground/90">Default Updated</span>
      </div>
      <p className="text-muted-foreground">{message}</p>
    </div>
  );
}

function DeleteConnectionCard({ result, className }: { result: Record<string, unknown>; className?: string }) {
  const success = result.success === true;
  const message = String(result.message ?? (success ? 'Connection deleted' : String(result.error ?? 'Failed')));

  return (
    <div className={cn(
      'rounded-lg border p-3 text-sm animate-fade-in',
      success ? 'border-red-500/30 bg-red-500/5' : 'border-muted bg-muted/30',
      className,
    )}>
      <div className="flex items-center gap-2 mb-1">
        <Trash2 className={cn('h-3.5 w-3.5', success ? 'text-red-400' : 'text-muted-foreground')} />
        <span className="font-medium text-foreground/90">Connection Deleted</span>
      </div>
      <p className="text-muted-foreground">{message}</p>
    </div>
  );
}
