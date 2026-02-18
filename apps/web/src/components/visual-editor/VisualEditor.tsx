'use client';

import { useState, useEffect, useRef } from 'react';
import { Code, LayoutGrid, Loader2, Plus, Trash2 } from 'lucide-react';
import { ClusterDiagram } from './ClusterDiagram';
import { NodeEditor } from './NodeEditor';
import { parseBalGraphAndEntities } from '@/app/dashboard/baleybots/[id]/actions';
import { useBalWorker } from '@/hooks/useBalWorker';
import {
  applyNodeChangeFromParsed,
  applyNodeIntentFromParsed,
  type NodeIntentResult,
} from '@/lib/baleybot/visual/visual-to-bal';
import { buildGraphFromParsed, graphToVisualGraph } from '@/lib/baleybot/graph/build-graph';
import { applyGraphEditAndGenerateBAL } from '@/lib/baleybot/graph/ast-sync';
import type {
  BalGraphModel,
  BalGraphSidecarMetadata,
  BalGraphNode,
  BalGraphEdge,
} from '@/lib/baleybot/graph/types';
import type { VisualGraph, ParsedEntities } from '@/lib/baleybot/visual/types';
import type { TriggerConfig } from '@/lib/baleybot/types';
import type { GraphRuntimeEvent } from '@/lib/streaming/types/events';
import type { BuilderPresentationMode } from '@/lib/baleybot/creator-types';
import { cn } from '@/lib/utils';

interface VisualEditorProps {
  balCode: string;
  onChange: (balCode: string) => void;
  readOnly?: boolean;
  className?: string;
  /** Hide the internal Visual/Code/Split toolbar (when page-level tabs handle view switching) */
  hideToolbar?: boolean;
  /** Optional list of valid tool names to suggest in node editor */
  toolSuggestions?: string[];
  /** Optional top-level trigger configuration saved outside BAL */
  triggerConfig?: TriggerConfig;
  /** Optional sidecar graph metadata (data sources/storage bindings) */
  graphSidecar?: BalGraphSidecarMetadata;
  /** Optional runtime execution events for live node highlighting */
  runtimeEvents?: GraphRuntimeEvent[];
  /** Builder presentation mode (simple = novice-first, advanced = power controls) */
  presentationMode?: BuilderPresentationMode;
}

type ViewMode = 'visual' | 'code' | 'split';

function cloneGraphModel(model: BalGraphModel): BalGraphModel {
  return {
    ...model,
    nodes: model.nodes.map((node) => ({
      ...node,
      position: { ...node.position },
      data: {
        ...node.data,
        meta: node.data.meta ? { ...node.data.meta } : undefined,
      },
    })),
    edges: model.edges.map((edge) => ({
      ...edge,
      meta: edge.meta ? { ...edge.meta } : undefined,
    })),
    metadata: model.metadata
      ? {
          ...model.metadata,
          sidecar: model.metadata.sidecar
            ? {
                ...model.metadata.sidecar,
                sharedStorageLinks: [...(model.metadata.sidecar.sharedStorageLinks ?? [])],
                datasourceBindings: [...(model.metadata.sidecar.datasourceBindings ?? [])],
                spawnBindings: [...(model.metadata.sidecar.spawnBindings ?? [])],
              }
            : undefined,
        }
      : undefined,
  };
}

function getPrimaryAgentId(model: BalGraphModel): string | null {
  const agents = model.nodes.filter((node) => node.kind === 'bb_agent');
  if (agents.length === 0) return null;

  const agentIds = new Set(agents.map((node) => node.id));
  const controlEdges = model.edges.filter(
    (edge) =>
      edge.kind === 'control' &&
      agentIds.has(edge.source) &&
      agentIds.has(edge.target)
  );

  if (controlEdges.length === 0) {
    return agents[0]?.id ?? null;
  }

  const incoming = new Set(controlEdges.map((edge) => edge.target));
  const root = agents.find((node) => !incoming.has(node.id));
  return root?.id ?? agents[0]?.id ?? null;
}

