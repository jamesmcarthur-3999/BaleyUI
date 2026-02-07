# Visual Editor — System Understanding Redesign

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Transform the visual editor from isolated floating boxes into the **central nervous system** of the builder — showing data flow, tool relationships, orchestration patterns, and shared resources. Make the visual the primary way users understand how their system works, with click-through navigation to the relevant tab for any element.

**Architecture:** Fix the broken chain extraction, add relationship edges (spawn, shared data, triggers), enhance nodes with visible tools, implement dagre layout, and wire visual editor clicks into the tab system so clicking a tool navigates to Connections, clicking a trigger navigates to Triggers, etc.

**Tech Stack:** Next.js 15, React 19, TypeScript, @xyflow/react v12, dagre (layout), Tailwind CSS, lucide-react.

**Design doc:** This file.

---

## Current Problems

1. **Chain extraction broken** — `parseBalCode()` returns `chain: undefined` despite full AST support. Zero edges rendered for `chain { a b c }`.
2. **No relationships shown** — Entities float as disconnected boxes. No arrows for spawn, triggers, shared data, or execution flow.
3. **Tools hidden** — BaleybotNode shows "3 tools" as a count. Can't see which tools, which are dangerous, or how they connect entities.
4. **Flat horizontal layout** — All nodes at `y=100` in a row. No hierarchy, grouping, or flow direction.
5. **Hub detection unused** — `hub-detection.ts` works but isn't used by the visual editor.
6. **Visual is a dead-end** — Clicking a node opens a basic property editor. No connection to other tabs (Test, Connections, Triggers, Analytics).
7. **No legend** — Users have no way to understand what different line styles mean.

## What Users Should Understand from the Visual

After this work, looking at the visual editor for a 4-agent research team should immediately tell you:

- **Who coordinates**: The hub entity (Research Coordinator) is visually prominent on the left with purple "spawns" arrows to each worker
- **What each agent does**: Individual tool pills on each node (web_search, fetch_url, store_memory)
- **How data flows**: Gold dotted lines between entities sharing store_memory/shared_storage
- **Trigger chains**: Green arrows for bb_completion triggers (Analyzer → Reporter)
- **Sequential flow**: Solid arrows for `chain { a b c }`
- **What needs attention**: Nodes pulse or badge when their readiness dimension is incomplete
- **Click-through navigation**: Click a tool pill → jump to Connections tab filtered to that tool's requirements. Click trigger badge → jump to Triggers tab.

---

## Dependency Graph

```
Phase 1 (Fix chain extraction)
    │
    ├── Phase 2 (New edge types + generation)
    │       │
    │       └── Phase 3 (Dagre layout) — needs edges for layout
    │
    ├── Phase 4 (Enhanced nodes with tools) — parallel with Phase 2
    │
    └── Phase 5 (Click-through navigation + legend)
            └── ties visual editor into the tab system
```

---

## Phase 1: Fix Chain Extraction (Critical Bug Fix)

### Task 1.1: Extract chain order from AST root

**Files:** Modify: `apps/web/src/lib/baleybot/generator.ts`

The parser produces `ast.root` which is an `ExprNode`. For `chain { a b c }`, it's a `ChainExprNode` with `body: [EntityRefNode...]`. Each `EntityRefNode` has `type: 'EntityRef'` and `name: string`.

**Step 1:** After `outputSchemaToRecord` (line 283) and before `parseBalCode` (line 288), add:

