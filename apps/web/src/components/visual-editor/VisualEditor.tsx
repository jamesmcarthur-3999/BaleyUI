'use client';

import { useState } from 'react';
import { Code, LayoutGrid, X } from 'lucide-react';
import { ClusterDiagram } from './ClusterDiagram';
import { NodeEditor } from './NodeEditor';
import { balToVisual } from '@/lib/baleybot/visual/bal-to-nodes';
import { applyNodeChange } from '@/lib/baleybot/visual/visual-to-bal';
import { cn } from '@/lib/utils';

interface VisualEditorProps {
  balCode: string;
  onChange: (balCode: string) => void;
  readOnly?: boolean;
  className?: string;
}

type ViewMode = 'visual' | 'code' | 'split';

export function VisualEditor({
  balCode,
  onChange,
  readOnly = false,
  className,
}: VisualEditorProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('visual');
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  // Get visual graph for the selected node
  const visualGraph = balToVisual(balCode);
  const selectedNode = selectedNodeId
    ? visualGraph.nodes.find((n) => n.id === selectedNodeId)
    : null;

  const handleNodeClick = (nodeId: string) => {
    setSelectedNodeId(nodeId);
  };

  const handleNodeUpdate = (changes: Record<string, unknown>) => {
    if (!selectedNodeId || readOnly) return;

    const updatedCode = applyNodeChange(balCode, {
      nodeId: selectedNodeId,
      changes: changes as Parameters<typeof applyNodeChange>[1]['changes'],
    });

    onChange(updatedCode);
  };

  const handleCodeChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    if (readOnly) return;
    onChange(e.target.value);
  };

  return (
    <div className={cn('flex flex-col h-full', className)}>
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-card/50">
        <div className="flex items-center gap-1 p-1 bg-muted rounded-lg">
          <button
            onClick={() => setViewMode('visual')}
            className={cn(
              'flex items-center gap-2 px-3 py-1.5 rounded-md text-sm transition-colors',
              viewMode === 'visual'
                ? 'bg-background shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <LayoutGrid className="h-4 w-4" />
            Visual
          </button>
          <button
            onClick={() => setViewMode('code')}
            className={cn(
              'flex items-center gap-2 px-3 py-1.5 rounded-md text-sm transition-colors',
              viewMode === 'code'
                ? 'bg-background shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <Code className="h-4 w-4" />
            Code
          </button>
          <button
            onClick={() => setViewMode('split')}
            className={cn(
              'flex items-center gap-2 px-3 py-1.5 rounded-md text-sm transition-colors',
              viewMode === 'split'
                ? 'bg-background shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            Split
          </button>
        </div>

        {selectedNode && viewMode !== 'code' && (
          <span className="text-sm text-muted-foreground">
            Editing: {formatNodeName(selectedNode.data.name)}
          </span>
        )}
      </div>

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Visual view */}
        {(viewMode === 'visual' || viewMode === 'split') && (
          <div
            className={cn(
              'flex-1 relative',
              viewMode === 'split' && 'border-r border-border'
            )}
          >
            <ClusterDiagram
              balCode={balCode}
              onNodeClick={handleNodeClick}
              readOnly={readOnly}
              className="h-full"
            />

            {/* Node editor panel */}
            {selectedNode && !readOnly && (
              <div className="absolute top-4 right-4 z-10">
                <NodeEditor
                  node={selectedNode}
                  onUpdate={handleNodeUpdate}
                  onClose={() => setSelectedNodeId(null)}
                />
              </div>
            )}
          </div>
        )}

        {/* Code view */}
        {(viewMode === 'code' || viewMode === 'split') && (
          <div className={cn('flex-1', viewMode === 'split' && 'max-w-[50%]')}>
            <textarea
              value={balCode}
              onChange={handleCodeChange}
              readOnly={readOnly}
              spellCheck={false}
              className={cn(
                'w-full h-full p-4 font-mono text-sm',
                'bg-muted/30 border-none resize-none',
                'focus:outline-none focus:ring-2 focus:ring-primary/20',
                readOnly && 'cursor-not-allowed opacity-75'
              )}
              placeholder={`# Enter BAL code here
entity_name {
  "goal": "What this entity should accomplish",
  "model": "openai:gpt-4o-mini",
  "tools": ["web_search"]
}`}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function formatNodeName(name: string): string {
  return name
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}
