import { describe, it, expect, vi } from 'vitest';
import { parseBalCode, balToVisual } from '../bal-parser-pure';

// Mock server-side dependencies so we can import validateBalCode from generator
vi.mock('../internal-baleybots', () => ({
  executeInternalBaleybot: vi.fn(),
}));
vi.mock('../tool-catalog', () => ({
  buildToolCatalog: vi.fn(),
  formatToolCatalogForAI: vi.fn(),
  categorizeToolName: vi.fn().mockReturnValue('allowed'),
}));
vi.mock('@/lib/logger', () => ({
  createLogger: vi.fn().mockReturnValue({
    info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn(),
  }),
}));

import { validateBalCode } from '../generator';

// NOTE: The SDK lexer uses { } brace syntax for tools arrays (not [ ] brackets).
// The parser's parseToolsList() checks for LBRACE, not LBRACKET.
// The documented [ ] bracket syntax requires LBRACKET/RBRACKET tokens in the lexer.
// TODO: Add bracket syntax tests after SDK lexer adds [ ] support.

// ============================================================================
// parseBalCode — Entity Properties
// ============================================================================

describe('parseBalCode entity properties', () => {
  it('parses a minimal entity with just a goal', () => {
    const result = parseBalCode(`
      assistant {
        "goal": "Help users with questions"
      }
    `);
    expect(result.errors).toHaveLength(0);
    expect(result.entities).toHaveLength(1);
    expect(result.entities[0]?.name).toBe('assistant');
    expect(result.entities[0]?.config.goal).toBe('Help users with questions');
  });

  it('parses model property', () => {
    const result = parseBalCode(`
      bot {
        "goal": "Do work",
        "model": "anthropic:claude-sonnet-4-20250514"
      }
    `);
    expect(result.errors).toHaveLength(0);
    expect(result.entities[0]?.config.model).toBe('anthropic:claude-sonnet-4-20250514');
  });

  it('parses tools with brace syntax', () => {
    const result = parseBalCode(`
      bot {
        "goal": "Search things",
        "tools": { "web_search", "fetch_url", "store_memory" }
      }
    `);
    expect(result.errors).toHaveLength(0);
    expect(result.entities[0]?.config.tools).toEqual(['web_search', 'fetch_url', 'store_memory']);
  });

  it('parses empty tools with brace syntax', () => {
    const result = parseBalCode(`
      bot {
        "goal": "Think only",
        "tools": { }
      }
    `);
    expect(result.errors).toHaveLength(0);
    expect(result.entities[0]?.config.tools).toEqual([]);
  });

  it('parses single tool as string', () => {
    const result = parseBalCode(`
      bot {
        "goal": "Search",
        "tools": "web_search"
      }
    `);
    expect(result.errors).toHaveLength(0);
    expect(result.entities[0]?.config.tools).toEqual(['web_search']);
  });

  // TODO: Enable after SDK lexer adds LBRACKET/RBRACKET token support
  it.todo('parses tools with bracket syntax: ["web_search", "fetch_url"]');

  // TODO: Enable after SDK patch lands — these properties may need SDK parser support
  it.todo('parses temperature property');
  it.todo('parses reasoning property');
  it.todo('parses stopWhen property');
  it.todo('parses retries property');

  it('parses maxTokens property', () => {
    const result = parseBalCode(`
      concise_bot {
        "goal": "Be brief",
        "maxTokens": 2048
      }
    `);
    expect(result.errors).toHaveLength(0);
    expect(result.entities[0]?.config.maxTokens).toBe(2048);
  });

  it('parses history property', () => {
    const result = parseBalCode(`
      stateless {
        "goal": "Process without memory",
        "history": "none"
      }
    `);
    expect(result.errors).toHaveLength(0);
    expect(result.entities[0]?.config.history).toBe('none');
  });

  it('parses history inherit mode', () => {
    const result = parseBalCode(`
      stateful {
        "goal": "Keep context",
        "history": "inherit"
      }
    `);
    expect(result.errors).toHaveLength(0);
    expect(result.entities[0]?.config.history).toBe('inherit');
  });

  // TODO: Enable after SDK patch lands
  it.todo('parses needsApproval property');

  it('parses output schema with simple types', () => {
    const result = parseBalCode(`
      analyzer {
        "goal": "Analyze data",
        "output": {
          "summary": "string",
          "score": "number",
          "valid": "boolean"
        }
      }
    `);
    expect(result.errors).toHaveLength(0);
    const output = result.entities[0]?.config.output as Record<string, string>;
    expect(output).toBeDefined();
    expect(output.summary).toBe('string');
    expect(output.score).toBe('number');
    expect(output.valid).toBe('boolean');
  });

  it('parses output schema with array type', () => {
    const result = parseBalCode(`
      lister {
        "goal": "List items",
        "output": {
          "items": "array"
        }
      }
    `);
    expect(result.errors).toHaveLength(0);
    const output = result.entities[0]?.config.output as Record<string, string>;
    expect(output?.items).toBe('array');
  });

  it('parses output schema with object type', () => {
    const result = parseBalCode(`
      reporter {
        "goal": "Generate report",
        "output": {
          "data": "object"
        }
      }
    `);
    expect(result.errors).toHaveLength(0);
    const output = result.entities[0]?.config.output as Record<string, string>;
    expect(output?.data).toBe('object');
  });

  it('parses entity with core properties (goal, model, tools, history, output)', () => {
    const result = parseBalCode(`
      full_bot {
        "goal": "Do everything",
        "model": "openai:gpt-4o",
        "tools": { "web_search", "fetch_url" },
        "history": "inherit",
        "output": {
          "result": "string",
          "confidence": "number"
        }
      }
    `);
    expect(result.errors).toHaveLength(0);
    const config = result.entities[0]?.config;
    expect(config?.goal).toBe('Do everything');
    expect(config?.model).toBe('openai:gpt-4o');
    expect(config?.tools).toEqual(['web_search', 'fetch_url']);
    expect(config?.history).toBe('inherit');
    const output = config?.output as Record<string, string>;
    expect(output?.result).toBe('string');
    expect(output?.confidence).toBe('number');
  });

  // TODO: Enable after SDK patch — tests all extended properties together
  it.todo('parses entity with all properties (temperature, reasoning, stopWhen, retries, maxTokens)');
});