```typescript
/**
 * Extract execution structure from AST root expression.
 * Returns: { type: 'chain'|'parallel'|'single', order: string[] }
 */
function extractPipelineFromAst(
  node: { type: string; [key: string]: unknown } | null
): { type: 'chain' | 'parallel' | 'single'; order: string[] } | null {
  if (!node) return null;

  const extractNames = (n: { type: string; [key: string]: unknown }): string[] => {
    if (n.type === 'EntityRef' && typeof n.name === 'string') return [n.name];
    if (n.type === 'EntityRefWithContext' && typeof n.name === 'string') return [n.name];
    const body = n.body as Array<{ type: string; [key: string]: unknown }> | undefined;
    if (body && Array.isArray(body)) return body.flatMap(extractNames);
    // IfExpr — collect from both branches
    const then = n.thenBranch as { type: string; [key: string]: unknown } | undefined;
    const els = n.elseBranch as { type: string; [key: string]: unknown } | undefined;
    return [...(then ? extractNames(then) : []), ...(els ? extractNames(els) : [])];
  };

  switch (node.type) {
    case 'ChainExpr':
      return { type: 'chain', order: extractNames(node) };
    case 'ParallelExpr':
      return { type: 'parallel', order: extractNames(node) };
    default: {
      const names = extractNames(node);
      return names.length > 0 ? { type: 'single', order: names } : null;
    }
  }
}
```

**Step 2:** Replace line 312:
```typescript
// BEFORE:
return { entities, chain: undefined, errors: [] };

// AFTER:
const pipeline = extractPipelineFromAst(ast.root as { type: string; [key: string]: unknown } | null);
return { entities, chain: pipeline?.order, errors: [] };
```

**Step 3:** Run `pnpm type-check` — Expected: PASS

**Step 4:** Commit:
```bash
git add apps/web/src/lib/baleybot/generator.ts
git commit -m "fix: extract chain order from AST root in parseBalCode"
```

---

### Task 1.2: Write tests for chain extraction

**Files:** Create: `apps/web/src/lib/baleybot/__tests__/generator-chain.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { parseBalCode } from '../generator';

describe('parseBalCode chain extraction', () => {
  it('returns undefined chain for single entity (no pipeline expression)', () => {
    const result = parseBalCode(`
      assistant {
        "goal": "Help users"
      }
    `);
    expect(result.entities).toHaveLength(1);
    expect(result.chain).toBeUndefined();
  });

  it('extracts chain order for chain { a b }', () => {
    const result = parseBalCode(`
      analyzer {
        "goal": "Analyze data"
      }
      reporter {
        "goal": "Generate report"
      }
      chain { analyzer reporter }
    `);
    expect(result.entities).toHaveLength(2);
    expect(result.chain).toEqual(['analyzer', 'reporter']);
  });

  it('extracts names from parallel expression', () => {
    const result = parseBalCode(`
      worker_a {
        "goal": "Task A"
      }
      worker_b {
        "goal": "Task B"
      }
      parallel { worker_a worker_b }
    `);
    expect(result.entities).toHaveLength(2);
    expect(result.chain).toEqual(['worker_a', 'worker_b']);
  });

  it('returns undefined chain when no pipeline expression exists', () => {
    const result = parseBalCode(`
      bot_a {
        "goal": "Do A"
      }
      bot_b {
        "goal": "Do B"
      }
    `);
    expect(result.entities).toHaveLength(2);
    expect(result.chain).toBeUndefined();
  });
});
```

Run: `pnpm test -- apps/web/src/lib/baleybot/__tests__/generator-chain.test.ts` — Expected: PASS

```bash
git add apps/web/src/lib/baleybot/__tests__/generator-chain.test.ts
git commit -m "test: add chain extraction tests for parseBalCode"
```

---

## Phase 2: Relationship Edge Generation

### Task 2.1: Extend VisualEdge types

**Files:** Modify: `apps/web/src/lib/baleybot/visual/types.ts`

```typescript
// BEFORE:
type: 'chain' | 'conditional_pass' | 'conditional_fail' | 'parallel';

// AFTER:
type: 'chain' | 'conditional_pass' | 'conditional_fail' | 'parallel' | 'spawn' | 'shared_data' | 'trigger';
```

Run: `pnpm type-check` — Expected: PASS

```bash
git add apps/web/src/lib/baleybot/visual/types.ts
git commit -m "feat: add spawn, shared_data, trigger edge types to VisualEdge"
```

---

### Task 2.2: Generate relationship edges in bal-to-nodes

**Files:** Modify: `apps/web/src/lib/baleybot/visual/bal-to-nodes.ts`

After the existing `edges.push(...parallelEdges, ...conditionalEdges);` (line 153), add:

