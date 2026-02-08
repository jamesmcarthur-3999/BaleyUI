import { describe, it, expect } from 'vitest';
import { balToVisual, balToVisualFromParsed } from '../bal-to-nodes';

// NOTE: The SDK lexer uses { } brace syntax for tools arrays (not [ ] brackets).
// The documented [ ] bracket syntax requires LBRACKET/RBRACKET tokens in the lexer.
// TODO: Add bracket syntax tests after SDK lexer adds [ ] support.

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
        "tools": { "spawn_baleybot" }
      }
      worker {
        "goal": "Do work",
        "tools": { "web_search" }
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
        "tools": { "store_memory" }
      }
      reader {
        "goal": "Read",
        "tools": { "store_memory" }
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
      a { "goal": "A", "tools": { "web_search" } }
      b { "goal": "B", "tools": { "fetch_url" } }
    `);
    const shared = result.graph.edges.filter(e => e.type === 'shared_data');
    expect(shared).toHaveLength(0);
  });

  it('handles hub with multiple spokes', () => {
    const result = balToVisual(`
      hub { "goal": "Hub", "tools": { "spawn_baleybot" } }
      w1 { "goal": "W1", "tools": { "web_search" } }
      w2 { "goal": "W2", "tools": { "fetch_url" } }
      w3 { "goal": "W3", "tools": { "store_memory" } }
    `);
    const spawnEdges = result.graph.edges.filter(e => e.type === 'spawn');
    expect(spawnEdges).toHaveLength(3);
  });

  it('generates shared_data edges for shared_storage', () => {
    const result = balToVisual(`
      a { "goal": "A", "tools": { "shared_storage" } }
      b { "goal": "B", "tools": { "shared_storage" } }
      c { "goal": "C", "tools": { "web_search" } }
    `);
    const shared = result.graph.edges.filter(e => e.type === 'shared_data');
    expect(shared).toHaveLength(1);
    expect(shared[0]?.source).toBe('a');
    expect(shared[0]?.target).toBe('b');
  });

  it('generates both chain and spawn edges when both exist', () => {
    const result = balToVisual(`
      hub { "goal": "Hub", "tools": { "spawn_baleybot" } }
      worker { "goal": "Work", "tools": { "web_search" } }
      chain { hub worker }
    `);
    const chains = result.graph.edges.filter(e => e.type === 'chain');
    const spawns = result.graph.edges.filter(e => e.type === 'spawn');
    expect(chains).toHaveLength(1);
    expect(spawns).toHaveLength(1);
  });

  it('creates nodes for all entities', () => {
    const result = balToVisual(`
      bot_a { "goal": "A", "tools": { "web_search", "fetch_url" } }
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

describe('balToVisualFromParsed trigger parsing', () => {
  it('parses schedule trigger from config string', () => {
    const parsed = {
      entities: [
        { name: 'poller', config: { goal: 'Poll data', tools: [], trigger: 'schedule:*/5 * * * *' } },
      ],
      errors: [],
    };
    const result = balToVisualFromParsed('poller { "goal": "Poll data" }', parsed);
    expect(result.graph.nodes[0]?.data.trigger).toEqual({
      type: 'schedule',
      schedule: '*/5 * * * *',
    });
  });

  it('parses manual trigger from config string', () => {
    const parsed = {
      entities: [
        { name: 'bot', config: { goal: 'Help', tools: [], trigger: 'manual' } },
      ],
      errors: [],
    };
    const result = balToVisualFromParsed('bot { "goal": "Help" }', parsed);
    expect(result.graph.nodes[0]?.data.trigger).toEqual({ type: 'manual' });
  });

  it('parses webhook trigger from config string', () => {
    const parsed = {
      entities: [
        { name: 'handler', config: { goal: 'Handle events', tools: [], trigger: 'webhook' } },
      ],
      errors: [],
    };
    const result = balToVisualFromParsed('handler { "goal": "Handle events" }', parsed);
    expect(result.graph.nodes[0]?.data.trigger).toEqual({ type: 'webhook' });
  });

  it('handles trigger as object config', () => {
    const parsed = {
      entities: [
        {
          name: 'bot',
          config: {
            goal: 'Help',
            tools: [],
            trigger: { type: 'schedule', schedule: '0 9 * * *', enabled: true },
          },
        },
      ],
      errors: [],
    };
    const result = balToVisualFromParsed('bot { "goal": "Help" }', parsed);
    expect(result.graph.nodes[0]?.data.trigger?.type).toBe('schedule');
    expect(result.graph.nodes[0]?.data.trigger?.schedule).toBe('0 9 * * *');
  });

  it('handles entity with no trigger', () => {
    const parsed = {
      entities: [
        { name: 'bot', config: { goal: 'Help', tools: [] } },
      ],
      errors: [],
    };
    const result = balToVisualFromParsed('bot { "goal": "Help" }', parsed);
    expect(result.graph.nodes[0]?.data.trigger).toBeUndefined();
  });
});

describe('balToVisualFromParsed entity data extraction', () => {
  it('extracts output schema from parsed entities', () => {
    const result = balToVisual(`
      bot {
        "goal": "Analyze",
        "output": {
          "score": "number",
          "label": "string"
        }
      }
    `);
    expect(result.graph.nodes[0]?.data.output).toBeDefined();
    expect(result.graph.nodes[0]?.data.output?.score).toBe('number');
    expect(result.graph.nodes[0]?.data.output?.label).toBe('string');
  });

  it('handles entity with can_request via parsed config', () => {
    const parsed = {
      entities: [
        {
          name: 'bot',
          config: {
            goal: 'Help',
            tools: ['web_search'],
            can_request: ['schedule_task'],
          },
        },
      ],
      errors: [],
    };
    const result = balToVisualFromParsed('bot { "goal": "Help" }', parsed);
    expect(result.graph.nodes[0]?.data.canRequest).toEqual(['schedule_task']);
  });

  it('returns empty graph for parsed result with errors', () => {
    const parsed = {
      entities: [],
      errors: ['Parse error: unexpected token'],
    };
    const result = balToVisualFromParsed('invalid', parsed);
    expect(result.graph.nodes).toHaveLength(0);
    expect(result.errors).toHaveLength(1);
  });

  it('generates edges correctly with pre-parsed chain', () => {
    const parsed = {
      entities: [
        { name: 'a', config: { goal: 'A', tools: [] } },
        { name: 'b', config: { goal: 'B', tools: [] } },
        { name: 'c', config: { goal: 'C', tools: [] } },
      ],
      chain: ['a', 'b', 'c'],
      errors: [],
    };
    const result = balToVisualFromParsed('', parsed);
    const chains = result.graph.edges.filter(e => e.type === 'chain');
    expect(chains).toHaveLength(2);
    expect(chains[0]?.source).toBe('a');
    expect(chains[0]?.target).toBe('b');
    expect(chains[1]?.source).toBe('b');
    expect(chains[1]?.target).toBe('c');
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
      hub { "goal": "Hub", "tools": { "spawn_baleybot" } }
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
      hub { "goal": "Hub", "tools": { "spawn_baleybot" } }
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
