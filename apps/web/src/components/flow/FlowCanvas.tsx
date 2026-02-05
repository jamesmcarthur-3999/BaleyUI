'use client';

import { useEffect, useRef, useState } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  BackgroundVariant,
  type Connection,
  type Node,
  MarkerType,
  Panel,
} from '@xyflow/react';
import { useFlowStore } from '@/stores/flow';
import { useBuilderEvents } from '@/hooks/useBuilderEvents';
import { nodeTypes } from './nodes';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Play,
  Pause,
  Eye,
  EyeOff,
  Layers,
} from 'lucide-react';
import '@xyflow/react/dist/style.css';

// ============================================================================
// TYPES
// ============================================================================

interface FlowCanvasProps {
  flowId: string;
  workspaceId?: string;
  className?: string;
  onSave?: () => void;
  isExecuting?: boolean;
  onExecute?: () => void;
  onStop?: () => void;
}

interface ExecutingNodeState {
  nodeId: string;
  status: 'pending' | 'running' | 'complete' | 'error';
  startTime?: number;
}

// ============================================================================
// COMPONENT
// ============================================================================

export function FlowCanvas({
  flowId: _flowId,
  workspaceId,
  className,
  onSave,
  isExecuting = false,
  onExecute,
  onStop,
}: FlowCanvasProps) {
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const [showMiniMap, setShowMiniMap] = useState(true);
  const [executingNodes, setExecutingNodes] = useState<
    Map<string, ExecutingNodeState>
  >(new Map());

  const {
    nodes,
    edges,
    onNodesChange,
    onEdgesChange,
    addNode,
    addEdge: addEdgeToStore,
    selectNode,
  } = useFlowStore();

  // Subscribe to builder events for real-time updates
  const { isConnected } = useBuilderEvents({
    workspaceId: workspaceId || '',
    enabled: !!workspaceId && isExecuting,
    onEvent: (event) => {
      // Handle execution events to animate the flow
      if (event.type === 'FlowNodeUpdated') {
        const data = event.data as { nodeId?: string; status?: string };
        if (data.nodeId && data.status) {
          setExecutingNodes((prev) => {
            const next = new Map(prev);
            next.set(data.nodeId as string, {
              nodeId: data.nodeId as string,
              status: data.status as ExecutingNodeState['status'],
              startTime: Date.now(),
            });
            return next;
          });
        }
      }
    },
  });

  // Clear executing nodes when execution stops
  useEffect(() => {
    if (!isExecuting) {
      setExecutingNodes(new Map());
    }
  }, [isExecuting]);

  // Apply execution state to nodes for visual feedback
  const nodesWithState = nodes.map((node) => {
    const execState = executingNodes.get(node.id);
    return {
      ...node,
      data: {
        ...node.data,
        isExecuting: execState?.status === 'running',
        executionStatus: execState?.status,
      },
      className: cn(
        node.className,
        execState?.status === 'running' && 'ring-2 ring-primary animate-pulse',
        execState?.status === 'complete' && 'ring-2 ring-green-500',
        execState?.status === 'error' && 'ring-2 ring-destructive'
      ),
    };
  });

  const onConnect = (connection: Connection) => {
    const edge = {
      ...connection,
      id: `e${connection.source}-${connection.target}`,
      type: 'smoothstep',
      animated: isExecuting,
      markerEnd: {
        type: MarkerType.ArrowClosed,
      },
    };
    addEdgeToStore(edge as Parameters<typeof addEdgeToStore>[0]);
    onSave?.();
  };

  const onDragOver = (event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  };

  const onDrop = (event: React.DragEvent) => {
    event.preventDefault();

    const data = event.dataTransfer.getData('application/reactflow');
    if (!data) return;

    const blockData = JSON.parse(data);
    const reactFlowBounds = reactFlowWrapper.current?.getBoundingClientRect();

    if (!reactFlowBounds) return;

    // Calculate position relative to the canvas
    const position = {
      x: event.clientX - reactFlowBounds.left - 100,
      y: event.clientY - reactFlowBounds.top - 50,
    };

    // Map block type to node type
    const nodeTypeMap: Record<string, string> = {
      ai: 'aiBlock',
      function: 'functionBlock',
      router: 'router',
      parallel: 'parallel',
      loop: 'loop',
      source: 'source',
      sink: 'sink',
    };

    const newNode: Node = {
      id: `node-${Date.now()}`,
      type: nodeTypeMap[blockData.type] || 'aiBlock',
      position,
      data: {
        name: blockData.name,
        blockId: blockData.blockId,
        model: blockData.model,
        routes: blockData.routes,
        branches: blockData.branches,
        maxIterations: blockData.maxIterations,
        triggerType: blockData.triggerType,
        outputType: blockData.outputType,
      },
    };

    addNode(newNode);
    onSave?.();
  };

  const onNodeClick = (_event: React.MouseEvent, node: Node) => {
    selectNode(node.id);
  };

  const onPaneClick = () => {
    selectNode(null);
  };

  // Handle node changes (position, selection, etc.)
  const handleNodesChange = (
    changes: Parameters<typeof onNodesChange>[0]
  ) => {
    onNodesChange(changes);
    // Only mark as changed for position changes, not selection
    const hasPositionChange = changes.some(
      (change) => change.type === 'position' && change.dragging === false
    );
    if (hasPositionChange) {
      onSave?.();
    }
  };

  // Handle edge changes
  const handleEdgesChange = (
    changes: Parameters<typeof onEdgesChange>[0]
  ) => {
    onEdgesChange(changes);
    // Mark as changed for edge removals
    const hasRemoval = changes.some((change) => change.type === 'remove');
    if (hasRemoval) {
      onSave?.();
    }
  };

  // Animate edges during execution
  const edgesWithAnimation = edges.map((edge) => ({
    ...edge,
    animated: isExecuting,
  }));

  return (
    <div ref={reactFlowWrapper} className={cn('h-full w-full', className)}>
      <ReactFlow
        nodes={nodesWithState}
        edges={edgesWithAnimation}
        onNodesChange={handleNodesChange}
        onEdgesChange={handleEdgesChange}
        onConnect={onConnect}
        onDrop={onDrop}
        onDragOver={onDragOver}
        onNodeClick={onNodeClick}
        onPaneClick={onPaneClick}
        nodeTypes={nodeTypes}
        fitView
        minZoom={0.1}
        maxZoom={2}
        defaultEdgeOptions={{
          type: 'smoothstep',
          animated: false,
          markerEnd: {
            type: MarkerType.ArrowClosed,
          },
        }}
      >
        <Background variant={BackgroundVariant.Dots} gap={12} size={1} />
        <Controls showInteractive={false} />

        {showMiniMap && (
          <MiniMap
            nodeColor={(node) => {
              const execState = executingNodes.get(node.id);
              if (execState?.status === 'running') return 'hsl(var(--primary))';
              if (execState?.status === 'complete')
                return 'hsl(var(--color-success))';
              if (execState?.status === 'error')
                return 'hsl(var(--destructive))';

              const colorMap: Record<string, string> = {
                aiBlock: 'hsl(var(--color-block-ai))',
                functionBlock: 'hsl(var(--color-block-function))',
                router: 'hsl(var(--color-block-router))',
                parallel: 'hsl(var(--color-block-parallel))',
                loop: 'hsl(var(--primary))',
                source: 'hsl(var(--color-success))',
                sink: 'hsl(var(--destructive))',
              };
              return colorMap[node.type || 'aiBlock'] || '#999';
            }}
            className="!bg-background !border-border"
          />
        )}

        {/* Top Panel - Status & Controls */}
        <Panel position="top-left" className="!m-2">
          <div className="flex items-center gap-2">
            <div className="bg-card border rounded-md px-3 py-2 text-sm flex items-center gap-2">
              <Layers className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">
                {nodes.length} nodes · {edges.length} edges
              </span>
            </div>

            {isExecuting && (
              <Badge
                variant="default"
                className="animate-pulse bg-primary/90"
              >
                <div className="h-2 w-2 rounded-full bg-white mr-2 animate-ping" />
                Executing
              </Badge>
            )}

            {workspaceId && (
              <Badge variant={isConnected ? 'secondary' : 'outline'}>
                {isConnected ? 'Live' : 'Offline'}
              </Badge>
            )}
          </div>
        </Panel>

        {/* Top Right Panel - View Controls */}
        <Panel position="top-right" className="!m-2">
          <div className="flex items-center gap-1 bg-card border rounded-md p-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => setShowMiniMap(!showMiniMap)}
              title={showMiniMap ? 'Hide minimap' : 'Show minimap'}
            >
              {showMiniMap ? (
                <EyeOff className="h-4 w-4" />
              ) : (
                <Eye className="h-4 w-4" />
              )}
            </Button>
          </div>
        </Panel>

        {/* Bottom Panel - Execution Controls */}
        <Panel position="bottom-center" className="!m-2">
          <div className="flex items-center gap-2 bg-card border rounded-md p-2">
            {onExecute && !isExecuting && (
              <Button
                size="sm"
                onClick={onExecute}
                className="gap-2"
              >
                <Play className="h-4 w-4" />
                Run Flow
              </Button>
            )}

            {onStop && isExecuting && (
              <Button
                size="sm"
                variant="destructive"
                onClick={onStop}
                className="gap-2"
              >
                <Pause className="h-4 w-4" />
                Stop
              </Button>
            )}

            {!isExecuting && nodes.length === 0 && (
              <p className="text-sm text-muted-foreground px-2">
                Drag blocks from the palette to build your flow
              </p>
            )}
          </div>
        </Panel>
      </ReactFlow>
    </div>
  );
}
