import { Skeleton } from '@/components/ui/skeleton';

export default function Loading() {
  return (
    <div className="container py-10">
      <div className="flex flex-col gap-8 max-w-2xl">
        {/* Header */}
        <div>
          <Skeleton className="h-8 w-32 mb-2" />
          <Skeleton className="h-4 w-72" />
        </div>

        {/* Form fields */}
        <div className="space-y-6">
          {[1, 2, 3].map((i) => (
            <div key={`settings-skel-${i}`} className="space-y-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-10 w-full" />
            </div>
          ))}
        </div>

        {/* Save button */}
        <Skeleton className="h-10 w-24" />
      </div>
    </div>
  );
}