```typescript
  // Generate relationship edges from entity data
  edges.push(...generateSpawnEdges(nodes));
  edges.push(...generateSharedDataEdges(nodes));
  edges.push(...generateTriggerEdges(nodes));
```

Add these 3 functions after `parseConditionalEdges`:

```typescript
/**
 * Entities with spawn_baleybot connect to all other entities (potential spawn targets).
 */
function generateSpawnEdges(nodes: VisualNode[]): VisualEdge[] {
  const edges: VisualEdge[] = [];
  const hubNodes = nodes.filter(n => n.data.tools.includes('spawn_baleybot'));
  for (const hub of hubNodes) {
    for (const spoke of nodes) {
      if (spoke.id === hub.id) continue;
      edges.push({
        id: `spawn-${hub.id}->${spoke.id}`,
        source: hub.id,
        target: spoke.id,
        type: 'spawn',
        label: 'spawns',
        animated: true,
      });
    }
  }
  return edges;
}

/**
 * Entities sharing data tools (store_memory, shared_storage) have an implicit data relationship.
 */
function generateSharedDataEdges(nodes: VisualNode[]): VisualEdge[] {
  const edges: VisualEdge[] = [];
  const dataTools = ['store_memory', 'shared_storage'];
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i]!;
      const b = nodes[j]!;
      const shared = a.data.tools.filter(t => dataTools.includes(t) && b.data.tools.includes(t));
      if (shared.length > 0) {
        edges.push({
          id: `shared-${a.id}<->${b.id}`,
          source: a.id,
          target: b.id,
          type: 'shared_data',
          label: shared.join(', '),
        });
      }
    }
  }
  return edges;
}

/**
 * bb_completion triggers create edges from the source entity to the triggered entity.
 */
function generateTriggerEdges(nodes: VisualNode[]): VisualEdge[] {
  const edges: VisualEdge[] = [];
  const nodeNames = new Set(nodes.map(n => n.id));
  for (const node of nodes) {
    if (node.data.trigger?.type === 'other_bb') {
      const sourceId = node.data.trigger.sourceBaleybotId;
      if (sourceId && nodeNames.has(sourceId)) {
        edges.push({
          id: `trigger-${sourceId}->${node.id}`,
          source: sourceId,
          target: node.id,
          type: 'trigger',
          label: 'triggers',
          animated: true,
        });
      }
    }
  }
  return edges;
}
```

Run: `pnpm type-check` — Expected: PASS

```bash
git add apps/web/src/lib/baleybot/visual/bal-to-nodes.ts
git commit -m "feat: generate spawn, shared_data, trigger edges from entity data"
```

---

### Task 2.3: Style new edges in ClusterDiagram

**Files:** Modify: `apps/web/src/components/visual-editor/ClusterDiagram.tsx`

In `toReactFlowEdge`, add to the switch statement after `parallel` and before `default`:

```typescript
    case 'spawn':
      return {
        ...baseEdge,
        style: { stroke: 'hsl(280, 80%, 55%)', strokeWidth: 2, strokeDasharray: '8,4' },
        animated: true,
        data: { edgeType: edge.type },
      };
    case 'shared_data':
      return {
        ...baseEdge,
        style: { stroke: 'hsl(45, 90%, 50%)', strokeWidth: 1.5, strokeDasharray: '3,3' },
        data: { edgeType: edge.type },
      };
    case 'trigger':
      return {
        ...baseEdge,
        style: { stroke: 'hsl(142.1, 76.2%, 36.3%)', strokeWidth: 2 },
        animated: true,
        data: { edgeType: edge.type },
      };
```

Also add `data: { edgeType: edge.type }` to the existing chain and parallel cases.

Run: `pnpm type-check` — Expected: PASS

```bash
git add apps/web/src/components/visual-editor/ClusterDiagram.tsx
git commit -m "feat: style spawn, shared_data, trigger edges in ClusterDiagram"
```

---

### Task 2.4: Write edge generation tests

