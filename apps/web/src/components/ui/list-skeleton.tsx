import * as React from 'react';

import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';

export interface ListSkeletonProps {
  count?: number;
  variant?: 'card' | 'row' | 'table';
  className?: string;
}

function CardSkeleton() {
  return (
    <div className="rounded-lg border bg-card p-6 space-y-3">
      <div className="flex items-start justify-between">
        <div className="space-y-2 flex-1">
          <Skeleton className="h-5 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
        </div>
        <Skeleton className="h-6 w-20 rounded-full" />
      </div>
      <Skeleton className="h-4 w-full" />
      <div className="flex items-center gap-2 pt-2">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-3 w-32" />
      </div>
    </div>
  );
}

function RowSkeleton() {
  return (
    <div className="flex items-center justify-between py-4 border-b last:border-0">
      <div className="flex items-center gap-4 flex-1">
        <Skeleton className="h-10 w-10 rounded-full" />
        <div className="space-y-2 flex-1">
          <Skeleton className="h-4 w-1/3" />
          <Skeleton className="h-3 w-1/4" />
        </div>
      </div>
      <div className="flex items-center gap-3">
        <Skeleton className="h-6 w-20 rounded-full" />
        <Skeleton className="h-8 w-8 rounded" />
      </div>
    </div>
  );
}

function TableRowSkeleton() {
  return (
    <div className="flex items-center gap-4 py-3 border-b last:border-0">
      <Skeleton className="h-4 w-4 rounded" />
      <Skeleton className="h-4 w-1/4" />
      <Skeleton className="h-4 w-1/6" />
      <Skeleton className="h-4 w-1/5" />
      <Skeleton className="h-6 w-20 rounded-full" />
      <Skeleton className="h-8 w-20" />
    </div>
  );
}

function ListSkeleton({
  count = 5,
  variant = 'card',
  className,
}: ListSkeletonProps) {
  const SkeletonComponent =
    variant === 'card'
      ? CardSkeleton
      : variant === 'row'
        ? RowSkeleton
        : TableRowSkeleton;

  return (
    <div
      className={cn(
        variant === 'card' && 'space-y-4',
        variant === 'row' && 'divide-y',
        variant === 'table' && 'space-y-0',
        className
      )}
    >
      {Array.from({ length: count }).map((_, index) => (
        <SkeletonComponent key={index} />
      ))}
    </div>
  );
}

export { ListSkeleton };
