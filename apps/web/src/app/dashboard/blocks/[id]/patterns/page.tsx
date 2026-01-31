'use client';

import { useParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { trpc } from '@/lib/trpc/client';
import Link from 'next/link';
import { PatternAnalyzerPanel } from '@/components/patterns/PatternAnalyzerPanel';
import { ROUTES } from '@/lib/routes';

/**
 * Pattern analysis page for a specific block.
 * Displays pattern extraction and analysis tools.
 */
export default function BlockPatternsPage() {
  const params = useParams();
  const blockId = params.id as string;

  // Fetch block info for header
  const { data: block, isLoading, error } = trpc.blocks.getById.useQuery(
    { id: blockId },
    { enabled: !!blockId }
  );

  if (isLoading) {
    return (
      <div className="container py-10">
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  if (error || !block) {
    return (
      <div className="container py-10">
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <h3 className="text-lg font-semibold">Block Not Found</h3>
          <p className="mt-1 text-sm text-muted-foreground max-w-sm">
            The block you&apos;re looking for doesn&apos;t exist or you
            don&apos;t have access to it.
          </p>
          <Link href={ROUTES.blocks.list}>
            <Button className="mt-4" variant="outline">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Blocks
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="container py-10">
      {/* Header with navigation */}
      <div className="mb-8">
        <Link href={ROUTES.blocks.detail(blockId)}>
          <Button variant="ghost" size="sm" className="mb-4">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Block
          </Button>
        </Link>

        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">{block.name}</h1>
            {block.description && (
              <p className="mt-2 text-muted-foreground">{block.description}</p>
            )}
          </div>
        </div>
      </div>

      {/* Pattern analyzer panel */}
      <PatternAnalyzerPanel blockId={blockId} />
    </div>
  );
}
