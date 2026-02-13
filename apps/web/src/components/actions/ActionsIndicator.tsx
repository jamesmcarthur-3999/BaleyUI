'use client';

import Link from 'next/link';
import { trpc } from '@/lib/trpc/client';
import { Button } from '@/components/ui/button';
import { ROUTES } from '@/lib/routes';
import { Sparkles } from 'lucide-react';

export function ActionsIndicator() {
  const { data: counts } = trpc.recommendations.counts.useQuery(undefined, {
    refetchInterval: 30_000,
  });

  const pendingCount = counts?.pending ?? 0;
  const criticalCount = counts?.pendingBySeverity?.critical ?? 0;

  const ariaLabel = pendingCount > 0
    ? `${pendingCount} suggestion${pendingCount !== 1 ? 's' : ''}${criticalCount > 0 ? `, including ${criticalCount} critical` : ''}`
    : 'Actions';

  return (
    <Button
      variant="ghost"
      size="icon"
      className="relative"
      asChild
      aria-label={ariaLabel}
    >
      <Link href={ROUTES.actions.list}>
        <Sparkles className="h-4 w-4" />

        {/* Count badge — red when critical items exist */}
        {pendingCount > 0 && (
          <span className={`absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold text-primary-foreground ${criticalCount > 0 ? 'bg-red-500' : 'bg-primary'}`}>
            {pendingCount > 99 ? '99+' : pendingCount}
          </span>
        )}

        {/* Critical dot — only shown when there's no count badge (zero pending somehow but critical exists) */}
        {criticalCount > 0 && pendingCount === 0 && (
          <span className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-background" />
        )}
      </Link>
    </Button>
  );
}
