/**
 * BAL to visual graph compatibility wrapper.
 *
 * The V2 editor uses canonical graph primitives directly. This module keeps
 * legacy call-sites (server actions/tests) stable by delegating to the
 * parser-side compatibility converter.
 */

import {
  parseBalCode,
  balToVisualFromParsed as balToVisualFromParsedPure,
  type BalToVisualResult as PureBalToVisualResult,
  type ParseResult,
} from '../bal-parser-pure';
import type { ParsedEntities, VisualGraph } from './types';

export type { VisualNode, VisualEdge, VisualGraph } from './types';

/**
 * Result of converting BAL code to a visual graph.
 */
export interface BalToVisualResult {
  graph: VisualGraph;
  errors: string[];
}

/**
 * Convert BAL code to a visual graph representation.
 */
export function balToVisual(balCode: string): BalToVisualResult {
  return balToVisualFromParsed(balCode, parseBalCode(balCode));
}

/**
 * Convert BAL code to a visual graph using pre-parsed entities.
 */
export function balToVisualFromParsed(
  balCode: string,
  parsed: ParsedEntities
): BalToVisualResult {
  const result: PureBalToVisualResult = balToVisualFromParsedPure(
    balCode,
    parsed as ParseResult
  );

  return {
    graph: result.graph as VisualGraph,
    errors: result.errors,
  };
}