function applyTriggerOverlay(
  model: BalGraphModel,
  triggerConfig: TriggerConfig | undefined
): BalGraphModel {
  if (!triggerConfig || triggerConfig.type === 'manual') {
    return model;
  }

  const next = cloneGraphModel(model);
  const primaryAgentId = getPrimaryAgentId(next);
  if (!primaryAgentId) return next;

  const triggerNodeId = `trigger:entry:${primaryAgentId}`;
  const triggerLabelByType: Record<TriggerConfig['type'], string> = {
    manual: 'Manual start',
    schedule: 'Scheduled start',
    webhook: 'Incoming webhook',
    other_bb: 'Another bot completes',
    db_event: 'Database change',
    mcp_event: 'External app event',
    file_upload: 'File upload',
  };

  const existingTriggerNode = next.nodes.find((node) => node.id === triggerNodeId);
  const primaryAgent = next.nodes.find((node) => node.id === primaryAgentId);
  const triggerNode: BalGraphNode = {
    id: triggerNodeId,
    kind: 'trigger',
    position: {
      x: (primaryAgent?.position.x ?? 80),
      y: (primaryAgent?.position.y ?? 220) - 170,
    },
    data: {
      label: triggerLabelByType[triggerConfig.type],
      trigger: triggerConfig,
      meta: {
        type: triggerConfig.type,
        topLevel: true,
      },
    },
  };

  if (existingTriggerNode) {
    Object.assign(existingTriggerNode, triggerNode);
  } else {
    next.nodes.push(triggerNode);
  }

  const triggerEdgeId = `trigger:${triggerNodeId}->${primaryAgentId}`;
  if (!next.edges.some((edge) => edge.id === triggerEdgeId)) {
    next.edges.push({
      id: triggerEdgeId,
      source: triggerNodeId,
      target: primaryAgentId,
      kind: 'trigger',
      animated: true,
      label: 'starts this flow',
    });
  }

  if (triggerConfig.type === 'file_upload') {
    const datasourceId = `datasource:file_upload:${primaryAgentId}`;
    const existingDatasource = next.nodes.find((node) => node.id === datasourceId);
    const datasourceNode: BalGraphNode = {
      id: datasourceId,
      kind: 'datasource',
      position: {
        x: (primaryAgent?.position.x ?? 80) - 220,
        y: (primaryAgent?.position.y ?? 220) - 20,
      },
      data: {
        label: 'Uploaded files',
        meta: {
          sourceType: 'file_upload',
        },
      },
    };

    if (existingDatasource) {
      Object.assign(existingDatasource, datasourceNode);
    } else {
      next.nodes.push(datasourceNode);
    }

    const fileEdgeId = `data:${datasourceId}->${primaryAgentId}`;
    if (!next.edges.some((edge) => edge.id === fileEdgeId)) {
      next.edges.push({
        id: fileEdgeId,
        source: datasourceId,
        target: primaryAgentId,
        kind: 'data',
        label: 'files',
      });
    }
  }

  return next;
}

function applyRuntimeOverlay(
  model: BalGraphModel,
  runtimeEvents: GraphRuntimeEvent[] | undefined
): BalGraphModel {
  if (!runtimeEvents || runtimeEvents.length === 0) {
    return model;
  }

  const next = cloneGraphModel(model);
  const nodeStatus = new Map<string, 'idle' | 'running' | 'completed' | 'needs_attention'>();
  const traversedEdges = new Set<string>();

  const sorted = [...runtimeEvents].sort((a, b) => a.timestamp - b.timestamp);

  for (const event of sorted) {
    const nodeId = event.nodeId ?? event.entityName ?? event.toNodeId ?? event.toEntityName;
    if (event.runtimeStatus && nodeId) {
      nodeStatus.set(nodeId, event.runtimeStatus);
      continue;
    }
    if (event.type === 'node_started' && nodeId) {
      nodeStatus.set(nodeId, 'running');
      continue;
    }
    if (event.type === 'node_succeeded' && nodeId) {
      nodeStatus.set(nodeId, 'completed');
      continue;
    }
    if (event.type === 'node_failed' && nodeId) {
      nodeStatus.set(nodeId, 'needs_attention');
      continue;
    }
    if (event.type === 'edge_traversed') {
      if (event.edgeId) {
        traversedEdges.add(event.edgeId);
      } else if (event.fromNodeId && event.toNodeId) {
        for (const edge of next.edges) {
          if (edge.source === event.fromNodeId && edge.target === event.toNodeId) {
            traversedEdges.add(edge.id);
          }
        }
      } else if (nodeId) {
        for (const edge of next.edges) {
          if (edge.target === nodeId) {
            traversedEdges.add(edge.id);
          }
        }
      }
    }
  }

  next.nodes = next.nodes.map((node) => {
    const status = nodeStatus.get(node.id) ?? nodeStatus.get(node.data.entityName ?? '');
    if (!status) return node;
    return {
      ...node,
      data: {
        ...node.data,
        runtimeStatus: status,
      },
    };
  });

  next.edges = next.edges.map((edge) => {
    if (!traversedEdges.has(edge.id)) return edge;
    return {
      ...edge,
      animated: true,
      kind: edge.kind === 'runtime' ? edge.kind : 'runtime',
      meta: {
        ...(edge.meta ?? {}),
        traversed: true,
      },
    } as BalGraphEdge;
  });

  return next;
}

