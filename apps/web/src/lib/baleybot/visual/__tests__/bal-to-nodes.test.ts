import { describe, it, expect } from 'vitest';
import { balToVisual, balToVisualFromParsed } from '../bal-to-nodes';

describe('balToVisual edge generation', () => {
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

  it('generates trigger edges for bb_completion (via config)', () => {
    // "trigger" is not in BAL syntax — it comes from the database/UI as entity config
    const balCode = `
      analyzer { "goal": "Analyze" }
      reporter { "goal": "Report" }
    `;
    const parsed = {
      entities: [
        { name: 'analyzer', config: { goal: 'Analyze', tools: [] } },
        { name: 'reporter', config: { goal: 'Report', tools: [], trigger: 'bb_completion:analyzer' } },
      ],
      errors: [],
    };
    const result = balToVisualFromParsed(balCode, parsed);
    const triggers = result.graph.edges.filter(e => e.type === 'trigger');
    expect(triggers).toHaveLength(1);
    expect(triggers[0]?.source).toBe('analyzer');
    expect(triggers[0]?.target).toBe('reporter');
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

  it('generates shared_data edges for shared_storage', () => {
    const result = balToVisual(`
      a { "goal": "A", "tools": ["shared_storage"] }
      b { "goal": "B", "tools": ["shared_storage"] }
      c { "goal": "C", "tools": ["web_search"] }
    `);
    const shared = result.graph.edges.filter(e => e.type === 'shared_data');
    expect(shared).toHaveLength(1);
    expect(shared[0]?.source).toBe('a');
    expect(shared[0]?.target).toBe('b');
  });

  it('generates both chain and spawn edges when both exist', () => {
    const result = balToVisual(`
      hub { "goal": "Hub", "tools": ["spawn_baleybot"] }
      worker { "goal": "Work", "tools": ["web_search"] }
      chain { hub worker }
    `);
    const chains = result.graph.edges.filter(e => e.type === 'chain');
    const spawns = result.graph.edges.filter(e => e.type === 'spawn');
    expect(chains).toHaveLength(1);
    expect(spawns).toHaveLength(1);
  });

  it('creates nodes for all entities', () => {
    const result = balToVisual(`
      bot_a { "goal": "A", "tools": ["web_search", "fetch_url"] }
      bot_b { "goal": "B", "model": "openai:gpt-4o" }
    `);
    expect(result.graph.nodes).toHaveLength(2);
    expect(result.graph.nodes[0]?.data.tools).toEqual(['web_search', 'fetch_url']);
    expect(result.graph.nodes[1]?.data.model).toBe('openai:gpt-4o');
  });

  it('returns empty graph for invalid BAL', () => {
    const result = balToVisual('this is not valid BAL');
    expect(result.graph.nodes).toHaveLength(0);
    expect(result.errors.length).toBeGreaterThan(0);
  });
});

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

  it('staggers spokes vertically', () => {
    const result = balToVisual(`
      hub { "goal": "Hub", "tools": ["spawn_baleybot"] }
      w1 { "goal": "W1" }
      w2 { "goal": "W2" }
      w3 { "goal": "W3" }
    `);
    const positions = result.graph.nodes
      .filter(n => n.id !== 'hub')
      .map(n => n.position.y);
    // With 3 spokes, dagre should stagger them vertically
    const uniqueY = new Set(positions);
    expect(uniqueY.size).toBeGreaterThanOrEqual(2);
  });
});
