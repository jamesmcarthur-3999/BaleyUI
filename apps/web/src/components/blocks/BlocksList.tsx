'use client';

import { BlockCard } from './BlockCard';
import { EmptyState } from '@/components/ui/empty-state';
import { ListSkeleton } from '@/components/ui/list-skeleton';
import { Blocks } from 'lucide-react';

interface Block {
  id: string;
  type: string;
  name: string;
  version: number;
  description: string | null;
  executionCount: number | null;
  lastExecutedAt: Date | null;
  model: string | null;
  createdAt: Date;
  updatedAt?: Date;
}

interface BlocksListProps {
  blocks: Block[];
  isLoading?: boolean;
}

export function BlocksList({ blocks, isLoading }: BlocksListProps) {
  if (isLoading) {
    return <ListSkeleton variant="card" count={6} />;
  }

  if (!blocks || blocks.length === 0) {
    return (
      <EmptyState
        icon={Blocks}
        title="No blocks yet"
        description="Get started by creating your first block. Blocks are reusable components that can be used in flows or run independently."
      />
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {blocks.map((block) => (
        <BlockCard key={block.id} block={block} />
      ))}
    </div>
  );
}
