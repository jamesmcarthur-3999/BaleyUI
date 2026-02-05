'use server';

import { balToVisual } from '@/lib/baleybot/visual/bal-to-nodes';
import { parseBalCode } from '@/lib/baleybot/generator';
import type { VisualGraph, ParsedEntities } from '@/lib/baleybot/visual/types';

export async function parseBalToVisualGraph(balCode: string): Promise<VisualGraph> {
  return balToVisual(balCode);
}

export async function parseBalEntities(balCode: string): Promise<ParsedEntities> {
  return parseBalCode(balCode);
}
