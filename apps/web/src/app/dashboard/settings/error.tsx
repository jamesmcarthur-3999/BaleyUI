'use client';

import { Settings } from 'lucide-react';
import { DashboardErrorPage } from '@/components/errors/DashboardErrorPage';

export default function SettingsError({
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
      area="settings"
      title="Settings Error"
      message={error.message || 'Failed to load settings.'}
      icon={Settings}
    />
  );
}
