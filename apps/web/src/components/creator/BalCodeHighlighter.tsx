'use client';

import { cn } from '@/lib/utils';

interface BalCodeHighlighterProps {
  code: string;
  className?: string;
  showLineNumbers?: boolean;
}

/**
 * Token types for BAL syntax highlighting
 */
type TokenType =
  | 'keyword'
  | 'decorator'
  | 'string'
  | 'comment'
  | 'operator'
  | 'identifier'
  | 'plain';

interface Token {
  type: TokenType;
  value: string;
}

/**
 * BAL keywords
 */
const BAL_KEYWORDS = new Set([
  'flow',
  'tool',
  'agent',
  'pipeline',
  'input',
  'output',
  'returns',
  'use',
  'with',
  'as',
  'from',
  'import',
  'export',
  'config',
  'if',
  'else',
  'then',
  'spawn',
]);

/**
 * Tokenize BAL code
 */
function tokenize(code: string): Token[] {
  const tokens: Token[] = [];
  let remaining = code;

  while (remaining.length > 0) {
    // Match comment (// or #)
    const commentMatch = remaining.match(/^(\/\/.*|#.*)/);
    if (commentMatch) {
      tokens.push({ type: 'comment', value: commentMatch[0] });
      remaining = remaining.slice(commentMatch[0].length);
      continue;
    }

    // Match decorator (@something)
    const decoratorMatch = remaining.match(/^@[a-zA-Z_][a-zA-Z0-9_]*/);
    if (decoratorMatch) {
      tokens.push({ type: 'decorator', value: decoratorMatch[0] });
      remaining = remaining.slice(decoratorMatch[0].length);
      continue;
    }

    // Match string (single or double quotes, with escape handling)
    const stringMatch = remaining.match(/^("[^"\\]*(?:\\.[^"\\]*)*"|'[^'\\]*(?:\\.[^'\\]*)*')/);
    if (stringMatch) {
      tokens.push({ type: 'string', value: stringMatch[0] });
      remaining = remaining.slice(stringMatch[0].length);
      continue;
    }

    // Match template string
    const templateMatch = remaining.match(/^`[^`]*`/);
    if (templateMatch) {
      tokens.push({ type: 'string', value: templateMatch[0] });
      remaining = remaining.slice(templateMatch[0].length);
      continue;
    }

    // Match operators
    const operatorMatch = remaining.match(/^(->|=>|::|[{}()[\]:,=|])/);
    if (operatorMatch) {
      tokens.push({ type: 'operator', value: operatorMatch[0] });
      remaining = remaining.slice(operatorMatch[0].length);
      continue;
    }

    // Match identifier or keyword
    const identMatch = remaining.match(/^[a-zA-Z_][a-zA-Z0-9_]*/);
    if (identMatch) {
      const word = identMatch[0];
      const type: TokenType = BAL_KEYWORDS.has(word.toLowerCase()) ? 'keyword' : 'identifier';
      tokens.push({ type, value: word });
      remaining = remaining.slice(word.length);
      continue;
    }

    // Match whitespace and other characters
    const plainMatch = remaining.match(/^(\s+|[^\s]+?(?=[@"'`a-zA-Z_{}()[\]:,=|/]|->|=>|::|\s|$))/);
    if (plainMatch) {
      tokens.push({ type: 'plain', value: plainMatch[0] });
      remaining = remaining.slice(plainMatch[0].length);
      continue;
    }

    // Fallback: take one character (guaranteed non-empty by while condition)
    tokens.push({ type: 'plain', value: remaining[0]! });
    remaining = remaining.slice(1);
  }

  return tokens;
}

/**
 * Get CSS class for token type
 */
function getTokenClass(type: TokenType): string {
  switch (type) {
    case 'keyword':
      return 'text-purple-500 dark:text-purple-400 font-medium';
    case 'decorator':
      return 'text-amber-500 dark:text-amber-400';
    case 'string':
      return 'text-green-600 dark:text-green-400';
    case 'comment':
      return 'text-muted-foreground italic';
    case 'operator':
      return 'text-sky-500 dark:text-sky-400';
    case 'identifier':
      return 'text-foreground';
    default:
      return '';
  }
}

/**
 * BAL Code Highlighter Component
 *
 * Provides syntax highlighting for BAL code with optional line numbers.
 * Uses a lightweight custom tokenizer instead of heavy external libraries.
 */
export function BalCodeHighlighter({
  code,
  className,
  showLineNumbers = true,
}: BalCodeHighlighterProps) {
  if (!code) {
    return (
      <pre className={cn('text-sm font-mono', className)}>
        <code className="text-muted-foreground">{'// No BAL code generated yet'}</code>
      </pre>
    );
  }

  const lines = code.split('\n');

  return (
    <pre
      className={cn(
        'text-sm font-mono overflow-x-auto',
        showLineNumbers && 'grid',
        className
      )}
      style={
        showLineNumbers
          ? {
              gridTemplateColumns: `${Math.max(2, String(lines.length).length)}ch 1fr`,
              gap: '0 1rem',
            }
          : undefined
      }
    >
      {lines.map((line, lineIndex) => {
        const tokens = tokenize(line);

        return (
          <div key={lineIndex} className="contents">
            {showLineNumbers && (
              <span className="text-muted-foreground/50 select-none text-right">
                {lineIndex + 1}
              </span>
            )}
            <code className="whitespace-pre-wrap break-words">
              {tokens.length > 0 ? (
                tokens.map((token, tokenIndex) => (
                  <span key={tokenIndex} className={getTokenClass(token.type)}>
                    {token.value}
                  </span>
                ))
              ) : (
                '\n'
              )}
            </code>
          </div>
        );
      })}
    </pre>
  );
}

export default BalCodeHighlighter;
