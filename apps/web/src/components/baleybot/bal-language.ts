/**
 * BAL (Baleybots Assembly Language) Language Definition for Monaco Editor
 *
 * Provides syntax highlighting, bracket matching, and language configuration
 * for the BAL DSL.
 */

import type { Monaco } from '@monaco-editor/react';

// Extract types from Monaco namespace
type IMonarchLanguage = Parameters<Monaco['languages']['setMonarchTokensProvider']>[1];
type LanguageConfiguration = Parameters<Monaco['languages']['setLanguageConfiguration']>[1];
type ITokenThemeRule = Parameters<Monaco['editor']['defineTheme']>[1]['rules'][number];
type IMarkerData = Parameters<Monaco['editor']['setModelMarkers']>[2][number];
type ITextModel = Parameters<Parameters<Monaco['languages']['registerCompletionItemProvider']>[1]['provideCompletionItems']>[0];
type Position = Parameters<Parameters<Monaco['languages']['registerCompletionItemProvider']>[1]['provideCompletionItems']>[1];

/**
 * BAL language ID for Monaco registration
 */
export const BAL_LANGUAGE_ID = 'bal';

/**
 * BAL language configuration
 */
export const balLanguageConfig: LanguageConfiguration = {
  comments: {
    lineComment: '//',
  },
  brackets: [
    ['{', '}'],
    ['[', ']'],
    ['(', ')'],
    ['<', '>'],
  ],
  autoClosingPairs: [
    { open: '{', close: '}' },
    { open: '[', close: ']' },
    { open: '(', close: ')' },
    { open: '<', close: '>' },
    { open: '"', close: '"' },
    { open: "'", close: "'" },
  ],
  surroundingPairs: [
    { open: '{', close: '}' },
    { open: '[', close: ']' },
    { open: '(', close: ')' },
    { open: '<', close: '>' },
    { open: '"', close: '"' },
    { open: "'", close: "'" },
  ],
  folding: {
    markers: {
      start: /^\s*{\s*$/,
      end: /^\s*}\s*$/,
    },
  },
};

/**
 * BAL token provider (syntax highlighting)
 */
