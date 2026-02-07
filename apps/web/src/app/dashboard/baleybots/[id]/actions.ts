'use server';

import { balToVisual, balToVisualFromParsed, type BalToVisualResult } from '@/lib/baleybot/visual/bal-to-nodes';
import { parseBalCode } from '@/lib/baleybot/bal-parser-pure';
import type { ParsedEntities } from '@/lib/baleybot/visual/types';

export async function parseBalToVisualGraph(balCode: string): Promise<BalToVisualResult> {
  return balToVisual(balCode);
}

export async function parseBalEntities(balCode: string): Promise<ParsedEntities> {
  return parseBalCode(balCode);
}

export async function parseBalGraphAndEntities(balCode: string): Promise<{
  graphResult: BalToVisualResult;
  parsed: ParsedEntities;
}> {
  const parsed = parseBalCode(balCode);
  return {
    parsed,
    graphResult: balToVisualFromParsed(balCode, parsed),
  };
}
