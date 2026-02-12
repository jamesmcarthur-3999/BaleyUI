'use client';

import { Bot } from 'lucide-react';
import { DashboardErrorPage } from '@/components/errors/DashboardErrorPage';

export default function BaleyBotsError({
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
      area="baleybots"
      title="BaleyBots Error"
      message={error.message || 'Failed to load BaleyBots.'}
      icon={Bot}
    />
  );
}
