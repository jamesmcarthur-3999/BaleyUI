'use client';

import { useState } from 'react';
import {
  Wrench,
  Plus,
  Search,
  MoreVertical,
  Edit,
  Trash2,
  Database,
  Sparkles,
  Code,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// ============================================================================
// TYPES
// ============================================================================

export interface WorkspaceTool {
  id: string;
  name: string;
  description: string;
  source: 'custom' | 'connection' | 'promoted';
  connectionName?: string;
  inputSchema?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

interface WorkspaceToolsListProps {
  tools: WorkspaceTool[];
  onEdit: (tool: WorkspaceTool) => void;
  onDelete: (toolId: string) => void;
  onCreate: () => void;
  className?: string;
}

// ============================================================================
// COMPONENTS
// ============================================================================

function ToolSourceBadge({ source, connectionName }: { source: WorkspaceTool['source']; connectionName?: string }) {
  switch (source) {
    case 'connection':
      return (
        <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-blue-500/10 text-blue-600">
          <Database className="h-3 w-3" />
          {connectionName ?? 'Connection'}
        </span>
      );
    case 'promoted':
      return (
        <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-purple-500/10 text-purple-600">
          <Sparkles className="h-3 w-3" />
          Promoted
        </span>
      );
    case 'custom':
    default:
      return (
        <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-emerald-500/10 text-emerald-600">
          <Code className="h-3 w-3" />
          Custom
        </span>
      );
  }
}

function ToolRow({
  tool,
  onEdit,
  onDelete,
}: {
  tool: WorkspaceTool;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [showMenu, setShowMenu] = useState(false);

  return (
    <div className="flex items-center gap-4 p-4 rounded-xl border border-border hover:bg-muted/30 transition-colors">
      {/* Icon */}
      <div className="p-2 rounded-lg bg-muted">
        <Wrench className="h-5 w-5 text-muted-foreground" />
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <h4 className="font-medium text-sm">{tool.name}</h4>
          <ToolSourceBadge source={tool.source} connectionName={tool.connectionName} />
        </div>
        <p className="text-sm text-muted-foreground line-clamp-1">{tool.description}</p>
      </div>

      {/* Actions */}
      <div className="relative">
        <button
          onClick={() => setShowMenu(!showMenu)}
          className="p-2 rounded-lg hover:bg-muted transition-colors"
        >
          <MoreVertical className="h-4 w-4 text-muted-foreground" />
        </button>

        {showMenu && (
          <>
            <div
              className="fixed inset-0 z-10"
              onClick={() => setShowMenu(false)}
            />
            <div className="absolute right-0 top-full mt-1 z-20 w-40 py-1 rounded-lg bg-popover border border-border shadow-lg">
              <button
                onClick={() => {
                  setShowMenu(false);
                  onEdit();
                }}
                className="flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-muted transition-colors"
              >
                <Edit className="h-4 w-4" />
                Edit
              </button>
              <button
                onClick={() => {
                  setShowMenu(false);
                  onDelete();
                }}
                className="flex items-center gap-2 w-full px-3 py-2 text-sm text-destructive hover:bg-destructive/10 transition-colors"
              >
                <Trash2 className="h-4 w-4" />
                Delete
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export function WorkspaceToolsList({
  tools,
  onEdit,
  onDelete,
  onCreate,
  className,
}: WorkspaceToolsListProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterSource, setFilterSource] = useState<'all' | 'custom' | 'connection' | 'promoted'>('all');

  // Filter tools
  const filteredTools = tools.filter((tool) => {
    const matchesSearch =
      searchQuery === '' ||
      tool.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      tool.description.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesFilter = filterSource === 'all' || tool.source === filterSource;

    return matchesSearch && matchesFilter;
  });

  // Group by source for display
  const groupedTools = {
    custom: filteredTools.filter((t) => t.source === 'custom'),
    connection: filteredTools.filter((t) => t.source === 'connection'),
    promoted: filteredTools.filter((t) => t.source === 'promoted'),
  };

  return (
    <div className={cn('space-y-6', className)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Workspace Tools</h2>
          <p className="text-sm text-muted-foreground">
            Manage tools available to BaleyBots in this workspace
          </p>
        </div>
        <button
          onClick={onCreate}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity"
        >
          <Plus className="h-4 w-4" />
          Create Tool
        </button>
      </div>

      {/* Search and filter */}
      <div className="flex items-center gap-3">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search tools..."
            className={cn(
              'w-full pl-10 pr-4 py-2 rounded-lg',
              'border border-border bg-background',
              'focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/50',
              'text-sm'
            )}
          />
        </div>

        <select
          value={filterSource}
          onChange={(e) => setFilterSource(e.target.value as typeof filterSource)}
          className={cn(
            'px-4 py-2 rounded-lg',
            'border border-border bg-background',
            'focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/50',
            'text-sm'
          )}
        >
          <option value="all">All Sources</option>
          <option value="custom">Custom</option>
          <option value="connection">Connection-derived</option>
          <option value="promoted">Promoted</option>
        </select>
      </div>

      {/* Tools list */}
      {filteredTools.length === 0 ? (
        <div className="p-8 rounded-xl border border-dashed border-border text-center">
          <Wrench className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
          <h3 className="font-medium mb-1">No tools found</h3>
          <p className="text-sm text-muted-foreground mb-4">
            {searchQuery
              ? 'Try adjusting your search or filter'
              : 'Create your first custom tool or connect a database'}
          </p>
          <button
            onClick={onCreate}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity"
          >
            <Plus className="h-4 w-4" />
            Create Tool
          </button>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Custom tools */}
          {groupedTools.custom.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
                <Code className="h-4 w-4" />
                Custom Tools ({groupedTools.custom.length})
              </h3>
              <div className="space-y-2">
                {groupedTools.custom.map((tool) => (
                  <ToolRow
                    key={tool.id}
                    tool={tool}
                    onEdit={() => onEdit(tool)}
                    onDelete={() => onDelete(tool.id)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Connection-derived tools */}
          {groupedTools.connection.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
                <Database className="h-4 w-4" />
                Connection-Derived Tools ({groupedTools.connection.length})
              </h3>
              <div className="space-y-2">
                {groupedTools.connection.map((tool) => (
                  <ToolRow
                    key={tool.id}
                    tool={tool}
                    onEdit={() => onEdit(tool)}
                    onDelete={() => onDelete(tool.id)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Promoted tools */}
          {groupedTools.promoted.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
                <Sparkles className="h-4 w-4" />
                Promoted Tools ({groupedTools.promoted.length})
              </h3>
              <div className="space-y-2">
                {groupedTools.promoted.map((tool) => (
                  <ToolRow
                    key={tool.id}
                    tool={tool}
                    onEdit={() => onEdit(tool)}
                    onDelete={() => onDelete(tool.id)}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
