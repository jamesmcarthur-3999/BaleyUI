import { Skeleton } from '@/components/ui/skeleton';

export default function Loading() {
  return (
    <div className="container py-10">
      <div className="flex flex-col gap-8">
        {/* Header */}
        <div>
          <Skeleton className="h-8 w-32 mb-2" />
          <Skeleton className="h-4 w-64" />
        </div>

        {/* Filter bar */}
        <div className="flex items-center gap-3">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-10 w-[140px]" />
        </div>

        {/* List rows */}
        <div className="rounded-xl border bg-card">
          <div className="p-4 border-b">
            <Skeleton className="h-5 w-40" />
          </div>
          <div className="divide-y">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={`activity-skel-${i}`} className="flex items-center gap-4 p-4">
                <Skeleton className="h-10 w-10 rounded-lg shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1.5">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-5 w-20 rounded-full" />
                  </div>
                  <Skeleton className="h-3 w-48" />
                </div>
                <Skeleton className="h-4 w-4 shrink-0" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
