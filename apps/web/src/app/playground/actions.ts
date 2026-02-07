'use server';

import { parseBalCode as parseBAL } from '@/lib/baleybot/bal-parser-pure';

/**
 * Parse result with error information
 */
export interface ParseResult {
  success: boolean;
  entityCount?: number;
  hasComposition?: boolean;
  error?: string;
  errorLine?: number;
}

/**
 * Server action to parse BAL code.
 * Uses the canonical parseBalCode from bal-parser-pure.
 */
export async function parseBalCode(code: string): Promise<ParseResult> {
  const { entities, chain, errors } = parseBAL(code);

  if (errors.length > 0) {
    const message = errors[0] || 'Unknown parse error';
    const lineMatch = message.match(/line (\d+)/i);
    const errorLine = lineMatch?.[1] ? parseInt(lineMatch[1], 10) : undefined;

    return {
      success: false,
      error: message,
      errorLine,
    };
  }

  return {
    success: true,
    entityCount: entities.length,
    hasComposition: chain !== undefined && chain.length > 1,
  };
}
