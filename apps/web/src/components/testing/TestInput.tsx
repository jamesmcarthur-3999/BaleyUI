'use client';

import { useState, useEffect } from 'react';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { AlertCircle, CheckCircle2, Wand2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface TestInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  label?: string;
  mode?: 'text' | 'json';
  rows?: number;
}

export function TestInput({
  value,
  onChange,
  placeholder = 'Enter input...',
  disabled = false,
  className,
  label = 'Input',
  mode = 'json',
  rows = 10,
}: TestInputProps) {
  const [error, setError] = useState<string | null>(null);
  const [isValid, setIsValid] = useState<boolean>(true);

  // Validate JSON if in JSON mode
  useEffect(() => {
    if (mode === 'json' && value.trim()) {
      try {
        JSON.parse(value);
        setError(null);
        setIsValid(true);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Invalid JSON');
        setIsValid(false);
      }
    } else {
      setError(null);
      setIsValid(true);
    }
  }, [value, mode]);

  const handleFormat = () => {
    if (mode === 'json' && value.trim()) {
      try {
        const parsed = JSON.parse(value);
        const formatted = JSON.stringify(parsed, null, 2);
        onChange(formatted);
        setError(null);
        setIsValid(true);
      } catch (err) {
        // If parsing fails, error is already shown
      }
    }
  };

  return (
    <div className={cn('space-y-2', className)}>
      <div className="flex items-center justify-between">
        <Label htmlFor="test-input" className="flex items-center gap-2">
          {label}
          {mode === 'json' && value.trim() && (
            <Badge variant={isValid ? 'connected' : 'error'} className="text-xs">
              {isValid ? (
                <>
                  <CheckCircle2 className="h-3 w-3 mr-1" />
                  Valid JSON
                </>
              ) : (
                <>
                  <AlertCircle className="h-3 w-3 mr-1" />
                  Invalid JSON
                </>
              )}
            </Badge>
          )}
        </Label>
        {mode === 'json' && value.trim() && isValid && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleFormat}
            disabled={disabled}
            className="h-7 text-xs"
          >
            <Wand2 className="h-3 w-3 mr-1" />
            Format
          </Button>
        )}
      </div>

      <Textarea
        id="test-input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        rows={rows}
        className={cn(
          'font-mono text-sm resize-none',
          !isValid && 'border-red-500 focus-visible:ring-red-500'
        )}
      />

      {error && (
        <div className="flex items-start gap-2 text-xs text-red-600">
          <AlertCircle className="h-3 w-3 mt-0.5 flex-shrink-0" />
          <span className="font-mono">{error}</span>
        </div>
      )}
    </div>
  );
}