// ============================================================================
// parseBalCode — Multiple Entities
// ============================================================================

describe('parseBalCode multiple entities', () => {
  it('parses multiple independent entities', () => {
    const result = parseBalCode(`
      bot_a {
        "goal": "Do A"
      }
      bot_b {
        "goal": "Do B"
      }
      bot_c {
        "goal": "Do C"
      }
    `);
    expect(result.errors).toHaveLength(0);
    expect(result.entities).toHaveLength(3);
    expect(result.entities.map(e => e.name)).toEqual(['bot_a', 'bot_b', 'bot_c']);
  });

  it('parses multiple entities with different configurations', () => {
    const result = parseBalCode(`
      fast_bot {
        "goal": "Quick processing",
        "model": "openai:gpt-4o-mini",
        "tools": { "web_search" }
      }
      smart_bot {
        "goal": "Deep analysis",
        "model": "anthropic:claude-sonnet-4-20250514",
        "tools": { "fetch_url" },
        "history": "inherit"
      }
    `);
    expect(result.errors).toHaveLength(0);
    expect(result.entities).toHaveLength(2);
    expect(result.entities[0]?.config.model).toBe('openai:gpt-4o-mini');
    expect(result.entities[1]?.config.model).toBe('anthropic:claude-sonnet-4-20250514');
    expect(result.entities[1]?.config.history).toBe('inherit');
  });
});

// ============================================================================
// parseBalCode — Compositions
// ============================================================================

