'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { trpc } from '@/lib/trpc/client';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { ROUTES } from '@/lib/routes';
import { BaleybotCard, CreateBaleybotPrompt } from '@/components/baleybots';
import { Bot, Plus } from 'lucide-react';
import { useGridNavigation } from '@/hooks/useGridNavigation';

export default function BaleybotsListPage() {
  const router = useRouter();
  const { toast } = useToast();
  const utils = trpc.useUtils();
  const { data: baleybots, isLoading } = trpc.baleybots.list.useQuery(undefined, { staleTime: 5 * 60 * 1000 });
  const { containerRef, handleKeyDown } = useGridNavigation(baleybots?.length ?? 0, 3);

  const activateMutation = trpc.baleybots.activate.useMutation({
    onSuccess: () => {
      toast({ title: 'BaleyBot Activated', description: 'The BaleyBot is now active.' });
      utils.baleybots.list.invalidate();
    },
    onError: (error) => {
      toast({ title: 'Activation Failed', description: error.message, variant: 'destructive' });
    },
  });

  const pauseMutation = trpc.baleybots.pause.useMutation({
    onSuccess: () => {
      toast({ title: 'BaleyBot Paused', description: 'The BaleyBot has been paused.' });
      utils.baleybots.list.invalidate();
    },
    onError: (error) => {
      toast({ title: 'Pause Failed', description: error.message, variant: 'destructive' });
    },
  });

  const deleteMutation = trpc.baleybots.delete.useMutation({
    onSuccess: () => {
      toast({ title: 'BaleyBot Deleted', description: 'The BaleyBot has been removed.' });
      utils.baleybots.list.invalidate();
    },
    onError: (error) => {
      toast({ title: 'Delete Failed', description: error.message, variant: 'destructive' });
    },
  });

  const handleExecute = (id: string) => {
    router.push(ROUTES.baleybots.detail(id));
  };

  const handleActivate = (id: string) => {
    const bb = baleybots?.find((b) => b.id === id);
    if (!bb) return;
    activateMutation.mutate({ id, version: bb.version });
  };

  const handlePause = (id: string) => {
    const bb = baleybots?.find((b) => b.id === id);
    if (!bb) return;
    pauseMutation.mutate({ id, version: bb.version });
  };

  const handleDelete = (id: string) => {
    deleteMutation.mutate({ id });
  };

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
                  version={bb.version}
                  executionCount={bb.executionCount ?? 0}
                  lastExecutedAt={
                    bb.lastExecutedAt ? new Date(bb.lastExecutedAt) : null
                  }
                  onExecute={handleExecute}
                  onActivate={handleActivate}
                  onPause={handlePause}
                  onDelete={handleDelete}
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
