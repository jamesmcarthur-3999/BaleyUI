'use client';

import Link from 'next/link';
import { trpc } from '@/lib/trpc/client';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

import { Wrench, Plus, Cog, Calendar } from 'lucide-react';

/**
 * Format a date for display in tool cards.
 */
function formatDate(date: Date | string): string {
  return new Date(date).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/**
 * Tools management page.
 *
 * Lists all workspace tools with their name, description,
 * generated status, and creation date.
 */
export default function ToolsPage() {
  const { data: tools, isLoading } = trpc.tools.list.useQuery();

  return (
    <div className="container py-10">
      <div className="flex flex-col gap-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Tools</h1>
            <p className="text-muted-foreground">
              Manage workspace tools for your BaleyBots
            </p>
          </div>
          <Button asChild>
            <Link href="#">
              <Plus className="h-4 w-4 mr-2" />
              Create Tool
            </Link>
          </Button>
        </div>

        {/* Tools Grid */}
        {isLoading ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <Skeleton key={i} className="h-40" />
            ))}
          </div>
        ) : tools && tools.length > 0 ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {tools.map((tool) => (
              <Card key={tool.id} variant="interactive">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <Cog className="h-5 w-5 text-muted-foreground shrink-0" />
                      <CardTitle className="truncate text-base">
                        {tool.name}
                      </CardTitle>
                    </div>
                    {tool.isGenerated && (
                      <Badge variant="secondary" className="shrink-0">
                        Generated
                      </Badge>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground line-clamp-2 mb-3">
                    {tool.description}
                  </p>
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Calendar className="h-3.5 w-3.5" />
                    <span>{formatDate(tool.createdAt)}</span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <EmptyState
            icon={Wrench}
            title="No tools yet"
            description="Create custom tools to extend what your BaleyBots can do."
          />
        )}
      </div>
    </div>
  );
}
