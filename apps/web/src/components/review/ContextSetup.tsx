'use client';

import { useState } from 'react';
import { useReviewExecution } from './ReviewExecutionContext';
import { Button } from '@/components/ui/button';
import { Settings, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ContextField {
  key: string;
  label: string;
  type: 'text' | 'number' | 'json';
}

interface ContextSetupProps {
  fields: ContextField[];
  className?: string;
}

export function ContextSetup({ fields, className }: ContextSetupProps) {
  const { execute, state } = useReviewExecution();
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(fields.map((f) => [f.key, '']))
  );
  const [error, setError] = useState<string | null>(null);

  const handleChange = (key: string, value: string) => {
    setValues((prev) => ({ ...prev, [key]: value }));
    setError(null);
  };

  const handleSubmit = async () => {
    const result: Record<string, unknown> = {};
    for (const field of fields) {
      const raw = values[field.key] ?? '';
      if (field.type === 'number') {
        const num = Number(raw);
        if (raw && isNaN(num)) {
          setError(`${field.label} must be a number`);
          return;
        }
        result[field.key] = raw ? num : undefined;
      } else if (field.type === 'json') {
        if (raw.trim()) {
          try {
            result[field.key] = JSON.parse(raw);
          } catch {
            setError(`${field.label} must be valid JSON`);
            return;
          }
        }
      } else {
        result[field.key] = raw || undefined;
      }
    }
    setError(null);
    await execute(result);
  };

  return (
    <div className={cn('rounded-lg border bg-background p-4 flex flex-col gap-3', className)}>
      <div className="flex items-center gap-2">
        <Settings className="h-4 w-4 text-muted-foreground" />
        <p className="text-sm font-medium">Context Setup</p>
      </div>

      <div className="space-y-2">
        {fields.map((field) => (
          <div key={field.key}>
            <label className="text-xs text-muted-foreground mb-1 block">{field.label}</label>
            {field.type === 'json' ? (
              <textarea
                value={values[field.key] ?? ''}
                onChange={(e) => handleChange(field.key, e.target.value)}
                className="w-full rounded-lg border bg-background px-3 py-2 font-mono text-xs resize-none focus:outline-none focus:ring-2 focus:ring-primary/20"
                rows={3}
                spellCheck={false}
                placeholder="{}"
              />
            ) : (
              <input
                type={field.type === 'number' ? 'number' : 'text'}
                value={values[field.key] ?? ''}
                onChange={(e) => handleChange(field.key, e.target.value)}
                className="w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
            )}
          </div>
        ))}
      </div>

      {error && <p className="text-xs text-red-500">{error}</p>}

      <Button
        size="sm"
        onClick={handleSubmit}
        disabled={state.isExecuting}
        className="w-full"
      >
        {state.isExecuting ? (
          <>
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            Processing...
          </>
        ) : (
          'Run with Context'
        )}
      </Button>
    </div>
  );
}
