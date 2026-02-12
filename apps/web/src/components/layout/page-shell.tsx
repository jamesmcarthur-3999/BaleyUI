import * as React from 'react';
import { cn } from '@/lib/utils';

const CONTAINERS = {
  standard: 'container py-8 md:py-10',
  constrained: 'max-w-2xl space-y-6 py-8 md:py-10 px-4',
  none: '',
} as const;

export interface PageShellProps {
  title?: string | React.ReactNode;
  titleSize?: '3xl' | '2xl';
  description?: string | React.ReactNode;
  actions?: React.ReactNode;
  container?: keyof typeof CONTAINERS;
  className?: string;
  children: React.ReactNode;
}

export function PageShell({
  title,
  titleSize = '3xl',
  description,
  actions,
  container = 'standard',
  className,
  children,
}: PageShellProps) {
  const hasHeader = title || description;
  const titleClass = titleSize === '3xl' ? 'text-3xl' : 'text-2xl';

  return (
    <div className={cn(CONTAINERS[container], className)}>
      <div className="flex flex-col gap-6 md:gap-8">
        {hasHeader && (
          <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              {title && (
                <h1 className={cn(titleClass, 'font-bold tracking-tight')}>
                  {title}
                </h1>
              )}
              {description && (
                <p className="text-muted-foreground">{description}</p>
              )}
            </div>
            {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
          </header>
        )}
        {children}
      </div>
    </div>
  );
}
