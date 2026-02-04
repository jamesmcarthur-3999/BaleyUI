'use client';

import { useEffect, useRef, useState } from 'react';
import Editor, { OnMount, OnChange, Monaco } from '@monaco-editor/react';
import { cn } from '@/lib/utils';
import { Loader2 } from 'lucide-react';
import {
  BAL_LANGUAGE_ID,
  registerBALLanguage,
  createErrorMarker,
  createWarningMarker,
} from './bal-language';

/**
 * Parser error location for error markers
 */
export interface ParserError {
  line: number;
  column: number;
  message: string;
  endColumn?: number;
}

/**
 * Validation warning
 */
export interface ValidationWarning {
  line: number;
  column: number;
  message: string;
  endColumn?: number;
}

interface BalCodeEditorProps {
  /** The BAL code to display/edit */
  value: string;
  /** Callback when code changes */
  onChange?: (value: string) => void;
  /** Parser errors to display as markers */
  errors?: ParserError[];
  /** Validation warnings to display as markers */
  warnings?: ValidationWarning[];
  /** Whether the editor is read-only */
  readOnly?: boolean;
  /** Editor height (default: 400px) */
  height?: string | number;
  /** Additional CSS classes */
  className?: string;
  /** Whether to show minimap (default: false) */
  showMinimap?: boolean;
  /** Debounce delay for onChange (default: 300ms) */
  debounceDelay?: number;
  /** Callback when editor is mounted */
  onMount?: OnMount;
}

// Track if BAL language has been registered
let isLanguageRegistered = false;

/**
 * Custom hook to detect system theme preference
 */
function useSystemTheme(): 'dark' | 'light' {
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');

  useEffect(() => {
    // Check localStorage first
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'dark' || savedTheme === 'light') {
      setTheme(savedTheme);
      return;
    }

    // Check system preference
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    setTheme(mediaQuery.matches ? 'dark' : 'light');

    // Listen for changes
    const handler = (e: MediaQueryListEvent) => {
      const saved = localStorage.getItem('theme');
      if (!saved || saved === 'system') {
        setTheme(e.matches ? 'dark' : 'light');
      }
    };
    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, []);

  return theme;
}

/**
 * BAL Code Editor Component
 *
 * A Monaco-based editor for BAL (Baleybots Assembly Language) code.
 * Features:
 * - Syntax highlighting for BAL
 * - Error and warning markers
 * - Bracket matching
 * - Auto-closing quotes/braces
 * - Theme-aware (dark/light)
 */
export function BalCodeEditor({
  value,
  onChange,
  errors = [],
  warnings = [],
  readOnly = false,
  height = 400,
  className,
  showMinimap = false,
  debounceDelay = 300,
  onMount: onMountCallback,
}: BalCodeEditorProps) {
  const systemTheme = useSystemTheme();
  const editorRef = useRef<Parameters<OnMount>[0] | null>(null);
  const monacoRef = useRef<Monaco | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Debounce timer for onChange
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /**
   * Handle editor mount
   */
  const handleEditorMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;

    // Register BAL language if not already registered
    if (!isLanguageRegistered) {
      registerBALLanguage(monaco);
      isLanguageRegistered = true;
    }

    // Set the model language to BAL
    const model = editor.getModel();
    if (model) {
      monaco.editor.setModelLanguage(model, BAL_LANGUAGE_ID);
    }

    // Update markers
    updateMarkers();

    setIsLoading(false);

    // Call user's onMount callback
    onMountCallback?.(editor, monaco);
  };

  /**
   * Handle code change
   */
  const handleChange: OnChange = (newValue) => {
    if (!onChange || newValue === undefined) return;

    // Debounce the onChange callback
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(() => {
      onChange(newValue);
    }, debounceDelay);
  };

  /**
   * Update error/warning markers
   */
  const updateMarkers = () => {
    if (!editorRef.current || !monacoRef.current) return;

    const monaco = monacoRef.current;
    const model = editorRef.current.getModel();
    if (!model) return;

    const markers: Parameters<typeof monaco.editor.setModelMarkers>[2] = [];

    // Add error markers
    for (const error of errors) {
      markers.push(
        createErrorMarker(error.line, error.column, error.message, error.endColumn)
      );
    }

    // Add warning markers
    for (const warning of warnings) {
      markers.push(
        createWarningMarker(warning.line, warning.column, warning.message, warning.endColumn)
      );
    }

    monaco.editor.setModelMarkers(model, 'bal', markers);
  };

  // Update markers when errors/warnings change
  useEffect(() => {
    updateMarkers();
  }, [errors, warnings]);

  // Cleanup debounce timer
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  // Determine theme
  const theme = systemTheme === 'dark' ? 'bal-dark' : 'bal-light';

  return (
    <div className={cn('relative rounded-lg overflow-hidden border', className)}>
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/80 z-10">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}
      <Editor
        height={height}
        defaultLanguage={BAL_LANGUAGE_ID}
        value={value}
        theme={theme}
        onChange={handleChange}
        onMount={handleEditorMount}
        loading={null}
        options={{
          readOnly,
          minimap: { enabled: showMinimap },
          fontSize: 14,
          fontFamily: 'JetBrains Mono, Menlo, Monaco, Courier New, monospace',
          lineNumbers: 'on',
          lineNumbersMinChars: 3,
          folding: true,
          foldingStrategy: 'indentation',
          automaticLayout: true,
          scrollBeyondLastLine: false,
          tabSize: 2,
          insertSpaces: true,
          wordWrap: 'on',
          wrappingStrategy: 'advanced',
          bracketPairColorization: {
            enabled: true,
          },
          guides: {
            bracketPairs: true,
            indentation: true,
          },
          suggest: {
            showKeywords: true,
          },
          quickSuggestions: false,
          padding: {
            top: 16,
            bottom: 16,
          },
          scrollbar: {
            verticalScrollbarSize: 10,
            horizontalScrollbarSize: 10,
          },
        }}
      />
    </div>
  );
}

export default BalCodeEditor;
