'use client';

import Link from 'next/link';
import { trpc } from '@/lib/trpc/client';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { ROUTES } from '@/lib/routes';
import { BaleybotCard, CreateBaleybotPrompt } from '@/components/baleybots';
import { Bot, Plus } from 'lucide-react';
import { useGridNavigation } from '@/hooks/useGridNavigation';

export default function BaleybotsListPage() {
  const { data: baleybots, isLoading } = trpc.baleybots.list.useQuery();
  const { containerRef, handleKeyDown } = useGridNavigation(baleybots?.length ?? 0, 3);

  return (
    <div className="container py-10">
      <div className="flex flex-col gap-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">BaleyBots</h1>
            <p className="text-muted-foreground">
              Manage all your intelligent BaleyBots
            </p>
          </div>
          <Button asChild>
            <Link href={ROUTES.baleybots.create}>
              <Plus className="h-4 w-4 mr-2" />
              New BaleyBot
            </Link>
          </Button>
        </div>

        {/* Create Prompt */}
        <CreateBaleybotPrompt />

        {/* BaleyBots Grid */}
        {isLoading ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <Skeleton key={i} className="h-32" />
            ))}
          </div>
        ) : baleybots && baleybots.length > 0 ? (
          <div
            ref={containerRef}
            role="grid"
            aria-label="BaleyBots list"
            className="grid gap-4 md:grid-cols-2 lg:grid-cols-3"
          >
            {baleybots.map((bb, index) => (
              <div
                key={bb.id}
                role="gridcell"
                tabIndex={index === 0 ? 0 : -1}
                onKeyDown={(e) => handleKeyDown(e, index)}
                className="focus:outline-none focus:ring-2 focus:ring-primary rounded-xl"
              >
                <BaleybotCard
                  id={bb.id}
                  name={bb.name}
                  description={bb.description}
                  icon={bb.icon}
                  status={bb.status as 'draft' | 'active' | 'paused' | 'error'}
                  executionCount={bb.executionCount ?? 0}
                  lastExecutedAt={
                    bb.lastExecutedAt ? new Date(bb.lastExecutedAt) : null
                  }
                />
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            icon={Bot}
            title="No BaleyBots yet"
            description="Create your first BaleyBot by describing what you need above."
            action={{
              label: 'Create BaleyBot',
              href: ROUTES.baleybots.create,
            }}
          />
        )}
      </div>
    </div>
  );
}
