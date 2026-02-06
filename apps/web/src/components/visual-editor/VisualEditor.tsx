'use client';

import { useState, useEffect, useRef } from 'react';
import { Code, LayoutGrid, Loader2 } from 'lucide-react';
import { ClusterDiagram } from './ClusterDiagram';
import { NodeEditor } from './NodeEditor';
import { parseBalGraphAndEntities } from '@/app/dashboard/baleybots/[id]/actions';
import { useBalWorker } from '@/hooks/useBalWorker';
import { applyNodeChangeFromParsed } from '@/lib/baleybot/visual/visual-to-bal';
import type { VisualGraph, ParsedEntities } from '@/lib/baleybot/visual/types';
import { cn } from '@/lib/utils';

interface VisualEditorProps {
  balCode: string;
  onChange: (balCode: string) => void;
  readOnly?: boolean;
  className?: string;
  /** Hide the internal Visual/Code/Split toolbar (when page-level tabs handle view switching) */
  hideToolbar?: boolean;
}

type ViewMode = 'visual' | 'code' | 'split';

export function VisualEditor({
  balCode,
  onChange,
  readOnly = false,
  className,
  hideToolbar = false,
}: VisualEditorProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('visual');
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [visualGraph, setVisualGraph] = useState<VisualGraph>({ nodes: [], edges: [] });
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [isParsing, setIsParsing] = useState(false);
  const parsedEntitiesRef = useRef<ParsedEntities | null>(null);
  const latestBalCodeRef = useRef(balCode);
  const parseRequestIdRef = useRef(0);
  const balWorker = useBalWorker();

  useEffect(() => {
    if (viewMode === 'code') {
      setIsParsing(false);
      return;
    }

    let cancelled = false;
    latestBalCodeRef.current = balCode;
    const requestId = ++parseRequestIdRef.current;

    const timeoutId = setTimeout(async () => {
      setIsParsing(true);

      try {
        // Try worker first (off main thread), fall back to server actions
        const workerResult = await balWorker.parseBalCode(balCode);

        if (workerResult) {
          // Worker succeeded -- use its result
          if (!cancelled && latestBalCodeRef.current === balCode && requestId === parseRequestIdRef.current) {
            setVisualGraph(workerResult.graph);
            setParseErrors(workerResult.errors);
            parsedEntitiesRef.current = {
              entities: workerResult.entities,
              errors: workerResult.errors,
            };
            setIsParsing(false);
          }
          return;
        }

        // Worker unavailable -- fall back to server actions
        const result = await parseBalGraphAndEntities(balCode);

        if (!cancelled && latestBalCodeRef.current === balCode && requestId === parseRequestIdRef.current) {
          setVisualGraph(result.graphResult.graph);
          setParseErrors(result.graphResult.errors);
          parsedEntitiesRef.current = result.parsed;
          setIsParsing(false);
        }
      } catch (error) {
        if (!cancelled && latestBalCodeRef.current === balCode && requestId === parseRequestIdRef.current) {
          setVisualGraph({ nodes: [], edges: [] });
          setParseErrors([error instanceof Error ? error.message : String(error)]);
          parsedEntitiesRef.current = null;
          setIsParsing(false);
        }
      }
    }, 300);

    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [balCode, viewMode]);

  const selectedNode = selectedNodeId
    ? visualGraph.nodes.find((n) => n.id === selectedNodeId)
    : null;

  const handleNodeClick = (nodeId: string) => {
    setSelectedNodeId(nodeId);
  };

  const handleNodeUpdate = (changes: Record<string, unknown>) => {
    if (!selectedNodeId || readOnly || !parsedEntitiesRef.current) return;

    const updatedCode = applyNodeChangeFromParsed(parsedEntitiesRef.current, {
      nodeId: selectedNodeId,
      changes: changes as Parameters<typeof applyNodeChangeFromParsed>[1]['changes'],
    });

    onChange(updatedCode);
  };

  const handleCodeChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    if (readOnly) return;
    onChange(e.target.value);
  };

  return (
    <div className={cn('flex flex-col h-full', className)}>
      {/* Toolbar — hidden when page-level tabs handle view switching */}
      {!hideToolbar && (
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

          <div className="flex items-center gap-2">
            {isParsing && (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            )}
            {selectedNode && viewMode !== 'code' && (
              <span className="text-sm text-muted-foreground">
                Editing: {formatNodeName(selectedNode.data.name)}
              </span>
            )}
          </div>
        </div>
      )}

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
              graph={visualGraph}
              parseErrors={parseErrors}
              isParsing={isParsing}
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
