'use server';

import { tokenize, parse } from '@baleybots/tools';

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
 * Server action to parse BAL code
 *
 * This runs on the server because @baleybots/tools has dependencies
 * that require Node.js (fs, net, etc.) through the @baleybots/core chain.
 */
export async function parseBalCode(code: string): Promise<ParseResult> {
  try {
    const tokens = tokenize(code);
    const ast = parse(tokens, code);

    return {
      success: true,
      entityCount: ast.entities.size,
      hasComposition: ast.root !== null,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // Try to extract line number from error message
    const lineMatch = message.match(/line (\d+)/i);
    const errorLine = lineMatch?.[1] ? parseInt(lineMatch[1], 10) : undefined;

    return {
      success: false,
      error: message,
      errorLine,
    };
  }
}
