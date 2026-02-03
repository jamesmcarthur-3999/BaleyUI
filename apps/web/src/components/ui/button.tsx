import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

const buttonVariants = cva(
  [
    // Base styles
    'inline-flex items-center justify-center gap-2 whitespace-nowrap',
    'text-sm font-medium tracking-tight',
    'ring-offset-background transition-all duration-150',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
    'disabled:pointer-events-none disabled:opacity-50',
    '[&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
    // Refined rounded corners
    'rounded-lg',
  ].join(' '),
  {
    variants: {
      variant: {
        default: [
          'bg-primary text-primary-foreground',
          'hover:bg-primary/90 hover:shadow-md hover:shadow-primary/20',
          'active:scale-[0.98]',
        ].join(' '),
        destructive: [
          'bg-destructive text-destructive-foreground',
          'hover:bg-destructive/90 hover:shadow-md hover:shadow-destructive/20',
          'active:scale-[0.98]',
        ].join(' '),
        outline: [
          'border border-border bg-background',
          'hover:bg-secondary hover:border-border/80',
          'active:scale-[0.98]',
        ].join(' '),
        secondary: [
          'bg-secondary text-secondary-foreground',
          'hover:bg-secondary/80',
          'active:scale-[0.98]',
        ].join(' '),
        ghost: [
          'text-muted-foreground',
          'hover:bg-secondary hover:text-foreground',
          'active:scale-[0.98]',
        ].join(' '),
        link: [
          'text-primary underline-offset-4',
          'hover:underline',
        ].join(' '),
        // New premium variant for primary actions
        premium: [
          'bg-gradient-to-r from-primary to-accent text-white',
          'hover:shadow-lg hover:shadow-primary/30',
          'active:scale-[0.98]',
        ].join(' '),
        // Subtle glow for AI-related actions
        ai: [
          'bg-block-ai/10 text-block-ai border border-block-ai/20',
          'hover:bg-block-ai/20 hover:border-block-ai/40',
          'hover:shadow-md hover:shadow-block-ai/20',
          'active:scale-[0.98]',
        ].join(' '),
      },
      size: {
        default: 'h-10 px-5 py-2',
        sm: 'h-9 px-4 text-xs',
        lg: 'h-12 px-8 text-base',
        icon: 'h-10 w-10',
        'icon-sm': 'h-8 w-8',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = 'Button';

export { Button, buttonVariants };
