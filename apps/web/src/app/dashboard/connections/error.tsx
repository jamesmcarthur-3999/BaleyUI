'use client';

import { Link2 } from 'lucide-react';
import { DashboardErrorPage } from '@/components/errors/DashboardErrorPage';

export default function ConnectionsError({
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
      area="connections"
      title="Connections Error"
      message={error.message || 'Failed to load connections.'}
      icon={Link2}
    />
  );
}
