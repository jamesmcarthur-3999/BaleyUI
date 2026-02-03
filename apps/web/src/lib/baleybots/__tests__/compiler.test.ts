import { describe, it, expect } from 'vitest';
import { compileFlow } from '../compiler';
import type { FlowDefinition, FlowNode, FlowEdge, FlowTrigger } from '../types';

// Helper to create a minimal flow definition
function createFlowDefinition(
  nodes: FlowNode[],
  edges: FlowEdge[] = []
): FlowDefinition {
  return {
    id: 'test-flow',
    name: 'Test Flow',
    nodes,
    edges,
    triggers: [] as FlowTrigger[],
    enabled: true,
    version: 1,
  };
}

// Helper to create a source node
function createSourceNode(id: string = 'source-1'): FlowNode {
  return {
    id,
    type: 'source',
    position: { x: 0, y: 0 },
    data: {
      label: 'Trigger',
      triggerType: 'manual',
    },
  };
}

// Helper to create a sink node
function createSinkNode(id: string = 'sink-1'): FlowNode {
  return {
    id,
    type: 'sink',
    position: { x: 200, y: 0 },
    data: {
      label: 'Output',
      sinkType: 'output',
    },
  };
}

// Helper to create an AI block node
function createAIBlockNode(id: string = 'ai-1'): FlowNode {
  return {
    id,
    type: 'ai-block',
    position: { x: 100, y: 0 },
    data: {
      label: 'AI Block',
      blockId: 'block-123',
    },
  };
}

// Helper to create a loop node
function createLoopNode(id: string = 'loop-1'): FlowNode {
  return {
    id,
    type: 'loop',
    position: { x: 100, y: 0 },
    data: {
      label: 'Loop',
      maxIterations: 10,
      condition: { type: 'field', field: 'done', operator: 'eq', value: true },
    },
  };
}

// Helper to create a router node
function createRouterNode(id: string = 'router-1'): FlowNode {
  return {
    id,
    type: 'router',
    position: { x: 100, y: 0 },
    data: {
      label: 'Router',
      routes: { option_a: 'ai-1', option_b: 'ai-2' },
      routeField: 'route',
      defaultRoute: 'option_a',
    },
  };
}

// Helper to create an edge
function createEdge(
  source: string,
  target: string,
  sourceHandle?: string
): FlowEdge {
  return {
    id: `${source}-${target}`,
    source,
    target,
    sourceHandle,
  };
}

