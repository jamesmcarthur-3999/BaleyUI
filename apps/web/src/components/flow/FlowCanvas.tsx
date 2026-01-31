'use client';

import { useCallback, useRef, useState } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  BackgroundVariant,
  type Connection,
  MarkerType,
  Panel,
} from '@xyflow/react';
import { useFlowStore } from '@/stores/flow';
import { nodeTypes } from './nodes';
import { cn } from '@/lib/utils';
import '@xyflow/react/dist/style.css';

interface FlowCanvasProps {
  flowId: string;
  className?: string;
  onSave?: () => void;
}

export function FlowCanvas({ flowId, className, onSave }: FlowCanvasProps) {
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const {
    nodes,
    edges,
    onNodesChange,
    onEdgesChange,
    addNode,
    addEdge: addEdgeToStore,
    selectNode,
  } = useFlowStore();

  const onConnect = useCallback(
    (connection: Connection) => {
      const edge = {
        ...connection,
        id: `e${connection.source}-${connection.target}`,
        type: 'smoothstep',
        animated: true,
        markerEnd: {
          type: MarkerType.ArrowClosed,
        },
      };
      addEdgeToStore(edge as any);
      onSave?.();
    },
    [addEdgeToStore, onSave]
  );

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
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

      const newNode = {
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
    },
    [addNode, onSave]
  );

  const onNodeClick = useCallback(
    (_event: React.MouseEvent, node: any) => {
      selectNode(node.id);
    },
    [selectNode]
  );

  const onPaneClick = useCallback(() => {
    selectNode(null);
  }, [selectNode]);

  // Handle node changes (position, selection, etc.)
  const handleNodesChange = useCallback(
    (changes: Parameters<typeof onNodesChange>[0]) => {
      onNodesChange(changes);
      // Only mark as changed for position changes, not selection
      const hasPositionChange = changes.some(
        (change) => change.type === 'position' && change.dragging === false
      );
      if (hasPositionChange) {
        setHasUnsavedChanges(true);
        onSave?.();
      }
    },
    [onNodesChange, onSave]
  );

  // Handle edge changes
  const handleEdgesChange = useCallback(
    (changes: Parameters<typeof onEdgesChange>[0]) => {
      onEdgesChange(changes);
      // Mark as changed for edge removals
      const hasRemoval = changes.some((change) => change.type === 'remove');
      if (hasRemoval) {
        setHasUnsavedChanges(true);
        onSave?.();
      }
    },
    [onEdgesChange, onSave]
  );

  return (
    <div ref={reactFlowWrapper} className={cn('h-full w-full', className)}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
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
          animated: true,
          markerEnd: {
            type: MarkerType.ArrowClosed,
          },
        }}
      >
        <Background variant={BackgroundVariant.Dots} gap={12} size={1} />
        <Controls />
        <MiniMap
          nodeColor={(node) => {
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
        <Panel position="top-left" className="!m-0">
          <div className="bg-card border rounded-md px-3 py-2 text-sm text-muted-foreground">
            Drag blocks from the palette to add them to the flow
          </div>
        </Panel>
      </ReactFlow>
    </div>
  );
}
