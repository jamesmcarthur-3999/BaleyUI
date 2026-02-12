'use client';

import { BarChart3 } from 'lucide-react';
import { DashboardErrorPage } from '@/components/errors/DashboardErrorPage';

export default function AnalyticsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <DashboardErrorPage
      error={error}
      reset={reset}
      area="analytics"
      title="Analytics Error"
      message={error.message || 'Failed to load analytics data.'}
      icon={BarChart3}
    />
  );
}
