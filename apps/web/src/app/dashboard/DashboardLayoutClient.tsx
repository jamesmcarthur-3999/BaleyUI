'use client';

import { WorkspaceGuard } from '@/components/WorkspaceGuard';
import { AppShell, BreadcrumbProvider } from '@/components/layout';
import { BaleyProvider } from '@/providers/BaleyProvider';

export function DashboardLayoutClient({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <WorkspaceGuard>
      <BreadcrumbProvider>
        <BaleyProvider>
          <AppShell>{children}</AppShell>
        </BaleyProvider>
      </BreadcrumbProvider>
    </WorkspaceGuard>
  );
}
