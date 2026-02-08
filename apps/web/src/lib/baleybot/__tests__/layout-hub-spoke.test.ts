import { describe, it, expect } from 'vitest';
import { balToVisual } from '../bal-parser-pure';

// NOTE: The SDK lexer uses { } brace syntax for tools arrays (not [ ] brackets).
// TODO: Switch to bracket syntax after SDK lexer adds [ ] support.

const FIVE_AGENT_HUB_BAL = `
coordinator {
  "goal": "Coordinate and distribute work across specialists",
  "model": "anthropic:claude-sonnet-4-20250514",
  "tools": { "spawn_baleybot", "store_memory" }
}

researcher {
  "goal": "Research topics using web search",
  "model": "openai:gpt-4o-mini",
  "tools": { "web_search", "store_memory" }
}

fetcher {
  "goal": "Fetch and parse web content",
  "model": "openai:gpt-4o-mini",
  "tools": { "fetch_url", "store_memory" }
}

analyzer {
  "goal": "Analyze collected data",
  "model": "anthropic:claude-sonnet-4-20250514",
  "tools": { "store_memory", "shared_storage" }
}

reporter {
  "goal": "Generate summary reports",
  "model": "anthropic:claude-sonnet-4-20250514",
  "tools": { "send_notification", "store_memory" }
}

chain { coordinator researcher fetcher analyzer reporter }
`;

describe('5-node hub-and-spoke layout', () => {
  it('parses 5 entities correctly', () => {
    const result = balToVisual(FIVE_AGENT_HUB_BAL);
    expect(result.errors).toHaveLength(0);
    expect(result.graph.nodes).toHaveLength(5);
    const names = result.graph.nodes.map(n => n.data.name);
    expect(names).toContain('coordinator');
    expect(names).toContain('researcher');
    expect(names).toContain('fetcher');
    expect(names).toContain('analyzer');
    expect(names).toContain('reporter');
  });

  it('generates spawn edges from coordinator', () => {
    const result = balToVisual(FIVE_AGENT_HUB_BAL);
    const spawnEdges = result.graph.edges.filter(e => e.type === 'spawn');
    // coordinator has spawn_baleybot → edges to all 4 others
    expect(spawnEdges).toHaveLength(4);
    expect(spawnEdges.every(e => e.source === 'coordinator')).toBe(true);
  });

  it('generates chain edges between sequential entities', () => {
    const result = balToVisual(FIVE_AGENT_HUB_BAL);
    const chainEdges = result.graph.edges.filter(e => e.type === 'chain');
    // chain { coordinator researcher fetcher analyzer reporter } = 4 chain edges
    expect(chainEdges).toHaveLength(4);
    expect(chainEdges[0]).toMatchObject({ source: 'coordinator', target: 'researcher' });
    expect(chainEdges[1]).toMatchObject({ source: 'researcher', target: 'fetcher' });
    expect(chainEdges[2]).toMatchObject({ source: 'fetcher', target: 'analyzer' });
    expect(chainEdges[3]).toMatchObject({ source: 'analyzer', target: 'reporter' });
  });

  it('limits shared_data edges with star pattern', () => {
    const result = balToVisual(FIVE_AGENT_HUB_BAL);
    const sharedEdges = result.graph.edges.filter(e => e.type === 'shared_data');
    // 5 nodes share store_memory → star pattern = 4 edges (not 10)
    // coordinator + analyzer share shared_storage → 1 edge (only 2 nodes)
    // Total: 4 + 1 = 5 (not 10 + 1 = 11)
    expect(sharedEdges.length).toBeLessThanOrEqual(5);
    // Verify store_memory star pattern uses first node (coordinator) as hub
    const storeMemoryEdges = sharedEdges.filter(e => e.label === 'store_memory');
    expect(storeMemoryEdges).toHaveLength(4);
    expect(storeMemoryEdges.every(e => e.source === 'coordinator')).toBe(true);
  });

  it('positions nodes without overlap', () => {
    const result = balToVisual(FIVE_AGENT_HUB_BAL);
    const positions = result.graph.nodes.map(n => n.position);

    for (let i = 0; i < positions.length; i++) {
      for (let j = i + 1; j < positions.length; j++) {
        const a = positions[i]!;
        const b = positions[j]!;
        const overlaps = Math.abs(a.x - b.x) < 280 && Math.abs(a.y - b.y) < 150;
        expect(overlaps, `Nodes ${i} and ${j} overlap at (${a.x},${a.y}) and (${b.x},${b.y})`).toBe(false);
      }
    }
  });

  it('all nodes have valid finite positions', () => {
    const result = balToVisual(FIVE_AGENT_HUB_BAL);
    for (const node of result.graph.nodes) {
      expect(typeof node.position.x).toBe('number');
      expect(typeof node.position.y).toBe('number');
      expect(Number.isFinite(node.position.x)).toBe(true);
      expect(Number.isFinite(node.position.y)).toBe(true);
    }
  });

  it('preserves entity tools correctly', () => {
    const result = balToVisual(FIVE_AGENT_HUB_BAL);
    const coordinator = result.graph.nodes.find(n => n.id === 'coordinator');
    expect(coordinator?.data.tools).toEqual(['spawn_baleybot', 'store_memory']);
    const analyzer = result.graph.nodes.find(n => n.id === 'analyzer');
    expect(analyzer?.data.tools).toEqual(['store_memory', 'shared_storage']);
  });

  it('preserves entity models correctly', () => {
    const result = balToVisual(FIVE_AGENT_HUB_BAL);
    const coordinator = result.graph.nodes.find(n => n.id === 'coordinator');
    expect(coordinator?.data.model).toBe('anthropic:claude-sonnet-4-20250514');
    const researcher = result.graph.nodes.find(n => n.id === 'researcher');
    expect(researcher?.data.model).toBe('openai:gpt-4o-mini');
  });
});

