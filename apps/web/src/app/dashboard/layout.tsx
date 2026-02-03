'use client';

import { WorkspaceGuard } from '@/components/WorkspaceGuard';
import { AppShell, BreadcrumbProvider } from '@/components/layout';

export default function DashboardLayout({
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
