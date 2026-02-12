'use client';

import { DashboardErrorPage } from '@/components/errors/DashboardErrorPage';

export default function AdminError({
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
      area="admin"
      message="An unexpected error occurred in the admin panel."
    />
  );
}
