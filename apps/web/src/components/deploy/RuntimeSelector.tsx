'use client';

import { Cloud, Laptop, CheckCircle2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface RuntimeSelectorProps {
  value: 'cloud' | 'local';
  onChange: (value: 'cloud' | 'local') => void;
  localEnabled?: boolean;
}

export function RuntimeSelector({ value, onChange, localEnabled = true }: RuntimeSelectorProps) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {/* Cloud */}
      <button
        type="button"
        onClick={() => onChange('cloud')}
        className={cn(
          'relative flex flex-col items-center gap-2 rounded-xl border-2 p-4 transition-all text-left',
          value === 'cloud'
            ? 'border-primary bg-primary/5 shadow-md'
            : 'border-border hover:border-primary/40'
        )}
      >
        {value === 'cloud' && (
          <CheckCircle2 className="absolute top-2 right-2 h-4 w-4 text-primary" />
        )}
        <div className="h-10 w-10 rounded-xl bg-sky-500/10 flex items-center justify-center">
          <Cloud className="h-5 w-5 text-sky-500" />
        </div>
        <div className="text-center">
          <p className="text-sm font-medium">Cloud</p>
          <p className="text-[11px] text-muted-foreground">Managed hosting</p>
        </div>
      </button>

      {/* Local */}
      <button
        type="button"
        onClick={() => localEnabled && onChange('local')}
        className={cn(
          'relative flex flex-col items-center gap-2 rounded-xl border-2 p-4 transition-all text-left',
          value === 'local'
            ? 'border-accent bg-accent/5 shadow-md'
            : 'border-border hover:border-accent/40',
          !localEnabled && 'opacity-50 cursor-not-allowed'
        )}
      >
        {value === 'local' && (
          <CheckCircle2 className="absolute top-2 right-2 h-4 w-4 text-accent" />
        )}
        {!localEnabled && (
          <Badge variant="secondary" className="absolute top-2 right-2 text-[10px] px-1.5 py-0">Pro</Badge>
        )}
        <div className="h-10 w-10 rounded-xl bg-emerald-500/10 flex items-center justify-center">
          <Laptop className="h-5 w-5 text-emerald-500" />
        </div>
        <div className="text-center">
          <p className="text-sm font-medium">Local</p>
          <p className="text-[11px] text-muted-foreground">Self-hosted runtime</p>
        </div>
      </button>
    </div>
  );
}
