'use client';

import { cn } from '@/lib/utils';

export type ShowcaseCategory = 'buttons' | 'forms' | 'cards' | 'navigation' | 'data' | 'feedback';

const categories: { value: ShowcaseCategory; label: string }[] = [
  { value: 'buttons', label: 'Buttons' },
  { value: 'forms', label: 'Forms' },
  { value: 'cards', label: 'Cards' },
  { value: 'navigation', label: 'Navigation' },
  { value: 'data', label: 'Data' },
  { value: 'feedback', label: 'Feedback' },
];

interface PreviewTabsProps {
  active: ShowcaseCategory;
  onChange: (cat: ShowcaseCategory) => void;
}

export function PreviewTabs({ active, onChange }: PreviewTabsProps) {
  return (
    <div className="flex gap-1 rounded-lg border border-border bg-muted/50 p-1" role="tablist">
      {categories.map(({ value, label }, index) => (
        <button
          key={value}
          type="button"
          role="tab"
          aria-selected={active === value}
          tabIndex={active === value ? 0 : -1}
          onClick={() => onChange(value)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowRight') {
              e.preventDefault();
              const next = categories[(index + 1) % categories.length];
              if (next) onChange(next.value);
            }
            if (e.key === 'ArrowLeft') {
              e.preventDefault();
              const prev = categories[(index - 1 + categories.length) % categories.length];
              if (prev) onChange(prev.value);
            }
          }}
          className={cn(
            'rounded-md px-3 py-1.5 text-sm font-medium transition-all duration-150',
            active === value
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground hover:bg-background/50'
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