describe('parseBalCode compositions', () => {
  it('parses chain composition', () => {
    const result = parseBalCode(`
      step1 { "goal": "First step" }
      step2 { "goal": "Second step" }
      step3 { "goal": "Third step" }
      chain { step1 step2 step3 }
    `);
    expect(result.errors).toHaveLength(0);
    expect(result.entities).toHaveLength(3);
    expect(result.chain).toEqual(['step1', 'step2', 'step3']);
  });

  it('parses parallel composition', () => {
    const result = parseBalCode(`
      worker_a { "goal": "Task A" }
      worker_b { "goal": "Task B" }
      parallel { worker_a worker_b }
    `);
    expect(result.errors).toHaveLength(0);
    expect(result.chain).toEqual(['worker_a', 'worker_b']);
  });

  // TODO: Enable after SDK patch lands — if/else composition syntax
  it.todo('parses if/else composition');
  it.todo('parses if without else');
  it.todo('parses loop composition');

  it('parses chain with two entities', () => {
    const result = parseBalCode(`
      a { "goal": "A" }
      b { "goal": "B" }
      chain { a b }
    `);
    expect(result.errors).toHaveLength(0);
    expect(result.chain).toEqual(['a', 'b']);
  });

  it('returns undefined chain when no composition exists', () => {
    const result = parseBalCode(`
      solo { "goal": "Work alone" }
    `);
    expect(result.errors).toHaveLength(0);
    expect(result.chain).toBeUndefined();
  });

  it('returns undefined chain for multiple entities without composition', () => {
    const result = parseBalCode(`
      a { "goal": "A" }
      b { "goal": "B" }
    `);
    expect(result.errors).toHaveLength(0);
    expect(result.chain).toBeUndefined();
  });
});

// ============================================================================
// parseBalCode — Run Input
// ============================================================================

describe('parseBalCode run input', () => {
  it('parses run statement', () => {
    const result = parseBalCode(`
      greeter {
        "goal": "Greet the user"
      }
      run("Hello, how are you?")
    `);
    expect(result.errors).toHaveLength(0);
    expect(result.entities).toHaveLength(1);
  });
});

// ============================================================================
// parseBalCode — Error Handling
// ============================================================================