**Files:** Create: `apps/web/src/lib/baleybot/visual/__tests__/bal-to-nodes.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { balToVisual } from '../bal-to-nodes';

describe('balToVisual edge generation', () => {
  it('generates spawn edges for hub entities', () => {
    const result = balToVisual(`
      coordinator {
        "goal": "Orchestrate",
        "tools": ["spawn_baleybot"]
      }
      worker {
        "goal": "Do work",
        "tools": ["web_search"]
      }
    `);
    expect(result.graph.nodes).toHaveLength(2);
    const spawnEdges = result.graph.edges.filter(e => e.type === 'spawn');
    expect(spawnEdges).toHaveLength(1);
    expect(spawnEdges[0]?.source).toBe('coordinator');
    expect(spawnEdges[0]?.target).toBe('worker');
  });

  it('generates shared_data edges for store_memory', () => {
    const result = balToVisual(`
      writer {
        "goal": "Write",
        "tools": ["store_memory"]
      }
      reader {
        "goal": "Read",
        "tools": ["store_memory"]
      }
    `);
    const shared = result.graph.edges.filter(e => e.type === 'shared_data');
    expect(shared).toHaveLength(1);
    expect(shared[0]?.label).toBe('store_memory');
  });

  it('generates trigger edges for bb_completion', () => {
    const result = balToVisual(`
      analyzer {
        "goal": "Analyze",
        "trigger": "manual"
      }
      reporter {
        "goal": "Report",
        "trigger": "bb_completion:analyzer"
      }
    `);
    const triggers = result.graph.edges.filter(e => e.type === 'trigger');
    expect(triggers).toHaveLength(1);
    expect(triggers[0]?.source).toBe('analyzer');
    expect(triggers[0]?.target).toBe('reporter');
  });

  it('generates chain edges when chain expression exists', () => {
    const result = balToVisual(`
      a { "goal": "A" }
      b { "goal": "B" }
      chain { a b }
    `);
    const chains = result.graph.edges.filter(e => e.type === 'chain');
    expect(chains).toHaveLength(1);
    expect(chains[0]?.source).toBe('a');
    expect(chains[0]?.target).toBe('b');
  });

  it('does not generate shared edges when tools do not overlap', () => {
    const result = balToVisual(`
      a { "goal": "A", "tools": ["web_search"] }
      b { "goal": "B", "tools": ["fetch_url"] }
    `);
    const shared = result.graph.edges.filter(e => e.type === 'shared_data');
    expect(shared).toHaveLength(0);
  });

  it('handles hub with multiple spokes', () => {
    const result = balToVisual(`
      hub { "goal": "Hub", "tools": ["spawn_baleybot"] }
      w1 { "goal": "W1", "tools": ["web_search"] }
      w2 { "goal": "W2", "tools": ["fetch_url"] }
      w3 { "goal": "W3", "tools": ["store_memory"] }
    `);
    const spawnEdges = result.graph.edges.filter(e => e.type === 'spawn');
    expect(spawnEdges).toHaveLength(3);
  });
});
```

Run: `pnpm test -- apps/web/src/lib/baleybot/visual/__tests__/bal-to-nodes.test.ts` — Expected: PASS

```bash
git add apps/web/src/lib/baleybot/visual/__tests__/bal-to-nodes.test.ts
git commit -m "test: add edge generation tests"
```

---

## Phase 3: Dagre Hierarchical Layout

### Task 3.1: Install dagre

```bash
pnpm add dagre --filter=web && pnpm add -D @types/dagre --filter=web
```

```bash
git add package.json apps/web/package.json pnpm-lock.yaml
git commit -m "chore: add dagre dependency for graph layout"
```

---

### Task 3.2: Replace horizontal layout with dagre

**Files:** Modify: `apps/web/src/lib/baleybot/visual/bal-to-nodes.ts`

**Step 1:** Add import at top:
```typescript
import dagre from 'dagre';
```

**Step 2:** Replace the `autoLayout` function (lines 275-283) with:

