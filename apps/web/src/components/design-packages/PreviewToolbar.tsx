'use client';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Moon, Sun, Monitor, Tablet, Smartphone } from 'lucide-react';

type Viewport = 'desktop' | 'tablet' | 'mobile';

interface PreviewToolbarProps {
  isDark: boolean;
  onToggleDark: () => void;
  viewport: Viewport;
  onViewportChange: (v: Viewport) => void;
}

const viewports: { value: Viewport; icon: typeof Monitor; label: string }[] = [
  { value: 'desktop', icon: Monitor, label: 'Desktop' },
  { value: 'tablet', icon: Tablet, label: 'Tablet' },
  { value: 'mobile', icon: Smartphone, label: 'Mobile' },
];

export function PreviewToolbar({ isDark, onToggleDark, viewport, onViewportChange }: PreviewToolbarProps) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-border bg-card p-1">
      <Button
        variant="ghost"
        size="sm"
        onClick={onToggleDark}
        className="h-8 w-8 p-0"
        aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      >
        {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
      </Button>
      <div className="h-4 w-px bg-border" />
      {viewports.map(({ value, icon: Icon, label }) => (
        <Button
          key={value}
          variant="ghost"
          size="sm"
          onClick={() => onViewportChange(value)}
          className={cn(
            'h-8 w-8 p-0',
            viewport === value
              ? 'bg-primary/10 text-primary ring-1 ring-primary/20'
              : 'text-muted-foreground'
          )}
          aria-label={label}
        >
          <Icon className="h-4 w-4" />
        </Button>
      ))}
    </div>
  );
}
