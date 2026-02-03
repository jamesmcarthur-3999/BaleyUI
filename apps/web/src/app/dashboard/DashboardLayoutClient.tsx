'use client';

import { WorkspaceGuard } from '@/components/WorkspaceGuard';
import { AppShell, BreadcrumbProvider } from '@/components/layout';

export function DashboardLayoutClient({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <WorkspaceGuard>
      <BreadcrumbProvider>
        <AppShell>{children}</AppShell>
      </BreadcrumbProvider>
    </WorkspaceGuard>
  );
}
