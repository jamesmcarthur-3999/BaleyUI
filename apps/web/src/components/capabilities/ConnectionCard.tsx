'use client';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { Wifi, WifiOff, Trash2, RefreshCw, Star, Database, Bot, Pencil, Plug, Wrench } from 'lucide-react';
import { UnifiedStatusBadge } from '@/components/ui/unified-status-badge';
import { PROVIDERS } from '@/lib/connections/providers';
import type { ProviderType } from '@/lib/connections/providers';

// ============================================================================
// HELPERS
// ============================================================================

function typeBadgeVariant(type: string): 'openai' | 'anthropic' | 'ollama' | 'secondary' {
  switch (type) {
    case 'openai': return 'openai';
    case 'anthropic': return 'anthropic';
    case 'ollama': return 'ollama';
    default: return 'secondary';
  }
}

function isDbType(type: string): boolean {
  return type === 'postgres' || type === 'mysql';
}

function isMcpType(type: string): boolean {
  return type === 'mcp';
}

function getCategoryIcon(type: string) {
  if (isDbType(type)) return Database;
  if (isMcpType(type)) return Plug;
  return Bot;
}

// ============================================================================
// TYPES
// ============================================================================

interface TestResult {
  success: boolean;
  message?: string;
  tableCount?: number;
}

interface ConnectionCardProps {
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
  onEdit: (id: string) => void;
}

// ============================================================================
// COMPONENT
// ============================================================================

export function ConnectionCard({
  connection,
  testResult,
  onTest,
  isTesting,
  onDelete,
  onSetDefault,
  onEdit,
}: ConnectionCardProps) {
  const provider = PROVIDERS[connection.type as ProviderType];
  const config = (connection.config ?? {}) as Record<string, string | number | boolean | null | undefined>;
  const CategoryIcon = getCategoryIcon(connection.type);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <UnifiedStatusBadge status={(connection.status ?? 'unconfigured') as any} domain="connection" variant="dot" />
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
        <div className="space-y-1 text-sm mb-3">
          <p className="text-xs text-muted-foreground">{provider?.description}</p>

          {/* MCP provider details */}
          {isMcpType(connection.type) && (
            <>
              {!!config.url && (
                <div className="flex items-center gap-1.5">
                  <span className="text-muted-foreground text-xs">URL:</span>
                  <span className="font-mono text-xs truncate">{String(config.url)}</span>
                </div>
              )}
              {!!config.command && (
                <div className="flex items-center gap-1.5">
                  <span className="text-muted-foreground text-xs">Command:</span>
                  <span className="font-mono text-xs truncate">{String(config.command)}</span>
                </div>
              )}
              {!!config.transportType && (
                <div className="flex items-center gap-1.5">
                  <span className="text-muted-foreground text-xs">Transport:</span>
                  <Badge variant="outline" className="text-xs px-1 py-0">
                    {String(config.transportType).toUpperCase()}
                  </Badge>
                </div>
              )}
              {typeof config.discoveredToolCount === 'number' && (
                <div className="flex items-center gap-1.5">
                  <Wrench className="h-3 w-3 text-muted-foreground" />
                  <span className="text-xs">{config.discoveredToolCount} tools</span>
                  {!!config.toolPrefix && (
                    <span className="text-muted-foreground text-xs">(prefix: {String(config.toolPrefix)})</span>
                  )}
                </div>
              )}
              {!!config._hasAuthToken && (
                <div className="flex items-center gap-1.5">
                  <span className="text-muted-foreground text-xs">Auth:</span>
                  <span className="font-mono text-xs">{String(config.authToken)}</span>
                </div>
              )}
            </>
          )}

          {/* AI provider details */}
          {!isDbType(connection.type) && !isMcpType(connection.type) && (
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
              <span className="text-xs">{new Date(connection.lastCheckedAt).toLocaleString()}</span>
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
            {testResult.success ? <Wifi className="h-3.5 w-3.5 shrink-0" /> : <WifiOff className="h-3.5 w-3.5 shrink-0" />}
            <span className="truncate">{testResult.message}</span>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => onTest(connection.id)} disabled={isTesting}>
            <RefreshCw className={cn('h-3.5 w-3.5 mr-1.5', isTesting && 'animate-spin')} />
            Test
          </Button>
          <Button variant="outline" size="sm" onClick={() => onEdit(connection.id)}>
            <Pencil className="h-3.5 w-3.5 mr-1.5" />
            Edit
          </Button>
          {!connection.isDefault && (
            <Button variant="outline" size="sm" onClick={() => onSetDefault(connection.id)}>
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

export type { TestResult, ConnectionCardProps };
