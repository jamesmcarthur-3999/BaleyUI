import * as React from 'react';

import { cn } from '@/lib/utils';

export interface LoadingDotsProps extends React.HTMLAttributes<HTMLSpanElement> {
  size?: 'sm' | 'md' | 'lg';
}

function LoadingDots({ className, size = 'md', ...props }: LoadingDotsProps) {
  const sizeClasses = {
    sm: 'h-1 w-1',
    md: 'h-1.5 w-1.5',
    lg: 'h-2 w-2',
  };

  const gapClasses = {
    sm: 'gap-1',
    md: 'gap-1.5',
    lg: 'gap-2',
  };

  return (
    <span
      className={cn('inline-flex items-center', gapClasses[size], className)}
      {...props}
    >
      <span
        className={cn(
          'rounded-full bg-current animate-bounce',
          sizeClasses[size]
        )}
        style={{ animationDelay: '0ms', animationDuration: '1s' }}
      />
      <span
        className={cn(
          'rounded-full bg-current animate-bounce',
          sizeClasses[size]
        )}
        style={{ animationDelay: '150ms', animationDuration: '1s' }}
      />
      <span
        className={cn(
          'rounded-full bg-current animate-bounce',
          sizeClasses[size]
        )}
        style={{ animationDelay: '300ms', animationDuration: '1s' }}
      />
    </span>
  );
}

export { LoadingDots };