describe('Flow Compiler - Phase 1 Validation', () => {
  describe('validateFlowStructure', () => {
    it('errors when no source node exists', async () => {
      const flow = createFlowDefinition([createSinkNode()]);

      const result = await compileFlow(flow, { validateOnly: true });

      expect(result.success).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          code: 'NO_SOURCE',
          message: expect.stringContaining('source'),
        })
      );
    });

    it('warns when no sink node exists', async () => {
      const flow = createFlowDefinition([createSourceNode()]);

      const result = await compileFlow(flow, { validateOnly: true });

      expect(result.warnings).toContainEqual(
        expect.objectContaining({
          code: 'NO_SINK',
          message: expect.stringContaining('sink'),
        })
      );
    });

    it('detects orphan nodes (nodes without incoming connections)', async () => {
      const flow = createFlowDefinition([
        createSourceNode(),
        createAIBlockNode('orphan'),
        createSinkNode(),
      ]);
      // No edges connecting the AI block

      const result = await compileFlow(flow, { validateOnly: true });

      expect(result.warnings).toContainEqual(
        expect.objectContaining({
          code: 'ORPHAN_NODE',
          nodeId: 'orphan',
        })
      );
    });

    it('detects dead-end nodes (nodes without outgoing connections)', async () => {
      const flow = createFlowDefinition(
        [createSourceNode(), createAIBlockNode('deadend'), createSinkNode()],
        [
          createEdge('source-1', 'deadend'),
          // No edge from deadend to sink
        ]
      );

      const result = await compileFlow(flow, { validateOnly: true });

      expect(result.warnings).toContainEqual(
        expect.objectContaining({
          code: 'DEAD_END_NODE',
          nodeId: 'deadend',
        })
      );
    });
  });

  describe('detectCycles', () => {
    it('detects simple cycles', async () => {
      const flow = createFlowDefinition(
        [
          createSourceNode(),
          createAIBlockNode('ai-1'),
          createAIBlockNode('ai-2'),
          createSinkNode(),
        ],
        [
          createEdge('source-1', 'ai-1'),
          createEdge('ai-1', 'ai-2'),
          createEdge('ai-2', 'ai-1'), // Creates a cycle
          createEdge('ai-2', 'sink-1'),
        ]
      );

      const result = await compileFlow(flow, { validateOnly: true });

      expect(result.errors).toContainEqual(
        expect.objectContaining({
          code: 'CYCLE_DETECTED',
          message: expect.stringContaining('Cycle detected'),
        })
      );
    });

    it('allows cycles inside loop nodes', async () => {
      const flow = createFlowDefinition(
        [
          createSourceNode(),
          createLoopNode('loop-1'),
          createAIBlockNode('ai-1'),
          createSinkNode(),
        ],
        [
          createEdge('source-1', 'loop-1'),
          createEdge('loop-1', 'ai-1'),
          createEdge('ai-1', 'loop-1'), // Cycle back to loop is allowed
          createEdge('loop-1', 'sink-1'),
        ]
      );

      const result = await compileFlow(flow, { validateOnly: true });

      // Should not have cycle error since it's part of a loop node
      const cycleErrors = result.errors.filter((e) => e.code === 'CYCLE_DETECTED');
      expect(cycleErrors).toHaveLength(0);
    });

    it('reports cycle path in error', async () => {
      const flow = createFlowDefinition(
        [
          createSourceNode(),
          { ...createAIBlockNode('ai-1'), data: { label: 'First', blockId: 'block-1' } } as FlowNode,
          { ...createAIBlockNode('ai-2'), data: { label: 'Second', blockId: 'block-2' } } as FlowNode,
          createSinkNode(),
        ],
        [
          createEdge('source-1', 'ai-1'),
          createEdge('ai-1', 'ai-2'),
          createEdge('ai-2', 'ai-1'), // Cycle
        ]
      );

      const result = await compileFlow(flow, { validateOnly: true });

      const cycleError = result.errors.find((e) => e.code === 'CYCLE_DETECTED');
      expect(cycleError?.message).toMatch(/First.*Second|Second.*First/);
    });
  });

  describe('validateConnections', () => {
    it('errors when sink has outgoing connection', async () => {
      const flow = createFlowDefinition(
        [createSourceNode(), createSinkNode(), createAIBlockNode('ai-1')],
        [
          createEdge('source-1', 'sink-1'),
          createEdge('sink-1', 'ai-1'), // Invalid: sink should not have outgoing
        ]
      );

      const result = await compileFlow(flow, { validateOnly: true });

      expect(result.errors).toContainEqual(
        expect.objectContaining({
          code: 'INVALID_SINK_OUTPUT',
          message: expect.stringContaining('cannot have outgoing'),
        })
      );
    });

    it('errors when source has incoming connection', async () => {
      const flow = createFlowDefinition(
        [createSourceNode(), createAIBlockNode('ai-1'), createSinkNode()],
        [
          createEdge('ai-1', 'source-1'), // Invalid: source should not have incoming
          createEdge('source-1', 'sink-1'),
        ]
      );

      const result = await compileFlow(flow, { validateOnly: true });

      expect(result.errors).toContainEqual(
        expect.objectContaining({
          code: 'INVALID_SOURCE_INPUT',
          message: expect.stringContaining('cannot have incoming'),
        })
      );
    });

    it('validates router handle names', async () => {
      const flow = createFlowDefinition(
        [
          createSourceNode(),
          createRouterNode('router-1'),
          createAIBlockNode('ai-1'),
          createSinkNode(),
        ],
        [
          createEdge('source-1', 'router-1'),
          createEdge('router-1', 'ai-1', 'unknown_route'), // Invalid route handle
          createEdge('ai-1', 'sink-1'),
        ]
      );

      const result = await compileFlow(flow, { validateOnly: true });

      expect(result.warnings).toContainEqual(
        expect.objectContaining({
          code: 'UNKNOWN_ROUTE',
          message: expect.stringContaining('unknown_route'),
        })
      );
    });
  });
});

describe('Flow Compiler - Valid Flows', () => {
  it('compiles a simple linear flow', async () => {
    const flow = createFlowDefinition(
      [createSourceNode(), createAIBlockNode('ai-1'), createSinkNode()],
      [createEdge('source-1', 'ai-1'), createEdge('ai-1', 'sink-1')]
    );

    const result = await compileFlow(flow, { validateOnly: true });

    expect(result.success).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('compiles a flow with router', async () => {
    const flow = createFlowDefinition(
      [
        createSourceNode(),
        createRouterNode('router-1'),
        createAIBlockNode('ai-1'),
        createAIBlockNode('ai-2'),
        createSinkNode(),
      ],
      [
        createEdge('source-1', 'router-1'),
        createEdge('router-1', 'ai-1', 'option_a'),
        createEdge('router-1', 'ai-2', 'option_b'),
        createEdge('ai-1', 'sink-1'),
        createEdge('ai-2', 'sink-1'),
      ]
    );

    const result = await compileFlow(flow, { validateOnly: true });

    expect(result.success).toBe(true);
    expect(result.errors).toHaveLength(0);
  });
});
