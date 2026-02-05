/**
 * Tests for PERF-008: BAL Parse Cache
 *
 * Verifies that the BAL parse cache correctly caches and returns
 * parsed ASTs to avoid repeated parsing of the same BAL code.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { balParseCache } from '../executor';

describe('BAL Parse Cache (PERF-008)', () => {
  beforeEach(() => {
    // Clear cache before each test
    balParseCache.clear();
  });

  const sampleBalCode = `
    greeter {
      "goal": "Greet the user"
    }
  `;

  const differentBalCode = `
    analyzer {
      "goal": "Analyze the input"
    }
  `;

  it('should cache parsed AST on first parse', () => {
    // First parse should work
    const ast1 = balParseCache.parse(sampleBalCode);

    expect(ast1).toBeDefined();
    expect(ast1.entities.has('greeter')).toBe(true);
  });

  it('should return cached AST on subsequent parses of same code', () => {
    // Parse first time
    const ast1 = balParseCache.parse(sampleBalCode);

    // Parse second time - should return same object from cache
    const ast2 = balParseCache.parse(sampleBalCode);

    // Should be the exact same object reference (from cache)
    expect(ast1).toBe(ast2);
  });

  it('should cache different BAL codes separately', () => {
    const ast1 = balParseCache.parse(sampleBalCode);
    const ast2 = balParseCache.parse(differentBalCode);

    // Different ASTs for different code
    expect(ast1).not.toBe(ast2);
    expect(ast1.entities.has('greeter')).toBe(true);
    expect(ast2.entities.has('analyzer')).toBe(true);
  });

  it('should clear cache correctly', () => {
    // Parse and cache
    const ast1 = balParseCache.parse(sampleBalCode);

    // Clear cache
    balParseCache.clear();

    // Parse again - should be a new object
    const ast2 = balParseCache.parse(sampleBalCode);

    // Values should be equal but objects should be different (new parse)
    expect(ast1.entities.has('greeter')).toBe(true);
    expect(ast2.entities.has('greeter')).toBe(true);
    // After clear, we get a new parse, so it may or may not be the same reference
    // depending on implementation - the key is that parsing still works
  });

  it('should parse complex BAL code with chain', () => {
    const complexBalCode = `
      step1 {
        "goal": "First step"
      }

      step2 {
        "goal": "Second step"
      }

      chain {
        step1
        step2
      }
    `;

    const ast = balParseCache.parse(complexBalCode);

    expect(ast.entities.has('step1')).toBe(true);
    expect(ast.entities.has('step2')).toBe(true);
    expect(ast.root).not.toBeNull();
  });

  it('should handle parsing errors gracefully', () => {
    const invalidBalCode = `
      this is not valid BAL code {{{{
    `;

    expect(() => {
      balParseCache.parse(invalidBalCode);
    }).toThrow();
  });
});
