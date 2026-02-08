import { Skeleton } from '@/components/ui/skeleton';

export default function Loading() {
  return (
    <div className="container py-8 md:py-10">
      <div className="flex flex-col gap-6 md:gap-8">
        <div className="flex items-end justify-between">
          <div className="space-y-2">
            <Skeleton className="h-9 w-44" />
            <Skeleton className="h-4 w-80" />
          </div>
          <Skeleton className="h-10 w-36" />
        </div>

        <Skeleton className="h-52 rounded-2xl" />

        <div className="grid gap-6 lg:grid-cols-[270px_minmax(0,1fr)]">
          <div className="space-y-4">
            <Skeleton className="h-44 rounded-2xl" />
            <Skeleton className="h-72 rounded-2xl" />
            <Skeleton className="h-24 rounded-2xl" />
          </div>

          <div className="space-y-4">
            <Skeleton className="h-24 rounded-2xl" />
            <div className="space-y-2 rounded-2xl border border-border/60 bg-card p-3">
              {[1, 2, 3, 4, 5].map((value) => (
                <Skeleton key={value} className="h-14" />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
