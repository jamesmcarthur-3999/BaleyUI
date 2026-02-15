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

import type { VisualNode, VisualEdge, VisualGraph } from '@/lib/baleybot/visual/types';
import { BaleybotNode } from './BaleybotNode';
import { ContextNode } from './ContextNode';
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
  trigger: ContextNode,
  datasource: ContextNode,
  storage_bucket: ContextNode,
  output: ContextNode,
  bb_cluster: ContextNode,
} as const;

/**
 * Convert VisualNode to React Flow Node
 */
function toReactFlowNode(node: VisualNode): Node {
  const supportedType: Node['type'] =
    node.type === 'bb_agent'
      ? 'baleybot'
      : node.type === 'baleybot' ||
          node.type === 'trigger' ||
          node.type === 'datasource' ||
          node.type === 'storage_bucket' ||
          node.type === 'output' ||
          node.type === 'bb_cluster'
        ? node.type
        : 'baleybot';

  return {
    id: node.id,
    type: supportedType,
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
    animated: false,
    label: edge.label,
    markerEnd: {
      type: MarkerType.ArrowClosed,
      width: 14,
      height: 14,
    },
  };

  // Style based on edge type
  switch (edge.type) {
    case 'chain':
      return {
        ...baseEdge,
        style: { stroke: 'hsl(var(--muted-foreground))', strokeOpacity: 0.35 },
      };
    case 'conditional_pass':
      return {
        ...baseEdge,
        style: { stroke: 'hsl(142.1, 76.2%, 36.3%)', strokeWidth: 1.5 },
        labelStyle: { fill: 'hsl(142.1, 76.2%, 36.3%)' },
      };
    case 'conditional_fail':
      return {
        ...baseEdge,
        style: { stroke: 'hsl(0, 84.2%, 60.2%)', strokeWidth: 1.5 },
        labelStyle: { fill: 'hsl(0, 84.2%, 60.2%)' },
      };
    case 'parallel':
      return {
        ...baseEdge,
        style: { stroke: 'hsl(var(--muted-foreground))', strokeOpacity: 0.4, strokeDasharray: '5,5' },
      };
    case 'loop':
      return {
        ...baseEdge,
        style: { stroke: 'hsl(45, 93%, 47%)', strokeWidth: 1.5, strokeDasharray: '6,4' },
      };
    case 'spawn':
      return {
        ...baseEdge,
        style: { stroke: 'hsl(280, 80%, 55%)', strokeDasharray: '8,4' },
      };
    case 'shared_data':
      return {
        ...baseEdge,
        style: { stroke: 'hsl(var(--muted-foreground))', strokeOpacity: 0.25, strokeDasharray: '3,3' },
      };
    case 'trigger':
      return {
        ...baseEdge,
        style: { stroke: 'hsl(142.1, 76.2%, 36.3%)', strokeWidth: 1.5 },
        animated: true,
      };
    case 'runtime':
      return {
        ...baseEdge,
        style: { stroke: 'hsl(205, 100%, 55%)', strokeWidth: 2 },
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
            <span className="text-destructive font-medium">We could not read this flow yet</span>
            <span className="text-xs max-w-md text-center">{parseErrors[0]}</span>
          </>
        ) : (
          'Add your first step to start building this flow'
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
        {/* Simplified edge legend — only show for present edge types */}
        {edgeTypes.size > 0 && (
          <div className="absolute top-3 left-3 z-10 bg-card/90 backdrop-blur-sm border border-border rounded-lg px-3 py-2 space-y-1.5">
            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Flow Map</p>
            {edgeTypes.has('chain') && (
              <LegendItem color="hsl(var(--muted-foreground))" dashed={false} label="Flow" />
            )}
            {edgeTypes.has('parallel') && (
              <LegendItem color="hsl(var(--muted-foreground))" dashed label="Parallel" />
            )}
            {(edgeTypes.has('conditional_pass') || edgeTypes.has('conditional_fail')) && (
              <LegendItem color="hsl(142.1, 76.2%, 36.3%)" dashed={false} label="Yes / No" />
            )}
            {edgeTypes.has('loop') && (
              <LegendItem color="hsl(45, 93%, 47%)" dashed label="Loop" />
            )}
            {edgeTypes.has('shared_data') && (
              <LegendItem color="hsl(var(--muted-foreground))" dashed label="Data link" />
            )}
            {edgeTypes.has('runtime') && (
              <LegendItem color="hsl(205, 100%, 55%)" dashed={false} label="Live" />
            )}
          </div>
        )}
      </ReactFlow>
    </div>
  );
}