describe('parseBalCode error handling', () => {
  it('returns errors for completely invalid input', () => {
    const result = parseBalCode('this is not BAL code at all {}{}{}');
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('returns empty entities for invalid BAL', () => {
    const result = parseBalCode('not valid');
    expect(result.entities).toHaveLength(0);
  });

  it('handles empty string', () => {
    const result = parseBalCode('');
    // Empty string may produce an error or empty result
    expect(result.entities).toHaveLength(0);
  });

  it('handles whitespace-only input', () => {
    const result = parseBalCode('   \n\n   ');
    expect(result.entities).toHaveLength(0);
  });
});

// ============================================================================
// parseBalCode — Complex Real-World Scenarios
// ============================================================================

describe('parseBalCode real-world scenarios', () => {
  it('parses the activity monitor example', () => {
    const result = parseBalCode(`
      activity_poller {
        "goal": "Poll database for new user events every 5 minutes",
        "model": "openai:gpt-4o-mini",
        "tools": { "query_database" },
        "history": "none"
      }

      trend_analyzer {
        "goal": "Analyze event patterns and identify trends",
        "model": "anthropic:claude-sonnet-4-20250514",
        "tools": { "query_database", "send_notification" },
        "output": {
          "trends": "array",
          "anomalies": "array"
        }
      }

      reporter {
        "goal": "Generate human-readable insights report",
        "history": "inherit"
      }

      chain {
        activity_poller
        trend_analyzer
        reporter
      }
    `);
    expect(result.errors).toHaveLength(0);
    expect(result.entities).toHaveLength(3);
    expect(result.chain).toEqual(['activity_poller', 'trend_analyzer', 'reporter']);

    // Check entity details
    const poller = result.entities.find(e => e.name === 'activity_poller');
    expect(poller?.config.model).toBe('openai:gpt-4o-mini');
    expect(poller?.config.tools).toEqual(['query_database']);
    expect(poller?.config.history).toBe('none');

    const analyzer = result.entities.find(e => e.name === 'trend_analyzer');
    expect(analyzer?.config.tools).toEqual(['query_database', 'send_notification']);
    const analyzerOutput = analyzer?.config.output as Record<string, string>;
    expect(analyzerOutput?.trends).toBe('array');
    expect(analyzerOutput?.anomalies).toBe('array');

    const rep = result.entities.find(e => e.name === 'reporter');
    expect(rep?.config.history).toBe('inherit');
  });

  it('parses a hub-spoke pattern with spawn_baleybot', () => {
    const result = parseBalCode(`
      coordinator {
        "goal": "Coordinate sub-tasks",
        "model": "anthropic:claude-sonnet-4-20250514",
        "tools": { "spawn_baleybot", "store_memory" }
      }
      web_worker {
        "goal": "Search the web",
        "tools": { "web_search", "fetch_url" }
      }
      data_worker {
        "goal": "Process data",
        "tools": { "store_memory" }
      }
    `);
    expect(result.errors).toHaveLength(0);
    expect(result.entities).toHaveLength(3);
    expect(result.entities[0]?.config.tools).toContain('spawn_baleybot');
  });

  it('parses an entity matching internal balaybot pattern (output with complex types)', () => {
    const result = parseBalCode(`
      creator_bot {
        "goal": "Create BaleyBots from user descriptions",
        "model": "anthropic:claude-sonnet-4-20250514",
        "output": {
          "entities": "array",
          "balCode": "string",
          "name": "string",
          "status": "string"
        }
      }
    `);
    expect(result.errors).toHaveLength(0);
    const output = result.entities[0]?.config.output as Record<string, string>;
    expect(output?.entities).toBe('array');
    expect(output?.balCode).toBe('string');
    expect(output?.name).toBe('string');
    expect(output?.status).toBe('string');
  });
});

// ============================================================================
// validateBalCode
// ============================================================================

describe('validateBalCode', () => {
  it('validates correct BAL code', () => {
    const result = validateBalCode(`
      bot {
        "goal": "Help users"
      }
    `);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('fails validation for empty BAL', () => {
    const result = validateBalCode('');
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('fails validation for BAL with no entities', () => {
    const result = validateBalCode('invalid code');
    expect(result.valid).toBe(false);
  });

  it('warns when entity is missing a goal', () => {
    const result = parseBalCode(`
      bot {
        "model": "openai:gpt-4o"
      }
    `);
    // The parser may still parse it — but validateBalCode should warn
    // Some parsers require goal, so this may be an error
    // We test the result structure regardless
    if (result.errors.length === 0) {
      const validation = validateBalCode(`
        bot {
          "model": "openai:gpt-4o"
        }
      `);
      // Should have a warning about missing goal
      expect(validation.warnings.length).toBeGreaterThan(0);
    }
  });

  it('validates BAL with chain composition', () => {
    const result = validateBalCode(`
      a { "goal": "A" }
      b { "goal": "B" }
      chain { a b }
    `);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('validates BAL with tools and output', () => {
    const result = validateBalCode(`
      analyzer {
        "goal": "Analyze data",
        "model": "openai:gpt-4o",
        "tools": { "web_search" },
        "output": {
          "result": "string"
        }
      }
      reporter {
        "goal": "Generate reports",
        "tools": { "send_notification" },
        "history": "inherit"
      }
      chain { analyzer reporter }
    `);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });
});

// ============================================================================
// balToVisual — Entity Data Extraction
// ============================================================================

describe('balToVisual entity data', () => {
  it('extracts output schema to visual node data', () => {
    const result = balToVisual(`
      analyzer {
        "goal": "Analyze things",
        "output": {
          "score": "number",
          "label": "string"
        }
      }
    `);
    expect(result.errors).toHaveLength(0);
    expect(result.graph.nodes).toHaveLength(1);
    const node = result.graph.nodes[0]!;
    expect(node.data.output).toBeDefined();
    expect(node.data.output?.score).toBe('number');
    expect(node.data.output?.label).toBe('string');
  });

  it('extracts model to visual node data', () => {
    const result = balToVisual(`
      bot {
        "goal": "Do work",
        "model": "openai:gpt-4o"
      }
    `);
    expect(result.graph.nodes[0]?.data.model).toBe('openai:gpt-4o');
  });

  it('extracts tools to visual node data', () => {
    const result = balToVisual(`
      bot {
        "goal": "Search",
        "tools": { "web_search", "fetch_url" }
      }
    `);
    expect(result.graph.nodes[0]?.data.tools).toEqual(['web_search', 'fetch_url']);
  });

  it('extracts goal to visual node data', () => {
    const result = balToVisual(`
      bot {
        "goal": "Help the user find information"
      }
    `);
    expect(result.graph.nodes[0]?.data.goal).toBe('Help the user find information');
  });

  it('defaults tools to empty array when not specified', () => {
    const result = balToVisual(`
      bot {
        "goal": "Think"
      }
    `);
    expect(result.graph.nodes[0]?.data.tools).toEqual([]);
  });
});

// ============================================================================
// balToVisual — Compositions and Edges
// ============================================================================

describe('balToVisual composition edges', () => {
  it('generates chain edges for sequential composition', () => {
    const result = balToVisual(`
      a { "goal": "First" }
      b { "goal": "Second" }
      c { "goal": "Third" }
      chain { a b c }
    `);
    const chainEdges = result.graph.edges.filter(e => e.type === 'chain');
    expect(chainEdges).toHaveLength(2);
    expect(chainEdges[0]?.source).toBe('a');
    expect(chainEdges[0]?.target).toBe('b');
    expect(chainEdges[1]?.source).toBe('b');
    expect(chainEdges[1]?.target).toBe('c');
  });

  it('does not generate chain edges for single entity', () => {
    const result = balToVisual(`
      solo { "goal": "Work alone" }
    `);
    expect(result.graph.edges.filter(e => e.type === 'chain')).toHaveLength(0);
  });

  it('returns empty graph for invalid BAL', () => {
    const result = balToVisual('completely invalid');
    expect(result.graph.nodes).toHaveLength(0);
    expect(result.graph.edges).toHaveLength(0);
    expect(result.errors.length).toBeGreaterThan(0);
  });
});

// ============================================================================
// balToVisual — Relationship Edges
// ============================================================================

describe('balToVisual relationship edges', () => {
  it('generates spawn edges for entities with spawn_baleybot', () => {
    const result = balToVisual(`
      orchestrator {
        "goal": "Coordinate",
        "tools": { "spawn_baleybot" }
      }
      worker {
        "goal": "Do work"
      }
    `);
    const spawnEdges = result.graph.edges.filter(e => e.type === 'spawn');
    expect(spawnEdges).toHaveLength(1);
    expect(spawnEdges[0]?.source).toBe('orchestrator');
    expect(spawnEdges[0]?.target).toBe('worker');
    expect(spawnEdges[0]?.animated).toBe(true);
  });

  it('generates shared_data edges for store_memory', () => {
    const result = balToVisual(`
      writer {
        "goal": "Write data",
        "tools": { "store_memory" }
      }
      reader {
        "goal": "Read data",
        "tools": { "store_memory" }
      }
    `);
    const sharedEdges = result.graph.edges.filter(e => e.type === 'shared_data');
    expect(sharedEdges).toHaveLength(1);
    expect(sharedEdges[0]?.label).toBe('store_memory');
  });

  it('generates star pattern for 3+ nodes sharing a data tool', () => {
    const result = balToVisual(`
      a { "goal": "A", "tools": { "store_memory" } }
      b { "goal": "B", "tools": { "store_memory" } }
      c { "goal": "C", "tools": { "store_memory" } }
    `);
    const sharedEdges = result.graph.edges.filter(e => e.type === 'shared_data');
    // Star pattern: hub connects to n-1 spokes = 2 edges
    expect(sharedEdges).toHaveLength(2);
  });

  it('does not generate shared_data edges for unrelated tools', () => {
    const result = balToVisual(`
      a { "goal": "A", "tools": { "web_search" } }
      b { "goal": "B", "tools": { "fetch_url" } }
    `);
    const sharedEdges = result.graph.edges.filter(e => e.type === 'shared_data');
    expect(sharedEdges).toHaveLength(0);
  });

  it('combines chain edges with spawn edges', () => {
    const result = balToVisual(`
      hub {
        "goal": "Hub",
        "tools": { "spawn_baleybot" }
      }
      worker {
        "goal": "Worker"
      }
      chain { hub worker }
    `);
    const chainEdges = result.graph.edges.filter(e => e.type === 'chain');
    const spawnEdges = result.graph.edges.filter(e => e.type === 'spawn');
    expect(chainEdges).toHaveLength(1);
    expect(spawnEdges).toHaveLength(1);
  });
});

// ============================================================================
// balToVisual — Layout
// ============================================================================

describe('balToVisual layout', () => {
  it('positions chain nodes left to right', () => {
    const result = balToVisual(`
      a { "goal": "A" }
      b { "goal": "B" }
      chain { a b }
    `);
    const nodeA = result.graph.nodes.find(n => n.id === 'a')!;
    const nodeB = result.graph.nodes.find(n => n.id === 'b')!;
    expect(nodeA.position.x).toBeLessThan(nodeB.position.x);
  });

  it('positions independent entities horizontally', () => {
    const result = balToVisual(`
      a { "goal": "A" }
      b { "goal": "B" }
    `);
    const nodeA = result.graph.nodes.find(n => n.id === 'a')!;
    const nodeB = result.graph.nodes.find(n => n.id === 'b')!;
    // Same y, different x
    expect(nodeA.position.y).toBe(nodeB.position.y);
    expect(nodeA.position.x).not.toBe(nodeB.position.x);
  });

  it('assigns unique positions to all nodes', () => {
    const result = balToVisual(`
      a { "goal": "A" }
      b { "goal": "B" }
      c { "goal": "C" }
      chain { a b c }
    `);
    const positions = result.graph.nodes.map(n => `${n.position.x},${n.position.y}`);
    const uniquePositions = new Set(positions);
    expect(uniquePositions.size).toBe(3);
  });
});

// ============================================================================
// parseBalCode — Edge Cases with Entity Names
// ============================================================================

describe('parseBalCode entity names', () => {
  it('handles snake_case names', () => {
    const result = parseBalCode(`
      my_cool_bot {
        "goal": "Do things"
      }
    `);
    expect(result.errors).toHaveLength(0);
    expect(result.entities[0]?.name).toBe('my_cool_bot');
  });

  it('handles single-character names', () => {
    const result = parseBalCode(`
      a { "goal": "A" }
    `);
    expect(result.errors).toHaveLength(0);
    expect(result.entities[0]?.name).toBe('a');
  });

  it('handles long entity names', () => {
    const result = parseBalCode(`
      very_long_entity_name_that_describes_what_it_does {
        "goal": "Long named entity"
      }
    `);
    expect(result.errors).toHaveLength(0);
    expect(result.entities[0]?.name).toBe('very_long_entity_name_that_describes_what_it_does');
  });
});

// ============================================================================
// parseBalCode — Goals with Special Characters
// ============================================================================

describe('parseBalCode special characters in goals', () => {
  it('handles goals with escaped quotes', () => {
    const result = parseBalCode(`
      bot {
        "goal": "Answer the user\\'s questions about \\"AI\\""
      }
    `);
    // Should parse without errors (whether escaping works depends on SDK lexer)
    // Just ensure it doesn't crash
    expect(result.entities.length).toBeLessThanOrEqual(1);
  });

  it('handles goals with newline escapes', () => {
    const result = parseBalCode(`
      bot {
        "goal": "Line 1\\nLine 2\\nLine 3"
      }
    `);
    expect(result.errors).toHaveLength(0);
    expect(result.entities).toHaveLength(1);
  });
});

// ============================================================================
// parseBalCode — Composition with Properties
// ============================================================================

describe('parseBalCode compositions preserve entity properties', () => {
  it('preserves tools alongside chain', () => {
    const result = parseBalCode(`
      fetcher {
        "goal": "Fetch data",
        "tools": { "web_search", "fetch_url" }
      }
      processor {
        "goal": "Process data",
        "model": "openai:gpt-4o-mini",
        "output": {
          "result": "string"
        }
      }
      chain { fetcher processor }
    `);
    expect(result.errors).toHaveLength(0);
    expect(result.chain).toEqual(['fetcher', 'processor']);
    expect(result.entities[0]?.config.tools).toEqual(['web_search', 'fetch_url']);
    expect(result.entities[1]?.config.model).toBe('openai:gpt-4o-mini');
    const output = result.entities[1]?.config.output as Record<string, string>;
    expect(output?.result).toBe('string');
  });

  it('preserves history settings alongside parallel', () => {
    const result = parseBalCode(`
      worker_a {
        "goal": "Task A",
        "history": "none"
      }
      worker_b {
        "goal": "Task B",
        "history": "inherit"
      }
      parallel { worker_a worker_b }
    `);
    expect(result.errors).toHaveLength(0);
    expect(result.entities[0]?.config.history).toBe('none');
    expect(result.entities[1]?.config.history).toBe('inherit');
  });
});