function supportsCanvasCommands(parsed: ParsedEntities | null): boolean {
  if (!parsed?.expression) return true;
  return parsed.expression.type === 'entity' || parsed.expression.type === 'chain';
}

export function VisualEditor({
  balCode,
  onChange,
  readOnly = false,
  className,
  hideToolbar = false,
  toolSuggestions = [],
  triggerConfig,
  graphSidecar,
  runtimeEvents,
  presentationMode = 'advanced',
}: VisualEditorProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('visual');
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [baseGraphModel, setBaseGraphModel] = useState<BalGraphModel>({ nodes: [], edges: [] });
  const [visualGraph, setVisualGraph] = useState<VisualGraph>({ nodes: [], edges: [] });
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [isParsing, setIsParsing] = useState(false);
  const [canUseCanvasCommands, setCanUseCanvasCommands] = useState(true);
  const parsedEntitiesRef = useRef<ParsedEntities | null>(null);
  const latestBalCodeRef = useRef(balCode);
  const parseRequestIdRef = useRef(0);
  const balWorker = useBalWorker();

  const selectedNode = selectedNodeId
    ? visualGraph.nodes.find((n) => n.id === selectedNodeId)
    : null;

  const selectedIsAgent = selectedNode?.data.kind === 'bb_agent' || selectedNode?.type === 'baleybot';
  const isSimpleMode = presentationMode === 'simple';

  const addStepDisabled = readOnly || isParsing || !canUseCanvasCommands;
  const deleteStepDisabled = readOnly || isParsing || !canUseCanvasCommands || !selectedNodeId || !selectedIsAgent;

  const buildGraphModelFromParsed = (parsed: ParsedEntities): BalGraphModel => {
    return buildGraphFromParsed(
      {
        entities: parsed.entities,
        chain: parsed.chain,
        expression: parsed.expression,
      },
      {
        sidecar: graphSidecar,
      }
    );
  };

  useEffect(() => {
    let nextModel = baseGraphModel;
    nextModel = applyTriggerOverlay(nextModel, triggerConfig);
    nextModel = applyRuntimeOverlay(nextModel, runtimeEvents);
    setVisualGraph(graphToVisualGraph(nextModel));
  }, [baseGraphModel, triggerConfig, runtimeEvents]);

  useEffect(() => {
    if (selectedNodeId && !visualGraph.nodes.some((node) => node.id === selectedNodeId)) {
      setSelectedNodeId(null);
    }
  }, [selectedNodeId, visualGraph.nodes]);

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
        const workerResult = await balWorker.parseBalCode(balCode);

        if (workerResult) {
          if (!cancelled && latestBalCodeRef.current === balCode && requestId === parseRequestIdRef.current) {
            const parsed: ParsedEntities = {
              entities: workerResult.entities,
              chain: workerResult.chain,
              errors: workerResult.errors,
            };

            parsedEntitiesRef.current = parsed;
            setCanUseCanvasCommands(supportsCanvasCommands(parsed));
            setBaseGraphModel(buildGraphModelFromParsed(parsed));
            setParseErrors(workerResult.errors);
            setIsParsing(false);
          }
          return;
        }

        const result = await parseBalGraphAndEntities(balCode);

        if (!cancelled && latestBalCodeRef.current === balCode && requestId === parseRequestIdRef.current) {
          parsedEntitiesRef.current = result.parsed;
          setCanUseCanvasCommands(supportsCanvasCommands(result.parsed));
          setBaseGraphModel(buildGraphModelFromParsed(result.parsed));
          setParseErrors(result.graphResult.errors);
          setIsParsing(false);
        }
      } catch (error) {
        if (!cancelled && latestBalCodeRef.current === balCode && requestId === parseRequestIdRef.current) {
          setBaseGraphModel({ nodes: [], edges: [] });
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
  }, [balCode, viewMode, graphSidecar]);

  const handleNodeClick = (nodeId: string) => {
    setSelectedNodeId(nodeId);
  };

  const handleNodeUpdate = (changes: Record<string, unknown>) => {
    if (!selectedNodeId || readOnly || !parsedEntitiesRef.current) return;

    const updatedCode = applyNodeChangeFromParsed(parsedEntitiesRef.current, {
      nodeId: selectedNodeId,
      changes: changes as Parameters<typeof applyNodeChangeFromParsed>[1]['changes'],
    }, latestBalCodeRef.current);

    onChange(updatedCode);
  };

  const handleCodeChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    if (readOnly) return;
    onChange(e.target.value);
  };

  const handleNodeIntent = (instruction: string): NodeIntentResult => {
    if (readOnly) {
      return {
        applied: false,
        balCode,
        summary: 'No changes applied.',
        error: 'Editor is read-only.',
      };
    }
    if (!parsedEntitiesRef.current) {
      return {
        applied: false,
        balCode,
        summary: 'No changes applied.',
        error: 'Visual state is still parsing. Try again in a second.',
      };
    }

    const result = applyNodeIntentFromParsed(
      parsedEntitiesRef.current,
      {
        nodeId: selectedNodeId,
        instruction,
      },
      latestBalCodeRef.current
    );

    if (result.applied) {
      onChange(result.balCode);
      if (result.nextSelectedNodeId !== undefined) {
        setSelectedNodeId(result.nextSelectedNodeId ?? null);
      }
    }

    return result;
  };

  const handleAddStep = () => {
    if (addStepDisabled) return;

    const currentAgents = baseGraphModel.nodes.filter((node) => node.kind === 'bb_agent').length;
    const commandResult = applyGraphEditAndGenerateBAL(baseGraphModel, {
      type: 'add_node',
      nodeId: `step_${currentAgents + 1}`,
      afterNodeId: selectedIsAgent ? selectedNodeId ?? undefined : undefined,
      props: {
        goal: 'Handle the next part of this task.',
      },
    });

    const existingIds = new Set(baseGraphModel.nodes.map((node) => node.id));
    const newlyAdded = commandResult.model.nodes.find(
      (node) => node.kind === 'bb_agent' && !existingIds.has(node.id)
    );

    if (newlyAdded) {
      setSelectedNodeId(newlyAdded.id);
    }

    onChange(commandResult.balCode);
  };

  const handleDeleteSelectedStep = () => {
    if (deleteStepDisabled || !selectedNodeId) return;

    const commandResult = applyGraphEditAndGenerateBAL(baseGraphModel, {
      type: 'delete_node',
      nodeId: selectedNodeId,
    });

    setSelectedNodeId(null);
    onChange(commandResult.balCode);
  };

  const builderHint = !canUseCanvasCommands
    ? isSimpleMode
      ? 'This flow uses advanced logic. Switch to Advanced mode if you need to edit structure.'
      : 'This flow uses advanced logic. You can still edit each step, but add/remove should be done in code view.'
    : isSimpleMode
      ? 'Click a step to edit it. Add Step builds your flow one step at a time.'
      : 'Click a step to edit it. Use + Add Step to grow the flow.';

  return (
    <div className={cn('flex flex-col h-full', className)}>
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

      <div className="flex-1 flex overflow-hidden">
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

            {!readOnly && (
              <div className="absolute top-4 left-4 z-10 flex flex-wrap items-center gap-2 rounded-xl border border-border/60 bg-background/90 backdrop-blur px-2 py-1.5 shadow-sm">
                <button
                  type="button"
                  onClick={handleAddStep}
                  disabled={addStepDisabled}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
                    addStepDisabled
                      ? 'text-muted-foreground bg-muted cursor-not-allowed'
                      : 'text-primary bg-primary/10 hover:bg-primary/20'
                  )}
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add Step
                </button>
                <button
                  type="button"
                  onClick={handleDeleteSelectedStep}
                  disabled={deleteStepDisabled}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
                    deleteStepDisabled
                      ? 'text-muted-foreground bg-muted cursor-not-allowed'
                      : 'text-red-600 bg-red-500/10 hover:bg-red-500/20 dark:text-red-300'
                  )}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Remove Step
                </button>
                <span className="text-xs text-muted-foreground max-w-[22rem]">{builderHint}</span>
              </div>
            )}

            {selectedNode && selectedIsAgent && !readOnly && (
              <div className="absolute top-4 right-4 z-10">
                <NodeEditor
                  key={selectedNode.id}
                  node={selectedNode}
                  onUpdate={handleNodeUpdate}
                  onApplyIntent={handleNodeIntent}
                  toolSuggestions={toolSuggestions}
                  presentationMode={presentationMode}
                  onClose={() => setSelectedNodeId(null)}
                />
              </div>
            )}
          </div>
        )}

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
              placeholder={`# Enter BAL code here\nentity_name {\n  "goal": "What this entity should accomplish",\n  "model": "openai|gpt-4o-mini",\n  "tools": { "web_search" }\n}`}
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
