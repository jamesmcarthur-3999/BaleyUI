/**
 * Canonical graph/editor types for BAL visual editing.
 *
 * This model is intentionally client-safe and can be used by:
 * - web worker parsing
 * - visual editor canvas
 * - BAL writeback reducer
 */

import type { TriggerConfig } from '../types';

export type GraphNodeKind =
  | 'bb_cluster'
  | 'bb_agent'
  | 'trigger'
  | 'datasource'
  | 'storage_bucket'
  | 'output';

export type GraphEdgeKind =
  | 'control'
  | 'parallel'
  | 'conditional'
  | 'loop'
  | 'spawn'
  | 'trigger'
  | 'data'
  | 'runtime';

export interface BalGraphNodeData {
  label: string;
  entityName?: string;
  goal?: string;
  model?: string;
  trigger?: TriggerConfig;
  tools?: string[];
  canRequest?: string[];
  output?: Record<string, string>;
  collapsed?: boolean;
  runtimeStatus?: 'idle' | 'running' | 'success' | 'failed';
  meta?: Record<string, unknown>;
}

export interface BalGraphNode {
  id: string;
  kind: GraphNodeKind;
  parentId?: string;
  data: BalGraphNodeData;
  position: { x: number; y: number };
}

export interface BalGraphEdge {
  id: string;
  source: string;
  target: string;
  kind: GraphEdgeKind;
  label?: string;
  animated?: boolean;
  meta?: Record<string, unknown>;
}

export interface BalGraphSidecarSharedStorageLink {
  producer: string;
  consumer: string;
  keyPattern?: string;
  required?: boolean;
}

export interface BalGraphSidecarDatasourceBinding {
  entity: string;
  connectionId: string;
  tool: string;
  mode?: 'read' | 'write' | 'read_write';
  connectionLabel?: string;
  connectionType?: string;
}

export interface BalGraphSidecarSpawnBinding {
  source: string;
  target: string;
}

export interface BalGraphSidecarMetadata {
  sharedStorageLinks?: BalGraphSidecarSharedStorageLink[];
  datasourceBindings?: BalGraphSidecarDatasourceBinding[];
  spawnBindings?: BalGraphSidecarSpawnBinding[];
}

export interface BalGraphMetadata {
  sidecar?: BalGraphSidecarMetadata;
}

export interface BalGraphModel {
  nodes: BalGraphNode[];
  edges: BalGraphEdge[];
  metadata?: BalGraphMetadata;
}

export type GraphEditCommand =
  | {
      type: 'add_node';
      nodeKind?: Extract<GraphNodeKind, 'bb_agent'>;
      nodeId: string;
      afterNodeId?: string;
      props?: Partial<BalGraphNodeData>;
    }
  | {
      type: 'delete_node';
      nodeId: string;
    }
  | {
      type: 'rename_node';
      nodeId: string;
      nextId: string;
      nextLabel?: string;
    }
  | {
      type: 'set_node_props';
      nodeId: string;
      props: Partial<BalGraphNodeData>;
    }
  | {
      type: 'connect_edge';
      source: string;
      target: string;
      edgeKind?: Exclude<GraphEdgeKind, 'runtime'>;
      label?: string;
    }
  | {
      type: 'disconnect_edge';
      edgeId: string;
    }
  | {
      type: 'reorder_branch';
      nodeId: string;
      beforeNodeId?: string;
      afterNodeId?: string;
    };
