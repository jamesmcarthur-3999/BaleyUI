/**
 * Client-safe type definitions for the visual editor.
 *
 * These types are imported by client components (VisualEditor, ClusterDiagram, etc.)
 * and must NOT pull in any server-only dependencies.
 */

import type { TriggerConfig } from '../types';
import type { ParsedExpression } from '@/lib/baleybot/graph/build-graph';

export interface VisualNode {
  id: string;
  type: 'baleybot' | 'bb_cluster' | 'bb_agent' | 'trigger' | 'datasource' | 'storage_bucket' | 'output';
  data: {
    name: string;
    goal: string;
    model?: string;
    trigger?: TriggerConfig;
    tools: string[];
    canRequest: string[];
    output?: Record<string, string>;
    temperature?: number;
    reasoning?: boolean | { effort?: 'low' | 'medium' | 'high' };
    stopWhen?: string;
    retries?: number;
    runtimeStatus?: 'idle' | 'running' | 'completed' | 'needs_attention';
    runtimeTarget?: 'cloud' | 'local';
    exportStatus?: 'none' | 'building' | 'ready';
    transport?: 'sse' | 'websocket';
    provider?: 'openai' | 'anthropic' | 'ollama';
    usageCost?: number;
    tokenCount?: number;
    kind?: string;
    parentId?: string;
    collapsed?: boolean;
    meta?: Record<string, unknown>;
  };
  position: { x: number; y: number };
}

export interface VisualEdge {
  id: string;
  source: string;
  target: string;
  type: 'chain' | 'conditional_pass' | 'conditional_fail' | 'parallel' | 'loop' | 'spawn' | 'shared_data' | 'trigger' | 'runtime';
  label?: string;
  animated?: boolean;
}

export interface VisualGraph {
  nodes: VisualNode[];
  edges: VisualEdge[];
}

/** Pre-parsed BAL entities, used by client-safe applyNodeChangeFromParsed */
export interface ParsedEntities {
  entities: Array<{ name: string; config: Record<string, unknown> }>;
  chain?: string[];
  expression?: ParsedExpression;
  errors: string[];
}
