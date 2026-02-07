'use client';

import { useEffect } from 'react';
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
  parseErrors?: string[];
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
    case 'spawn':
      return {
        ...baseEdge,
        style: { stroke: 'hsl(280, 80%, 55%)', strokeWidth: 2, strokeDasharray: '8,4' }, // purple dashed
        animated: true,
      };
    case 'shared_data':
      return {
        ...baseEdge,
        style: { stroke: 'hsl(45, 90%, 50%)', strokeWidth: 1.5, strokeDasharray: '3,3' }, // gold dotted
      };
    case 'trigger':
      return {
        ...baseEdge,
        style: { stroke: 'hsl(142.1, 76.2%, 36.3%)', strokeWidth: 2 }, // green solid
        animated: true,
      };
    default:
      return baseEdge;
  }
}

function LegendItem({ color, dashed, label }: { color: string; dashed: boolean; label: string }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <svg width="24" height="2" className="shrink-0">
        <line
          x1="0" y1="1" x2="24" y2="1"
          stroke={color}
          strokeWidth="2"
          strokeDasharray={dashed ? '4,3' : undefined}
        />
      </svg>
      <span className="text-muted-foreground">{label}</span>
    </div>
  );
}

export function ClusterDiagram({
  graph,
  parseErrors = [],
  isParsing: _isParsing,
  onNodeClick,
  onNodeChange: _onNodeChange,
  className,
  readOnly = false,
}: ClusterDiagramProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  // Compute visible edge types for legend
  const edgeTypes = new Set(
    graph.edges.map(e => e.type).filter(Boolean)
  );

  // Sync React Flow state when graph prop changes
  useEffect(() => {
    setNodes(graph.nodes.map(toReactFlowNode));
    setEdges(graph.edges.map(toReactFlowEdge));
  }, [graph, setNodes, setEdges]);

  const handleNodeClick = (_event: React.MouseEvent, node: Node) => {
    onNodeClick?.(node.id);
  };

  // Empty state — show parse errors if available
  if (graph.nodes.length === 0) {
    return (
      <div
        className={cn(
          'flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border bg-muted/30',
          'text-muted-foreground text-sm',
          className
        )}
        style={{ minHeight: 400 }}
      >
        {parseErrors.length > 0 ? (
          <>
            <span className="text-destructive font-medium">Could not parse BAL code</span>
            <span className="text-xs max-w-md text-center">{parseErrors[0]}</span>
          </>
        ) : (
          'No entities found in BAL code'
        )}
      </div>
    );
  }

  return (
    <div className={cn('rounded-2xl border border-border overflow-hidden', className)} style={{ minHeight: 400 }}>
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
        {/* Edge legend */}
        {edgeTypes.size > 0 && (
          <div className="absolute top-3 left-3 z-10 bg-card/90 backdrop-blur-sm border border-border rounded-lg px-3 py-2 space-y-1.5">
            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Relationships</p>
            {edgeTypes.has('chain') && (
              <LegendItem color="hsl(var(--primary))" dashed={false} label="Sequential chain" />
            )}
            {edgeTypes.has('spawn') && (
              <LegendItem color="hsl(280, 80%, 55%)" dashed label="Spawns agent" />
            )}
            {edgeTypes.has('shared_data') && (
              <LegendItem color="hsl(45, 90%, 50%)" dashed label="Shared data" />
            )}
            {edgeTypes.has('trigger') && (
              <LegendItem color="hsl(142.1, 76.2%, 36.3%)" dashed={false} label="Triggers on complete" />
            )}
            {edgeTypes.has('parallel') && (
              <LegendItem color="hsl(217.2, 91.2%, 59.8%)" dashed label="Parallel execution" />
            )}
            {edgeTypes.has('conditional_pass') && (
              <LegendItem color="hsl(142.1, 76.2%, 36.3%)" dashed={false} label="Condition: pass" />
            )}
            {edgeTypes.has('conditional_fail') && (
              <LegendItem color="hsl(0, 84.2%, 60.2%)" dashed={false} label="Condition: fail" />
            )}
          </div>
        )}
      </ReactFlow>
    </div>
  );
}
