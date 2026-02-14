/**
 * Strip large JSON blocks from text content.
 * Safety net for cases where the LLM echoes tool results as text.
 * Only strips balanced JSON objects >200 chars containing 2+ quoted keys.
 * Preserves JSON inside markdown code fences (e.g. ```json ... ```).
 */
export function stripLargeJsonBlocks(text: string): string {
  if (text.length < 200) return text;

  // Build a set of character positions that fall inside markdown code fences.
  // We skip any JSON block whose opening brace is inside a fenced region.
  const codeFenceRanges: Array<[number, number]> = [];
  const fenceRegex = /```[\s\S]*?```/g;
  let fenceMatch: RegExpExecArray | null;
  while ((fenceMatch = fenceRegex.exec(text)) !== null) {
    codeFenceRanges.push([fenceMatch.index, fenceMatch.index + fenceMatch[0].length]);
  }

  const isInCodeFence = (pos: number) =>
    codeFenceRanges.some(([s, e]) => pos >= s && pos < e);

  // Find outermost balanced { ... } blocks
  let result = text;
  let searchFrom = 0;

  while (searchFrom < result.length) {
    const start = result.indexOf('{', searchFrom);
    if (start === -1) break;

    // Skip braces inside markdown code fences
    if (isInCodeFence(start)) {
      searchFrom = start + 1;
      continue;
    }

    // Find matching closing brace
    let depth = 0;
    let end = -1;
    for (let i = start; i < result.length; i++) {
      if (result[i] === '{') depth++;
      if (result[i] === '}') {
        depth--;
        if (depth === 0) {
          end = i + 1;
          break;
        }
      }
    }

    if (end === -1) break; // Unclosed brace, stop

    const block = result.slice(start, end);
    if (block.length < 200) {
      searchFrom = end;
      continue;
    }

    // Check if it looks like structured output (2+ quoted keys)
    const keyMatches = block.match(/"[a-zA-Z_]+"\s*:/g);
    if (!keyMatches || keyMatches.length < 2) {
      searchFrom = end;
      continue;
    }

    // Verify it's valid JSON
    try {
      JSON.parse(block);
      // Valid JSON block >200 chars with multiple keys — strip it
      result = (result.slice(0, start) + result.slice(end)).trim();
      // Recompute code fence ranges since positions shifted
      codeFenceRanges.length = 0;
      const recompute = /```[\s\S]*?```/g;
      let m: RegExpExecArray | null;
      while ((m = recompute.exec(result)) !== null) {
        codeFenceRanges.push([m.index, m.index + m[0].length]);
      }
      // Don't advance searchFrom — the string shifted
    } catch {
      searchFrom = end;
    }
  }

  return result || text; // Never return empty
}
