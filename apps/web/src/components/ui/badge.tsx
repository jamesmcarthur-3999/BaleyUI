import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
  {
    variants: {
      variant: {
        default:
          'border-transparent bg-primary text-primary-foreground hover:bg-primary/80',
        secondary:
          'border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80',
        destructive:
          'border-transparent bg-destructive text-destructive-foreground hover:bg-destructive/80',
        outline: 'text-foreground',

        // Block type variants
        ai: 'border-transparent bg-[hsl(var(--color-block-ai))] text-white hover:bg-[hsl(var(--color-block-ai))]/80',
        function: 'border-transparent bg-[hsl(var(--color-block-function))] text-white hover:bg-[hsl(var(--color-block-function))]/80',
        router: 'border-transparent bg-[hsl(var(--color-block-router))] text-white hover:bg-[hsl(var(--color-block-router))]/80',
        parallel: 'border-transparent bg-[hsl(var(--color-block-parallel))] text-white hover:bg-[hsl(var(--color-block-parallel))]/80',

        // Provider variants
        openai: 'border-transparent bg-[hsl(var(--color-provider-openai))] text-white hover:bg-[hsl(var(--color-provider-openai))]/80',
        anthropic: 'border-transparent bg-[hsl(var(--color-provider-anthropic))] text-white hover:bg-[hsl(var(--color-provider-anthropic))]/80',
        ollama: 'border-transparent bg-[hsl(var(--color-provider-ollama))] text-white hover:bg-[hsl(var(--color-provider-ollama))]/80',

        // Status variants
        connected: 'border-transparent bg-[hsl(var(--color-stream-active))] text-white hover:bg-[hsl(var(--color-stream-active))]/80',
        error: 'border-transparent bg-[hsl(var(--color-stream-error))] text-white hover:bg-[hsl(var(--color-stream-error))]/80',
        unconfigured: 'border-transparent bg-muted text-muted-foreground hover:bg-muted/80',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
