import { Skeleton } from '@/components/ui/skeleton';

export function DashboardSkeleton() {
  return (
    <div className="container py-8 md:py-10">
      <div className="flex flex-col gap-6 md:gap-8">
        {/* Header */}
        <div>
          <Skeleton className="h-8 w-48 mb-2" />
          <Skeleton className="h-4 w-64" />
        </div>

        {/* Filter bar */}
        <div className="flex items-center gap-3">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-10 w-24" />
          <Skeleton className="h-10 w-24" />
        </div>

        {/* Card grid */}
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={`dash-skel-${i}`} className="rounded-2xl border bg-card p-5">
              {/* Status bar */}
              <Skeleton className="h-1 w-full rounded-full mb-4" />
              <div className="flex items-start gap-4">
                {/* Icon circle */}
                <Skeleton className="h-12 w-12 rounded-2xl shrink-0" />
                <div className="flex-1 min-w-0">
                  {/* Title + badge */}
                  <div className="flex items-center gap-2 mb-2">
                    <Skeleton className="h-5 w-32" />
                    <Skeleton className="h-5 w-16 rounded-full" />
                  </div>
                  {/* Description lines */}
                  <Skeleton className="h-3 w-full mb-1.5" />
                  <Skeleton className="h-3 w-3/4 mb-3" />
                  {/* Stats row */}
                  <div className="flex items-center gap-4">
                    <Skeleton className="h-3 w-16" />
                    <Skeleton className="h-3 w-20" />
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
