'use client';

import { useMemo } from 'react';
import { cn } from '@/lib/utils';

interface StreamingJSONProps {
  json: string;
  isStreaming: boolean;
  className?: string;
}

/**
 * Attempt to parse partial JSON by adding closing brackets/braces
 */
function parsePartialJSON(jsonStr: string): { parsed: unknown; isValid: boolean } {
  if (!jsonStr.trim()) {
    return { parsed: null, isValid: false };
  }

  // Try to parse as-is first
  try {
    const parsed = JSON.parse(jsonStr);
    return { parsed, isValid: true };
  } catch {
    // Not valid yet, try to fix it
  }

  // Count opening/closing brackets and braces
  let str = jsonStr.trim();
  const openBraces = (str.match(/\{/g) || []).length;
  const closeBraces = (str.match(/\}/g) || []).length;
  const openBrackets = (str.match(/\[/g) || []).length;
  const closeBrackets = (str.match(/\]/g) || []).length;

  // Add missing closing braces/brackets
  const missingBraces = openBraces - closeBraces;
  const missingBrackets = openBrackets - closeBrackets;

  // Check if we're in the middle of a string value
  const quoteCount = (str.match(/"/g) || []).length;
  const inString = quoteCount % 2 !== 0;

  if (inString) {
    str += '"';
  }

  str += '}'.repeat(Math.max(0, missingBraces));
  str += ']'.repeat(Math.max(0, missingBrackets));

  try {
    const parsed = JSON.parse(str);
    return { parsed, isValid: false }; // Valid after fixing
  } catch {
    return { parsed: null, isValid: false };
  }
}

/**
 * Syntax highlight JSON with simple color coding
 */
function highlightJSON(obj: unknown, indent = 0): React.ReactNode {
  const indentStr = '  '.repeat(indent);

  if (obj === null) {
    return <span className="text-purple-500">null</span>;
  }

  if (typeof obj === 'boolean') {
    return <span className="text-purple-500">{String(obj)}</span>;
  }

  if (typeof obj === 'number') {
    return <span className="text-blue-500">{obj}</span>;
  }

  if (typeof obj === 'string') {
    return <span className="text-green-500">&quot;{obj}&quot;</span>;
  }

  if (Array.isArray(obj)) {
    if (obj.length === 0) {
      return <>[]</>;
    }

    return (
      <>
        {'[\n'}
        {obj.map((item, i) => (
          <span key={i}>
            {indentStr}  {highlightJSON(item, indent + 1)}
            {i < obj.length - 1 ? ',' : ''}
            {'\n'}
          </span>
        ))}
        {indentStr}
        {']'}
      </>
    );
  }

  if (typeof obj === 'object') {
    const entries = Object.entries(obj);
    if (entries.length === 0) {
      return <>{'{}'}</>;
    }

    return (
      <>
        {'{\n'}
        {entries.map(([key, value], i) => (
          <span key={key}>
            {indentStr}  <span className="text-cyan-500">&quot;{key}&quot;</span>:{' '}
            {highlightJSON(value, indent + 1)}
            {i < entries.length - 1 ? ',' : ''}
            {'\n'}
          </span>
        ))}
        {indentStr}
        {'}'}
      </>
    );
  }

  return String(obj);
}

export function StreamingJSON({ json, isStreaming, className }: StreamingJSONProps) {
  const highlighted = useMemo(() => {
    const { parsed, isValid } = parsePartialJSON(json);

    if (!parsed) {
      return (
        <div className="text-muted-foreground italic">
          {json ? 'Parsing JSON...' : 'Waiting for data...'}
        </div>
      );
    }

    return (
      <div className={cn('relative', !isValid && 'opacity-70')}>
        {highlightJSON(parsed)}
        {isStreaming && (
          <span className="inline-block ml-1 w-0.5 h-4 bg-primary animate-pulse" />
        )}
      </div>
    );
  }, [json, isStreaming]);

  return (
    <div
      className={cn(
        'font-mono text-xs whitespace-pre-wrap break-all overflow-x-auto',
        className
      )}
    >
      {highlighted}
    </div>
  );
}