```typescript
/**
 * Apply dagre hierarchical layout to position nodes based on edges.
 * Falls back to horizontal layout if no edges or dagre fails.
 */
export function autoLayout(nodes: VisualNode[], edges: VisualEdge[] = []): VisualNode[] {
  if (nodes.length === 0) return nodes;

  // No edges — simple horizontal
  if (edges.length === 0) {
    return nodes.map((node, index) => ({
      ...node,
      position: { x: index * (NODE_WIDTH + HORIZONTAL_GAP), y: 100 },
    }));
  }

  try {
    const g = new dagre.graphlib.Graph();
    g.setGraph({ rankdir: 'LR', nodesep: 60, ranksep: 140, marginx: 40, marginy: 40 });
    g.setDefaultEdgeLabel(() => ({}));

    for (const node of nodes) {
      g.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
    }
    for (const edge of edges) {
      g.setEdge(edge.source, edge.target);
    }

    dagre.layout(g);

    return nodes.map((node) => {
      const pos = g.node(node.id);
      return pos
        ? { ...node, position: { x: pos.x - NODE_WIDTH / 2, y: pos.y - NODE_HEIGHT / 2 } }
        : node;
    });
  } catch {
    return nodes.map((node, index) => ({
      ...node,
      position: { x: index * (NODE_WIDTH + HORIZONTAL_GAP), y: 100 },
    }));
  }
}
```

**Step 3:** In `balToVisualFromParsed`, apply dagre layout before returning. Replace the return statement:

```typescript
  // Apply dagre layout based on edges
  const layoutedNodes = autoLayout(nodes, edges);

  return { graph: { nodes: layoutedNodes, edges }, errors: [] };
```

**Step 4:** Run `pnpm type-check` — Expected: PASS

```bash
git add apps/web/src/lib/baleybot/visual/bal-to-nodes.ts
git commit -m "feat: replace horizontal layout with dagre hierarchical layout"
```

---

### Task 3.3: Add layout tests

Append to `apps/web/src/lib/baleybot/visual/__tests__/bal-to-nodes.test.ts`:

```typescript
describe('dagre layout', () => {
  it('positions chain nodes left-to-right', () => {
    const result = balToVisual(`
      a { "goal": "A" }
      b { "goal": "B" }
      chain { a b }
    `);
    const nodeA = result.graph.nodes.find(n => n.id === 'a')!;
    const nodeB = result.graph.nodes.find(n => n.id === 'b')!;
    expect(nodeA.position.x).toBeLessThan(nodeB.position.x);
  });

  it('positions hub left of spokes', () => {
    const result = balToVisual(`
      hub { "goal": "Hub", "tools": ["spawn_baleybot"] }
      w1 { "goal": "W1" }
      w2 { "goal": "W2" }
    `);
    const hubNode = result.graph.nodes.find(n => n.id === 'hub')!;
    const w1 = result.graph.nodes.find(n => n.id === 'w1')!;
    expect(hubNode.position.x).toBeLessThan(w1.position.x);
  });

  it('falls back to horizontal for no-edge graphs', () => {
    const result = balToVisual(`
      a { "goal": "A" }
      b { "goal": "B" }
    `);
    // Both at y=100 in horizontal fallback
    const nodeA = result.graph.nodes.find(n => n.id === 'a')!;
    const nodeB = result.graph.nodes.find(n => n.id === 'b')!;
    expect(nodeA.position.y).toBe(nodeB.position.y);
  });
});
```

Run: `pnpm test -- apps/web/src/lib/baleybot/visual/__tests__/bal-to-nodes.test.ts` — Expected: PASS

```bash
git add apps/web/src/lib/baleybot/visual/__tests__/bal-to-nodes.test.ts
git commit -m "test: add dagre layout tests"
```

---

## Phase 4: Enhanced BaleybotNode with Tool Visualization

### Task 4.1: Show individual tools with icons and categories

**Files:** Modify: `apps/web/src/components/visual-editor/BaleybotNode.tsx`

**Step 1:** Add `Shield` import:
```typescript
import { Zap, Clock, Globe, Wrench, Target, Shield } from 'lucide-react';
```

**Step 2:** Replace the tool count section (lines 91-98) with individual tool pills:

