export function DashboardSkeleton() {
  return (
    <div className="animate-pulse">
      <div className="h-8 bg-muted rounded w-1/4 mb-8" />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {[1, 2, 3].map(i => (
          <div key={`dashboard-skeleton-card-${i}`} className="h-48 bg-muted rounded-xl" />
        ))}
      </div>
    </div>
  );
}
