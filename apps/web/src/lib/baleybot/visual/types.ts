/**
 * Client-safe type definitions for the visual editor.
 *
 * These types are imported by client components (VisualEditor, ClusterDiagram, etc.)
 * and must NOT pull in any server-only dependencies.
 */

import type { TriggerConfig } from '../types';

export interface VisualNode {
  id: string;
  type: 'baleybot' | 'trigger' | 'output';
  data: {
    name: string;
    goal: string;
    model?: string;
    trigger?: TriggerConfig;
    tools: string[];
    canRequest: string[];
    output?: Record<string, string>;
  };
  position: { x: number; y: number };
}

export interface VisualEdge {
  id: string;
  source: string;
  target: string;
  type: 'chain' | 'conditional_pass' | 'conditional_fail' | 'parallel';
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
  errors: string[];
}