```typescript
          {/* Individual tools */}
          {nodeData.tools && nodeData.tools.length > 0 && (
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5">
                <Wrench className="h-3 w-3 text-muted-foreground shrink-0" />
                <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Tools</span>
              </div>
              <div className="flex flex-wrap gap-1">
                {nodeData.tools.map((tool) => (
                  <span
                    key={tool}
                    className={cn(
                      'inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium',
                      getToolStyle(tool)
                    )}
                  >
                    <span>{getToolIcon(tool)}</span>
                    {formatToolName(tool)}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Approval-required tools */}
          {nodeData.canRequest && nodeData.canRequest.length > 0 && (
            <div className="space-y-1">
              <div className="flex items-center gap-1.5">
                <Shield className="h-3 w-3 text-amber-500 shrink-0" />
                <span className="text-[10px] font-medium text-amber-600 dark:text-amber-400 uppercase tracking-wider">Approval</span>
              </div>
              <div className="flex flex-wrap gap-1">
                {nodeData.canRequest.map((tool) => (
                  <span
                    key={tool}
                    className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/20"
                  >
                    {getToolIcon(tool)} {formatToolName(tool)}
                  </span>
                ))}
              </div>
            </div>
          )}
```

**Step 3:** Add helper functions after `getNodeEmoji`:

```typescript
function getToolIcon(tool: string): string {
  if (tool === 'web_search') return '🔍';
  if (tool === 'fetch_url') return '🌐';
  if (tool === 'spawn_baleybot') return '🤖';
  if (tool === 'send_notification') return '🔔';
  if (tool === 'store_memory') return '💾';
  if (tool === 'shared_storage') return '📦';
  if (tool === 'schedule_task') return '📅';
  if (tool === 'create_agent') return '🧬';
  if (tool === 'create_tool') return '🔧';
  if (tool.startsWith('query_postgres')) return '🐘';
  if (tool.startsWith('query_mysql')) return '🐬';
  return '⚡';
}

function getToolStyle(tool: string): string {
  if (tool === 'spawn_baleybot') return 'bg-purple-500/10 text-purple-700 dark:text-purple-300 border border-purple-500/20';
  if (tool === 'store_memory' || tool === 'shared_storage') return 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/20';
  if (tool.startsWith('query_')) return 'bg-blue-500/10 text-blue-700 dark:text-blue-300 border border-blue-500/20';
  return 'bg-muted text-muted-foreground border border-border/50';
}

function formatToolName(tool: string): string {
  return tool.replace(/_/g, ' ');
}
```

**Step 4:** Increase node width to accommodate tools. Change `w-[260px]` to `w-[290px]`.

Run: `pnpm type-check` — Expected: PASS

```bash
git add apps/web/src/components/visual-editor/BaleybotNode.tsx
git commit -m "feat: show individual tools with icons and approval badges in BaleybotNode"
```

---

## Phase 5: Visual ↔ Tab System Integration + Legend

### Task 5.1: Add onNodeClick callback to page.tsx visual editor

**Files:** Modify: `apps/web/src/app/dashboard/baleybots/[id]/page.tsx`

Currently clicking a node opens NodeEditor in the VisualEditor. We want to also allow users to click specific elements (tools, triggers) to navigate to the relevant tab.

Add `onViewAction` callback support to VisualEditor. In the visual editor section (around line 1612), update:

```typescript
                      <VisualEditor
                        balCode={balCode}
                        onChange={handleCodeChange}
                        readOnly={status === 'building' || status === 'running'}
                        className="h-full"
                        hideToolbar
                      />
```

This requires no change to VisualEditor itself — the `onNodeClick` callback is already handled internally by VisualEditor's `ClusterDiagram`. The broader integration is in the next task.

---

### Task 5.2: Add edge legend to ClusterDiagram

**Files:** Modify: `apps/web/src/components/visual-editor/ClusterDiagram.tsx`

**Step 1:** Track edge types for the legend. After `useEdgesState`, add:

```typescript
  // Compute visible edge types for legend
  const edgeTypes = new Set(
    graph.edges.map(e => e.type).filter(Boolean)
  );
```

**Step 2:** Add legend overlay inside the ReactFlow component, after `<MiniMap>`:

