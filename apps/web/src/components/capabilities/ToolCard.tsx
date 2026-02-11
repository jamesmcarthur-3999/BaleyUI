'use client';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Wrench,
  Cog,
  Calendar,
  Database,
  Shield,
  ShieldCheck,
  Plug,
} from 'lucide-react';

// ============================================================================
// HELPERS
// ============================================================================

function formatDate(date: Date | string): string {
  return new Date(date).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function getCategoryColor(category: string): string {
  switch (category) {
    case 'information': return 'bg-blue-500/10 text-blue-700 dark:text-blue-400';
    case 'orchestration': return 'bg-purple-500/10 text-purple-700 dark:text-purple-400';
    case 'communication': return 'bg-green-500/10 text-green-700 dark:text-green-400';
    case 'storage': return 'bg-amber-500/10 text-amber-700 dark:text-amber-400';
    case 'scheduling': return 'bg-orange-500/10 text-orange-700 dark:text-orange-400';
    case 'advanced': return 'bg-red-500/10 text-red-700 dark:text-red-400';
    case 'database': return 'bg-teal-500/10 text-teal-700 dark:text-teal-400';
    case 'mcp': return 'bg-indigo-500/10 text-indigo-700 dark:text-indigo-400';
    case 'payments': return 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400';
    case 'design': return 'bg-pink-500/10 text-pink-700 dark:text-pink-400';
    default: return 'bg-gray-500/10 text-gray-700 dark:text-gray-400';
  }
}

// ============================================================================
// BUILT-IN TOOL CARD
// ============================================================================

export interface BuiltInToolInfo {
  name: string;
  description: string;
  category: string;
  approvalRequired: boolean;
  dangerLevel: 'safe' | 'moderate' | 'dangerous';
}

export function BuiltInToolCard({ tool, usedByCount }: { tool: BuiltInToolInfo; usedByCount?: number }) {
  return (
    <Card className="relative">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Wrench className="h-4 w-4 text-muted-foreground shrink-0" />
            <CardTitle className="truncate text-sm font-mono">
              {tool.name}
            </CardTitle>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {tool.approvalRequired ? (
              <Badge variant="outline" className="text-xs gap-1">
                <Shield className="h-3 w-3" />
                Approval
              </Badge>
            ) : (
              <Badge variant="secondary" className="text-xs gap-1">
                <ShieldCheck className="h-3 w-3" />
                Auto
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="pb-3">
        <p className="text-xs text-muted-foreground line-clamp-2 mb-2">
          {tool.description}
        </p>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className={`text-xs ${getCategoryColor(tool.category)}`}>
            {tool.category}
          </Badge>
          {usedByCount !== undefined && usedByCount > 0 && (
            <span className="text-xs text-muted-foreground">
              Used by {usedByCount} BB{usedByCount !== 1 ? 's' : ''}
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================================================
// CONNECTION TOOL CARD
// ============================================================================

export function ConnectionToolCard({ connection }: { connection: { id: string; type: string; name: string; status: string | null } }) {
  const toolName = `query_${connection.type}_${connection.name.toLowerCase().replace(/[^a-z0-9]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '')}`;

  return (
    <Card className="relative">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Database className="h-4 w-4 text-teal-600 shrink-0" />
            <CardTitle className="truncate text-sm font-mono">
              {toolName}
            </CardTitle>
          </div>
          <Badge variant="secondary" className="text-xs shrink-0">
            {connection.type === 'postgres' ? 'PostgreSQL' : 'MySQL'}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="pb-3">
        <p className="text-xs text-muted-foreground line-clamp-2 mb-2">
          Query the &quot;{connection.name}&quot; database using natural language. The AI translates your request to SQL.
        </p>
        <Badge variant="outline" className={`text-xs ${getCategoryColor('database')}`}>
          database
        </Badge>
      </CardContent>
    </Card>
  );
}

// ============================================================================
// CUSTOM TOOL CARD
// ============================================================================

export function CustomToolCard({
  tool,
  onClick,
  usedByCount,
}: {
  tool: {
    id: string;
    name: string;
    description: string;
    isGenerated: boolean | null;
    createdAt: Date;
  };
  onClick: () => void;
  usedByCount?: number;
}) {
  return (
    <Card
      variant="interactive"
      className="cursor-pointer transition-colors hover:border-primary/50"
      onClick={onClick}
    >
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Cog className="h-4 w-4 text-muted-foreground shrink-0" />
            <CardTitle className="truncate text-sm font-mono">
              {tool.name}
            </CardTitle>
          </div>
          {tool.isGenerated && (
            <Badge variant="secondary" className="shrink-0 text-xs">
              Generated
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="pb-3">
        <p className="text-xs text-muted-foreground line-clamp-2 mb-2">
          {tool.description}
        </p>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Calendar className="h-3 w-3" />
            {formatDate(tool.createdAt)}
          </span>
          {usedByCount !== undefined && usedByCount > 0 && (
            <span>Used by {usedByCount} BB{usedByCount !== 1 ? 's' : ''}</span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================================================
// MCP TOOL CARD
// ============================================================================

export interface MCPToolInfo {
  name: string;
  connectionName: string;
  connectionId: string;
  toolPrefix?: string;
}

export function MCPToolCard({ tool }: { tool: MCPToolInfo }) {
  const displayName = tool.toolPrefix
    ? `${tool.toolPrefix}${tool.name}`
    : tool.name;

  return (
    <Card className="relative">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Plug className="h-4 w-4 text-indigo-600 shrink-0" />
            <CardTitle className="truncate text-sm font-mono">
              {displayName}
            </CardTitle>
          </div>
          <Badge variant="secondary" className="text-xs shrink-0">
            MCP
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="pb-3">
        <p className="text-xs text-muted-foreground mb-2">
          From &quot;{tool.connectionName}&quot; MCP server
        </p>
        <Badge variant="outline" className={`text-xs ${getCategoryColor('mcp')}`}>
          mcp
        </Badge>
      </CardContent>
    </Card>
  );
}
