'use client';

import { useRef } from 'react';
import { useReviewExecution } from './ReviewExecutionContext';
import { StreamdownMarkdown } from '@/components/shared/StreamdownMarkdown';
import { Button } from '@/components/ui/button';
import { Download } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ResultViewProps {
  className?: string;
}

/**
 * Attempts to parse a string as JSON. Returns null if not JSON.
 */
function tryParseJSON(str: string): unknown | null {
  try {
    const parsed = JSON.parse(str);
    return typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Checks if a value is an array of plain objects (for table rendering).
 */
function isRecordArray(value: unknown): value is Array<Record<string, unknown>> {
  if (!Array.isArray(value) || value.length === 0) return false;
  return value.every((item) => item && typeof item === 'object' && !Array.isArray(item));
}

export function ResultView({ className }: ResultViewProps) {
  const { state } = useReviewExecution();
  const { output, error, isExecuting } = state;
  const printRef = useRef<HTMLDivElement>(null);

  const handleDownloadPDF = () => {
    window.print();
  };

  if (!output && !error && !isExecuting) {
    return (
      <div className={cn('rounded-lg border bg-background flex items-center justify-center', className)}>
        <p className="text-xs text-muted-foreground">Results will appear here</p>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className={cn('rounded-lg border border-red-500/30 bg-red-500/5 p-4 overflow-auto', className)}>
        <p className="text-xs font-medium text-red-700 dark:text-red-300 mb-1">Error</p>
        <p className="text-sm text-red-600 dark:text-red-400 whitespace-pre-wrap">{error}</p>
      </div>
    );
  }

  if (!output) {
    return (
      <div className={cn('rounded-lg border bg-background flex items-center justify-center', className)}>
        <p className="text-xs text-muted-foreground animate-pulse">Processing...</p>
      </div>
    );
  }

  // Try JSON parsing
  const parsed = tryParseJSON(output);

  // Table rendering for Array<Record>
  if (isRecordArray(parsed)) {
    const columns = Object.keys(parsed[0]!);
    return (
      <div className={cn('rounded-lg border bg-background overflow-auto', className)}>
        <div className="px-3 py-2 border-b bg-muted/20 flex items-center justify-between">
          <p className="text-xs font-medium text-muted-foreground">
            Result ({parsed.length} {parsed.length === 1 ? 'item' : 'items'})
          </p>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleDownloadPDF}
            className="h-7 text-xs gap-1.5 print:hidden"
          >
            <Download className="h-3 w-3" />
            PDF
          </Button>
        </div>
        <div ref={printRef} className="print:p-8">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b bg-muted/10">
                {columns.map((col) => (
                  <th key={col} className="px-3 py-1.5 text-left font-medium text-muted-foreground">
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {parsed.map((row, i) => (
                <tr key={i} className="border-b last:border-b-0 hover:bg-muted/5">
                  {columns.map((col) => (
                    <td key={col} className="px-3 py-1.5 truncate max-w-[200px]">
                      {String(row[col] ?? '')}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  // JSON rendering
  if (parsed !== null) {
    return (
      <div className={cn('rounded-lg border bg-background overflow-auto', className)}>
        <div className="px-3 py-2 border-b bg-muted/20 flex items-center justify-between">
          <p className="text-xs font-medium text-muted-foreground">JSON Result</p>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleDownloadPDF}
            className="h-7 text-xs gap-1.5 print:hidden"
          >
            <Download className="h-3 w-3" />
            PDF
          </Button>
        </div>
        <div ref={printRef} className="print:p-8">
          <pre className="p-3 text-xs font-mono whitespace-pre-wrap break-words">
            {JSON.stringify(parsed, null, 2)}
          </pre>
        </div>
      </div>
    );
  }

  // Plain text / markdown rendering
  return (
    <div className={cn('rounded-lg border bg-background overflow-auto', className)}>
      <div className="px-3 py-2 border-b bg-muted/20 flex items-center justify-between print:hidden">
        <p className="text-xs font-medium text-muted-foreground">Result</p>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleDownloadPDF}
          className="h-7 text-xs gap-1.5"
        >
          <Download className="h-3 w-3" />
          PDF
        </Button>
      </div>
      <div ref={printRef} className="p-3 text-sm print:p-8">
        <StreamdownMarkdown text={output} />
      </div>
    </div>
  );
}
