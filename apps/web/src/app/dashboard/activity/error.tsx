'use client';

import { Activity } from 'lucide-react';
import { DashboardErrorPage } from '@/components/errors/DashboardErrorPage';

export default function ActivityError({
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
      area="activity"
      title="Activity Error"
      message={error.message || 'Failed to load activity.'}
      icon={Activity}
    />
  );
}