describe('edge cases', () => {
  it('handles single entity with tools', () => {
    const result = balToVisual(`
      solo { "goal": "Stand alone", "tools": { "web_search" } }
    `);
    expect(result.graph.nodes).toHaveLength(1);
    expect(result.graph.edges).toHaveLength(0);
  });

  it('handles 2-entity chain', () => {
    const result = balToVisual(`
      a { "goal": "First" }
      b { "goal": "Second" }
      chain { a b }
    `);
    expect(result.graph.nodes).toHaveLength(2);
    const chainEdges = result.graph.edges.filter(e => e.type === 'chain');
    expect(chainEdges).toHaveLength(1);
    expect(chainEdges[0]).toMatchObject({ source: 'a', target: 'b' });
  });

  it('handles entities with no tools', () => {
    const result = balToVisual(`
      a { "goal": "Branch A" }
      b { "goal": "Branch B" }
      c { "goal": "Branch C" }
    `);
    expect(result.graph.nodes).toHaveLength(3);
    // No tools → no spawn, shared_data, or trigger edges
    const nonChainEdges = result.graph.edges.filter(e => e.type !== 'chain');
    expect(nonChainEdges).toHaveLength(0);
  });

  it('handles exactly 2 nodes sharing store_memory (no star pattern)', () => {
    const result = balToVisual(`
      a { "goal": "First", "tools": { "store_memory" } }
      b { "goal": "Second", "tools": { "store_memory" } }
    `);
    const sharedEdges = result.graph.edges.filter(e => e.type === 'shared_data');
    expect(sharedEdges).toHaveLength(1);
    expect(sharedEdges[0]).toMatchObject({ source: 'a', target: 'b' });
  });

  it('returns errors for invalid BAL', () => {
    const result = balToVisual('this is not valid BAL {{{ }}}');
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.graph.nodes).toHaveLength(0);
  });
});
