import * as React from 'react';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

interface FormFieldGroupProps {
  label: string;
  description?: string;
  error?: string;
  required?: boolean;
  layout?: 'vertical' | 'horizontal';
  className?: string;
  children: React.ReactElement;
}

function FormFieldGroup({
  label,
  description,
  error,
  required,
  layout = 'vertical',
  className,
  children,
}: FormFieldGroupProps) {
  const id = React.useId();
  const descriptionId = description ? `${id}-description` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const ariaDescribedBy = [descriptionId, errorId].filter(Boolean).join(' ') || undefined;

  const child = React.cloneElement(children as React.ReactElement<Record<string, unknown>>, {
    id,
    'aria-describedby': ariaDescribedBy,
    'aria-invalid': error ? true : undefined,
  });

  if (layout === 'horizontal') {
    return (
      <div className={cn('flex items-center justify-between', className)}>
        <div className="space-y-0.5">
          <Label htmlFor={id}>
            {label}
            {required && <span className="text-destructive"> *</span>}
          </Label>
          {description && (
            <p id={descriptionId} className="text-sm text-muted-foreground">
              {description}
            </p>
          )}
        </div>
        {child}
      </div>
    );
  }

  return (
    <div className={cn('space-y-2', className)}>
      <Label htmlFor={id}>
        {label}
        {required && <span className="text-destructive"> *</span>}
      </Label>
      {child}
      {description && (
        <p id={descriptionId} className="text-sm text-muted-foreground">
          {description}
        </p>
      )}
      {error && (
        <p id={errorId} className="text-sm font-medium text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

export { FormFieldGroup };
export type { FormFieldGroupProps };
