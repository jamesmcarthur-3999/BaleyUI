'use client';

import * as React from 'react';
import { useState, useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';
import { Input } from './input';
import { Button } from './button';
import { Check, X, Pencil } from 'lucide-react';

interface InlineEditProps {
  /** Current value */
  value: string;
  /** Called when value is saved */
  onSave: (value: string) => void | Promise<void>;
  /** Placeholder when empty */
  placeholder?: string;
  /** Additional class for the container */
  className?: string;
  /** Additional class for the display text */
  textClassName?: string;
  /** Additional class for the input */
  inputClassName?: string;
  /** Whether the field is disabled */
  disabled?: boolean;
  /** Maximum length */
  maxLength?: number;
  /** Validate input, return error message or undefined */
  validate?: (value: string) => string | undefined;
}

type EditState = 'display' | 'editing' | 'saving';

function InlineEdit({
  value,
  onSave,
  placeholder = 'Click to edit...',
  className,
  textClassName,
  inputClassName,
  disabled = false,
  maxLength,
  validate,
}: InlineEditProps) {
  const [state, setState] = useState<EditState>('display');
  const [editValue, setEditValue] = useState(value);
  const [error, setError] = useState<string | undefined>();
  const [showFlash, setShowFlash] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Update edit value when prop changes
  useEffect(() => {
    if (state === 'display') {
      setEditValue(value);
    }
  }, [value, state]);

  // Focus and select on edit
  useEffect(() => {
    if (state === 'editing' && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [state]);

  const startEditing = () => {
    if (disabled) return;
    setEditValue(value);
    setError(undefined);
    setState('editing');
  };

  const handleSave = async () => {
    const trimmed = editValue.trim();

    // Validate
    if (validate) {
      const validationError = validate(trimmed);
      if (validationError) {
        setError(validationError);
        return;
      }
    }

    // No change
    if (trimmed === value) {
      setState('display');
      return;
    }

    setState('saving');
    try {
      await onSave(trimmed);
      setState('display');
      // Show save flash
      setShowFlash(true);
      setTimeout(() => setShowFlash(false), 400);
    } catch {
      setError('Failed to save');
      setState('editing');
    }
  };

  const handleCancel = () => {
    setEditValue(value);
    setError(undefined);
    setState('display');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSave();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      handleCancel();
    }
  };

  if (state === 'editing' || state === 'saving') {
    return (
      <div className={cn('inline-flex items-center gap-1', className)}>
        <div className="relative">
          <Input
            ref={inputRef}
            value={editValue}
            onChange={(e) => {
              setEditValue(e.target.value);
              setError(undefined);
            }}
            onKeyDown={handleKeyDown}
            onBlur={handleSave}
            disabled={state === 'saving'}
            maxLength={maxLength}
            className={cn(
              'h-8 py-1 px-2',
              error && 'border-destructive focus-visible:ring-destructive',
              inputClassName
            )}
            aria-invalid={!!error}
          />
          {error && (
            <p className="absolute -bottom-5 left-0 text-xs text-destructive">
              {error}
            </p>
          )}
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={handleSave}
          disabled={state === 'saving'}
        >
          {state === 'saving' ? (
            <span className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
          ) : (
            <Check className="h-3.5 w-3.5 text-green-600" />
          )}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={handleCancel}
          disabled={state === 'saving'}
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={startEditing}
      disabled={disabled}
      className={cn(
        'group inline-flex items-center gap-2 rounded px-1 -mx-1 transition-colors',
        'hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        showFlash && 'animate-pulse bg-green-500/10',
        disabled && 'cursor-not-allowed opacity-50',
        className
      )}
    >
      <span
        className={cn(
          'text-sm',
          !value && 'text-muted-foreground italic',
          textClassName
        )}
      >
        {value || placeholder}
      </span>
      <Pencil
        className={cn(
          'h-3 w-3 text-muted-foreground opacity-0 transition-opacity',
          'group-hover:opacity-100 group-focus-visible:opacity-100'
        )}
      />
    </button>
  );
}

export { InlineEdit, type InlineEditProps };
