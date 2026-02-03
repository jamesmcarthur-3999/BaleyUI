import { DashboardLayoutClient } from './DashboardLayoutClient';

/**
 * Force dynamic rendering for all dashboard routes.
 * This prevents static generation errors when env vars (like Clerk keys) are missing.
 */
export const dynamic = 'force-dynamic';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <DashboardLayoutClient>{children}</DashboardLayoutClient>;
}
