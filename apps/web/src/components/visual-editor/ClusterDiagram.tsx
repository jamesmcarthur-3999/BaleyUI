'use client';

import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  MarkerType,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import type { VisualNode, VisualEdge, VisualGraph } from '@/lib/baleybot/visual/types';
import { BaleybotNode } from './BaleybotNode';
import { cn } from '@/lib/utils';

interface ClusterDiagramProps {
  graph: VisualGraph;
  isParsing?: boolean;
  onNodeClick?: (nodeId: string) => void;
  onNodeChange?: (nodeId: string, data: Partial<VisualNode['data']>) => void;
  className?: string;
  readOnly?: boolean;
}

// Custom node types - using Record type for compatibility
const nodeTypes = {
  baleybot: BaleybotNode,
} as const;

/**
 * Convert VisualNode to React Flow Node
 */
function toReactFlowNode(node: VisualNode): Node {
  return {
    id: node.id,
    type: node.type,
    position: node.position,
    data: node.data,
  };
}

/**
 * Convert VisualEdge to React Flow Edge
 */
function toReactFlowEdge(edge: VisualEdge): Edge {
  const baseEdge: Edge = {
    id: edge.id,
    source: edge.source,
    target: edge.target,
    type: 'smoothstep',
    animated: edge.animated,
    label: edge.label,
    markerEnd: {
      type: MarkerType.ArrowClosed,
      width: 20,
      height: 20,
    },
  };

  // Style based on edge type
  switch (edge.type) {
    case 'chain':
      return {
        ...baseEdge,
        style: { stroke: 'hsl(var(--primary))' },
      };
    case 'conditional_pass':
      return {
        ...baseEdge,
        style: { stroke: 'hsl(142.1, 76.2%, 36.3%)' }, // emerald
        labelStyle: { fill: 'hsl(142.1, 76.2%, 36.3%)' },
      };
    case 'conditional_fail':
      return {
        ...baseEdge,
        style: { stroke: 'hsl(0, 84.2%, 60.2%)' }, // red
        labelStyle: { fill: 'hsl(0, 84.2%, 60.2%)' },
      };
    case 'parallel':
      return {
        ...baseEdge,
        style: { stroke: 'hsl(217.2, 91.2%, 59.8%)', strokeDasharray: '5,5' }, // blue dashed
      };
    default:
      return baseEdge;
  }
}

export function ClusterDiagram({
  graph,
  isParsing: _isParsing,
  onNodeClick,
  onNodeChange: _onNodeChange,
  className,
  readOnly = false,
}: ClusterDiagramProps) {
  // Convert to React Flow format
  const initialNodes = graph.nodes.map(toReactFlowNode);
  const initialEdges = graph.edges.map(toReactFlowEdge);

  const [nodes, , onNodesChange] = useNodesState(initialNodes);
  const [edges, , onEdgesChange] = useEdgesState(initialEdges);

  const handleNodeClick = (_event: React.MouseEvent, node: Node) => {
    onNodeClick?.(node.id);
  };

  // Empty state
  if (graph.nodes.length === 0) {
    return (
      <div
        className={cn(
          'flex items-center justify-center rounded-2xl border border-dashed border-border bg-muted/30',
          'text-muted-foreground text-sm',
          className
        )}
        style={{ minHeight: 300 }}
      >
        No entities found in BAL code
      </div>
    );
  }

  return (
    <div className={cn('rounded-2xl border border-border overflow-hidden', className)}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={readOnly ? undefined : onNodesChange}
        onEdgesChange={readOnly ? undefined : onEdgesChange}
        onNodeClick={handleNodeClick}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{
          padding: 0.2,
          maxZoom: 1.5,
        }}
        proOptions={{ hideAttribution: true }}
        nodesDraggable={!readOnly}
        nodesConnectable={false}
        elementsSelectable={!readOnly}
      >
        <Background gap={20} size={1} />
        <Controls
          showInteractive={false}
          position="bottom-left"
          className="!bg-card !border-border"
        />
        <MiniMap
          position="bottom-right"
          className="!bg-card !border-border"
          nodeColor={() => 'hsl(var(--primary))'}
          maskColor="hsl(var(--background) / 0.8)"
        />
      </ReactFlow>
    </div>
  );
}