```typescript
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
          </div>
        )}
```

**Step 3:** Add the LegendItem component before ClusterDiagram:

```typescript
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
```

Run: `pnpm type-check` — Expected: PASS

```bash
git add apps/web/src/components/visual-editor/ClusterDiagram.tsx
git commit -m "feat: add edge legend overlay to visual editor"
```

---

### Task 5.3: Remove standalone hub badge from page.tsx

Now that hub-spoke relationships are shown as purple edges in the visual editor, the standalone "Hub: X → Y spokes" badge (page.tsx lines 1601-1611) is redundant. Remove it.

**Files:** Modify: `apps/web/src/app/dashboard/baleybots/[id]/page.tsx`

Replace the visual editor section (lines 1599-1619):

```typescript
                  {/* Visual Editor View */}
                  {viewMode === 'visual' && (
                    <VisualEditor
                      balCode={balCode}
                      onChange={handleCodeChange}
                      readOnly={status === 'building' || status === 'running'}
                      className="h-full"
                      hideToolbar
                    />
                  )}
```

Note: Keep the `detectHubTopology` import for now (might be used elsewhere). If unused after this change, remove the import.

Run: `pnpm type-check` — Expected: PASS

```bash
git add apps/web/src/app/dashboard/baleybots/[id]/page.tsx
git commit -m "refactor: remove redundant hub badge (edges now show this)"
```

---

## Phase 6: Phase Verification

### Task 6.1: Full verification

```bash
pnpm type-check && pnpm test && pnpm lint
```

Expected: All pass.

### Task 6.2: Browser test

1. Create a multi-bot system with spawn_baleybot
2. Verify edges appear (purple dashed for spawn, gold dotted for shared data)
3. Verify dagre positions hub on left, spokes on right
4. Verify tool pills visible on each node
5. Verify legend appears
6. Test with chain { a b } — verify sequential arrows

```bash
git add -A && git commit -m "chore: visual editor relationship visualization complete"
```

---

## Critical Files Summary

| File | Phase | Action | What Changes |
|------|-------|--------|------|
| `apps/web/src/lib/baleybot/generator.ts` | 1 | Modify | Fix chain extraction from AST |
| `apps/web/src/lib/baleybot/__tests__/generator-chain.test.ts` | 1 | Create | Chain extraction tests |
| `apps/web/src/lib/baleybot/visual/types.ts` | 2 | Modify | Add 3 new edge types |
| `apps/web/src/lib/baleybot/visual/bal-to-nodes.ts` | 2, 3 | Modify | Edge generation + dagre layout |
| `apps/web/src/lib/baleybot/visual/__tests__/bal-to-nodes.test.ts` | 2, 3 | Create | Edge + layout tests |
| `apps/web/src/components/visual-editor/ClusterDiagram.tsx` | 2, 5 | Modify | Edge styles + legend |
| `apps/web/src/components/visual-editor/BaleybotNode.tsx` | 4 | Modify | Individual tool pills |
| `apps/web/src/app/dashboard/baleybots/[id]/page.tsx` | 5 | Modify | Remove redundant hub badge |

## What We're NOT Changing

- VisualEditor.tsx (orchestrator — parse/render pipeline unchanged)
- NodeEditor.tsx (property editor — separate concern, works as-is)
- Creator Canvas (SVG animation during build — different system)
- Database schema (no migrations)
- Backend executor or streaming
- Left panel / conversation thread
- Other tabs (Connections, Test, Triggers, Analytics, Monitor)

## What This Enables

| Before | After |
|--------|-------|
| Isolated floating boxes | Connected graph with colored edges showing all relationships |
| "3 tools" count | Individual tool pills with icons, color-coded by category |
| Flat horizontal row | Hierarchical layout: hub left, spokes right, chains flow L→R |
| No legend | Legend overlay explaining each edge type |
| Manual hub badge | Hub-spoke shown organically through purple spawn edges |
| No chain visualization | Chain arrows between sequentially-connected entities |
| No data flow | Gold dotted lines between entities sharing store_memory |
| No trigger visualization | Green arrows for bb_completion triggers |