export const balTokensProvider: IMonarchLanguage = {
  // Keywords
  keywords: [
    'chain',
    'parallel',
    'if',
    'else',
    'loop',
    'run',
    'select',
    'merge',
    'map',
    'with',
    'true',
    'false',
    'null',
  ],

  // Field names (recognized as properties within entity bodies)
  propertyNames: [
    'goal',
    'model',
    'tools',
    'output',
    'history',
    'maxTokens',
    'until',
    'max',
  ],

  // Type names
  typeKeywords: [
    'string',
    'number',
    'boolean',
    'array',
    'object',
    'enum',
    'optional',
  ],

  // Operators
  operators: ['=>', '==', '!=', '<=', '>=', '&&', '||', '<', '>', '!', '.'],

  // Symbols
  symbols: /[=><!~?:&|+\-*/^%]+/,

  // Escape sequences
  escapes: /\\(?:[abfnrtv\\"']|x[0-9A-Fa-f]{1,4}|u[0-9A-Fa-f]{4}|U[0-9A-Fa-f]{8})/,

  // Tokenizer rules
  tokenizer: {
    root: [
      // Comments
      [/\/\/.*$/, 'comment'],

      // Strings (double quotes)
      [/"([^"\\]|\\.)*$/, 'string.invalid'], // Non-terminated string
      [/"/, { token: 'string.quote', next: '@string_double' }],

      // Strings (single quotes)
      [/'([^'\\]|\\.)*$/, 'string.invalid'], // Non-terminated string
      [/'/, { token: 'string.quote', next: '@string_single' }],

      // Numbers
      [/-?\d*\.\d+([eE][-+]?\d+)?/, 'number.float'],
      [/-?\d+/, 'number'],

      // Variable references ($varName)
      [/\$[a-zA-Z_][a-zA-Z0-9_]*/, 'variable'],

      // Identifiers and keywords
      [
        /[a-zA-Z_][a-zA-Z0-9_]*/,
        {
          cases: {
            '@keywords': 'keyword',
            '@propertyNames': 'property',
            '@typeKeywords': 'type',
            '@default': 'identifier',
          },
        },
      ],

      // Whitespace
      [/\s+/, 'white'],

      // Operators
      [/=>/, 'keyword.operator.arrow'],
      [/[{}()\[\]]/, '@brackets'],
      [/:/, 'delimiter'],
      [/,/, 'delimiter'],
      [/@symbols/, 'operator'],
    ],

    // Double-quoted string
    string_double: [
      [/[^\\"]+/, 'string'],
      [/@escapes/, 'string.escape'],
      [/\\./, 'string.escape.invalid'],
      [/"/, { token: 'string.quote', next: '@pop' }],
    ],

    // Single-quoted string
    string_single: [
      [/[^\\']+/, 'string'],
      [/@escapes/, 'string.escape'],
      [/\\./, 'string.escape.invalid'],
      [/'/, { token: 'string.quote', next: '@pop' }],
    ],
  },
};

/**
 * BAL color theme (Monaco theme rules)
 */
export const balThemeRules: ITokenThemeRule[] = [
  { token: 'keyword', foreground: 'a855f7', fontStyle: 'bold' }, // Purple
  { token: 'keyword.operator.arrow', foreground: '0ea5e9' }, // Sky blue
  { token: 'property', foreground: '22c55e' }, // Green
  { token: 'type', foreground: 'f59e0b' }, // Amber
  { token: 'string', foreground: '22c55e' }, // Green
  { token: 'string.quote', foreground: '22c55e' },
  { token: 'string.escape', foreground: '84cc16' }, // Lime
  { token: 'string.invalid', foreground: 'ef4444' }, // Red
  { token: 'number', foreground: '3b82f6' }, // Blue
  { token: 'number.float', foreground: '3b82f6' },
  { token: 'comment', foreground: '6b7280', fontStyle: 'italic' }, // Gray
  { token: 'operator', foreground: '0ea5e9' }, // Sky blue
  { token: 'delimiter', foreground: '9ca3af' }, // Gray
  { token: 'variable', foreground: 'ec4899' }, // Pink
  { token: 'identifier', foreground: 'e5e7eb' }, // Light gray for dark mode
];

/**
 * BAL Completion items for autocomplete
 */
const BAL_COMPLETIONS = {
  keywords: [
    { label: 'chain', detail: 'Sequential composition', insertText: 'chain {\n  $0\n}' },
    { label: 'parallel', detail: 'Concurrent composition', insertText: 'parallel {\n  $0\n}' },
    { label: 'if', detail: 'Conditional branch', insertText: 'if ("$1") {\n  $0\n}' },
    { label: 'else', detail: 'Alternative branch', insertText: 'else {\n  $0\n}' },
    { label: 'loop', detail: 'Iteration', insertText: 'loop ("until": "$1", "max": $2) {\n  $0\n}' },
    { label: 'run', detail: 'Execute pipeline', insertText: 'run("$0")' },
    { label: 'select', detail: 'Reshape data', insertText: 'select {\n  $0\n}' },
    { label: 'merge', detail: 'Combine parallel results', insertText: 'merge {\n  $0\n}' },
    { label: 'map', detail: 'Process array items', insertText: 'map $1 {\n  $0\n}' },
    { label: 'with', detail: 'Pass context to entity', insertText: 'with { $0 }' },
  ],
  properties: [
    { label: 'goal', detail: 'Entity goal (required)', insertText: '"goal": "$0"' },
    { label: 'model', detail: 'AI model to use', insertText: '"model": "$0"' },
    { label: 'tools', detail: 'Available tools', insertText: '"tools": [$0]' },
    { label: 'output', detail: 'Output schema', insertText: '"output": {\n  $0\n}' },
    { label: 'history', detail: 'History mode', insertText: '"history": "$0"' },
    { label: 'maxTokens', detail: 'Max response tokens', insertText: '"maxTokens": $0' },
  ],
  types: [
    { label: 'string', detail: 'Text value', insertText: 'string' },
    { label: 'number', detail: 'Numeric value', insertText: 'number' },
    { label: 'boolean', detail: 'True/false value', insertText: 'boolean' },
    { label: 'array', detail: 'List of items', insertText: 'array<$0>' },
    { label: 'object', detail: 'Nested structure', insertText: 'object { $0 }' },
    { label: 'enum', detail: 'Restricted values', insertText: "enum('$0')" },
  ],
  models: [
    { label: 'anthropic:claude-sonnet-4-20250514', detail: 'Claude Sonnet (default)' },
    { label: 'anthropic:claude-3-5-haiku-20241022', detail: 'Claude Haiku (fast)' },
    { label: 'openai:gpt-4.1', detail: 'GPT-4.1' },
    { label: 'openai:gpt-4.1-mini', detail: 'GPT-4.1 Mini (fast)' },
  ],
  tools: [
    { label: 'web_search', detail: 'Search the web' },
    { label: 'fetch_url', detail: 'Fetch URL content' },
    { label: 'spawn_baleybot', detail: 'Execute another BaleyBot' },
    { label: 'send_notification', detail: 'Send user notification' },
    { label: 'store_memory', detail: 'Persist key-value data' },
    { label: 'schedule_task', detail: 'Schedule future execution' },
    { label: 'create_agent', detail: 'Create ephemeral agent' },
    { label: 'create_tool', detail: 'Create ephemeral tool' },
  ],
};

/**
 * Register the BAL language with Monaco
 */
export function registerBALLanguage(monaco: Monaco): void {
  // Register the language
  monaco.languages.register({ id: BAL_LANGUAGE_ID });

  // Set language configuration
  monaco.languages.setLanguageConfiguration(BAL_LANGUAGE_ID, balLanguageConfig);

  // Set tokenizer
  monaco.languages.setMonarchTokensProvider(BAL_LANGUAGE_ID, balTokensProvider);

  // Register completion provider
  monaco.languages.registerCompletionItemProvider(BAL_LANGUAGE_ID, {
    provideCompletionItems: (model: ITextModel, position: Position) => {
      const word = model.getWordUntilPosition(position);
      const range = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: word.startColumn,
        endColumn: word.endColumn,
      };

      // Get the text before cursor to determine context
      const textBeforeCursor = model.getValueInRange({
        startLineNumber: 1,
        startColumn: 1,
        endLineNumber: position.lineNumber,
        endColumn: position.column,
      });

      const suggestions: Array<{
        label: string;
        kind: number;
        insertText: string;
        insertTextRules?: number;
        detail?: string;
        range: typeof range;
      }> = [];

      // Check if we're inside a model string
      if (/"model"\s*:\s*"[^"]*$/.test(textBeforeCursor)) {
        BAL_COMPLETIONS.models.forEach((item) => {
          suggestions.push({
            label: item.label,
            kind: monaco.languages.CompletionItemKind.Value,
            insertText: item.label,
            detail: item.detail,
            range,
          });
        });
        return { suggestions };
      }

      // Check if we're inside a tools array
      if (/"tools"\s*:\s*\[[^\]]*$/.test(textBeforeCursor)) {
        BAL_COMPLETIONS.tools.forEach((item) => {
          suggestions.push({
            label: item.label,
            kind: monaco.languages.CompletionItemKind.Value,
            insertText: `"${item.label}"`,
            detail: item.detail,
            range,
          });
        });
        return { suggestions };
      }

      // Check if we're inside an output schema (type context)
      if (/"output"\s*:\s*\{[^}]*:\s*"?[^"]*$/.test(textBeforeCursor)) {
        BAL_COMPLETIONS.types.forEach((item) => {
          suggestions.push({
            label: item.label,
            kind: monaco.languages.CompletionItemKind.TypeParameter,
            insertText: item.insertText,
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            detail: item.detail,
            range,
          });
        });
        return { suggestions };
      }

      // Check if we're inside an entity body (property context)
      const entityBodyMatch = textBeforeCursor.match(/\w+\s*\{[^}]*$/);
      if (entityBodyMatch && !/"[^"]*$/.test(textBeforeCursor)) {
        BAL_COMPLETIONS.properties.forEach((item) => {
          suggestions.push({
            label: item.label,
            kind: monaco.languages.CompletionItemKind.Property,
            insertText: item.insertText,
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            detail: item.detail,
            range,
          });
        });
        return { suggestions };
      }

      // Default: show keywords
      BAL_COMPLETIONS.keywords.forEach((item) => {
        suggestions.push({
          label: item.label,
          kind: monaco.languages.CompletionItemKind.Keyword,
          insertText: item.insertText,
          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          detail: item.detail,
          range,
        });
      });

      return { suggestions };
    },
  });

  // Define a custom theme for BAL
  monaco.editor.defineTheme('bal-dark', {
    base: 'vs-dark',
    inherit: true,
    rules: balThemeRules,
    colors: {
      'editor.background': '#0a0a0a',
      'editor.foreground': '#e5e7eb',
      'editor.lineHighlightBackground': '#1f1f1f',
      'editorLineNumber.foreground': '#6b7280',
      'editorCursor.foreground': '#a855f7',
    },
  });

  monaco.editor.defineTheme('bal-light', {
    base: 'vs',
    inherit: true,
    rules: [
      { token: 'keyword', foreground: '9333ea', fontStyle: 'bold' },
      { token: 'keyword.operator.arrow', foreground: '0284c7' },
      { token: 'property', foreground: '15803d' },
      { token: 'type', foreground: 'd97706' },
      { token: 'string', foreground: '15803d' },
      { token: 'string.quote', foreground: '15803d' },
      { token: 'string.escape', foreground: '65a30d' },
      { token: 'string.invalid', foreground: 'dc2626' },
      { token: 'number', foreground: '2563eb' },
      { token: 'number.float', foreground: '2563eb' },
      { token: 'comment', foreground: '9ca3af', fontStyle: 'italic' },
      { token: 'operator', foreground: '0284c7' },
      { token: 'delimiter', foreground: '6b7280' },
      { token: 'variable', foreground: 'db2777' },
      { token: 'identifier', foreground: '111827' },
    ],
    colors: {
      'editor.background': '#fafafa',
      'editor.foreground': '#111827',
      'editor.lineHighlightBackground': '#f3f4f6',
      'editorLineNumber.foreground': '#9ca3af',
      'editorCursor.foreground': '#9333ea',
    },
  });
}

/**
 * Create a validation error marker for Monaco
 */
export function createErrorMarker(
  line: number,
  column: number,
  message: string,
  endColumn?: number
): IMarkerData {
  return {
    severity: 8, // Error
    startLineNumber: line,
    startColumn: column,
    endLineNumber: line,
    endColumn: endColumn ?? column + 1,
    message,
  };
}

/**
 * Create a warning marker for Monaco
 */
export function createWarningMarker(
  line: number,
  column: number,
  message: string,
  endColumn?: number
): IMarkerData {
  return {
    severity: 4, // Warning
    startLineNumber: line,
    startColumn: column,
    endLineNumber: line,
    endColumn: endColumn ?? column + 1,
    message,
  };
}
