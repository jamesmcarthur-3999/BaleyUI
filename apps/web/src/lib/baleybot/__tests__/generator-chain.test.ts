import { describe, it, expect } from 'vitest';
import { parseBalCode } from '../bal-parser-pure';

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

  it('extracts 3-entity chain', () => {
    const result = parseBalCode(`
      a { "goal": "A" }
      b { "goal": "B" }
      c { "goal": "C" }
      chain { a b c }
    `);
    expect(result.chain).toEqual(['a', 'b', 'c']);
  });

  it('preserves entity configs alongside chain', () => {
    const result = parseBalCode(`
      analyzer {
        "goal": "Analyze",
        "model": "anthropic:claude-sonnet-4-20250514",
        "tools": ["web_search"]
      }
      reporter {
        "goal": "Report"
      }
      chain { analyzer reporter }
    `);
    expect(result.entities).toHaveLength(2);
    expect(result.chain).toEqual(['analyzer', 'reporter']);
    expect(result.entities[0]?.config.tools).toEqual(['web_search']);
  });
});
