'use client';

import { cn } from '@/lib/utils';
import { Info, CheckCircle2, AlertCircle } from 'lucide-react';
import type { SystemBlock } from '../types';

interface SystemNoticeProps {
  block: SystemBlock;
  className?: string;
}

export function SystemNotice({ block, className }: SystemNoticeProps) {
  return (
    <div className={cn(
      'flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs',
      block.status === 'error' ? 'bg-destructive/5 text-destructive' : 'bg-foreground/[0.02] text-muted-foreground',
      className,
    )}>
      {block.status === 'success' && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />}
      {block.status === 'error' && <AlertCircle className="h-3.5 w-3.5 shrink-0" />}
      {(block.status === 'info' || !block.status) && <Info className="h-3.5 w-3.5 shrink-0" />}
      <span>{block.action}</span>
      {block.detail && <span className="text-muted-foreground/60">&mdash; {block.detail}</span>}
    </div>
  );
}
