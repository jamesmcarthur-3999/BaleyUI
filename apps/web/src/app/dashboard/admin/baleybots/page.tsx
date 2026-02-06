'use client';

import Link from 'next/link';
import { trpc } from '@/lib/trpc/client';
import { ROUTES } from '@/lib/routes';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { Bot, Play, Clock, Shield, Pencil } from 'lucide-react';

export default function AdminBaleybotsPage() {
  const { data: baleybots, isLoading } = trpc.admin.listInternalBaleybots.useQuery();

  return (
    <div className="container py-10">
      <div className="flex flex-col gap-8">
        {/* Header */}
        <div>
          <div className="flex items-center gap-3 mb-2">
            <Shield className="h-6 w-6 text-primary" />
            <h1 className="text-3xl font-bold tracking-tight">Internal BaleyBots</h1>
          </div>
          <p className="text-muted-foreground">
            System-managed BaleyBots that power the platform. Edit BAL code, test execution, and manage customizations.
          </p>
        </div>

        {/* Grid */}
        {isLoading ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-48 rounded-2xl" />
            ))}
          </div>
        ) : baleybots && baleybots.length > 0 ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {baleybots.map((bb) => (
              <Link key={bb.id} href={ROUTES.admin.baleybot(bb.id)}>
                <div className="card-playful group relative cursor-pointer rounded-2xl overflow-hidden">
                  {/* Status bar */}
                  <div className={cn(
                    'h-1 transition-[height] duration-300 group-hover:h-1.5',
                    'bg-gradient-to-r from-violet-400 to-violet-500'
                  )} />

                  <div className="p-5">
                    <div className="flex items-start gap-4">
                      {/* Icon */}
                      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500/10 to-primary/10 text-2xl shrink-0 transition-transform duration-300 group-hover:scale-110 group-hover:rotate-3">
                        {bb.icon || '🤖'}
                      </div>

                      <div className="flex-1 min-w-0">
                        {/* Header */}
                        <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                          <h3 className="font-semibold text-base truncate transition-colors group-hover:text-primary">
                            {bb.name}
                          </h3>
                          <Badge variant="secondary" className="bg-violet-500/10 text-violet-600 border-violet-500/20">
                            <Bot className="h-3 w-3 mr-1" />
                            System
                          </Badge>
                          {bb.adminEdited ? (
                            <Badge variant="outline" className="text-amber-600 border-amber-500/30">
                              <Pencil className="h-3 w-3 mr-1" />
                              Customized
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-emerald-600 border-emerald-500/30">
                              Default
                            </Badge>
                          )}
                        </div>

                        {/* Description */}
                        {bb.description && (
                          <p className="text-sm text-muted-foreground line-clamp-2 mb-3">
                            {bb.description}
                          </p>
                        )}

                        {/* Footer stats */}
                        <div className="flex items-center gap-4 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1.5">
                            <Play className="h-3.5 w-3.5" />
                            <span className="font-medium">{bb.executionCount}</span> runs
                          </span>
                          {bb.lastExecutedAt && (
                            <span className="flex items-center gap-1.5">
                              <Clock className="h-3.5 w-3.5" />
                              {new Date(bb.lastExecutedAt).toLocaleDateString()}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="text-center py-16">
            <Bot className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">No Internal BaleyBots Found</h3>
            <p className="text-muted-foreground">
              Internal BaleyBots are auto-seeded on first use. Try creating a BaleyBot or running a search.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
