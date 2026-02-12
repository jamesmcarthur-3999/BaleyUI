export function DetailSkeleton() {
  return (
    <div className="animate-pulse">
      <div className="h-10 bg-muted rounded w-1/3 mb-4" />
      <div className="h-4 bg-muted rounded w-2/3 mb-8" />
      <div className="h-96 bg-muted rounded-xl" />
    </div>
  );
}
