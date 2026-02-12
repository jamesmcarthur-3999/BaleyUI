'use client';

import { DashboardErrorPage } from '@/components/errors/DashboardErrorPage';

export default function ToolsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <DashboardErrorPage error={error} reset={reset} area="tools" />;
}
