'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { trpc } from '@/lib/trpc/client';
import { Shield, Loader2, LayoutDashboard, Users, Monitor, Bot, Bug, Cpu } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ROUTES } from '@/lib/routes';

const adminTabs = [
  { label: 'Overview', href: ROUTES.admin.overview, icon: LayoutDashboard },
  { label: 'Users', href: ROUTES.admin.users, icon: Users },
  { label: 'Sessions', href: ROUTES.admin.sessions, icon: Monitor },
  { label: 'BaleyBots', href: ROUTES.admin.baleybots, icon: Bot },
  { label: 'Platform Issues', href: ROUTES.admin.platformIssues, icon: Bug },
  { label: 'Models', href: ROUTES.admin.models, icon: Cpu },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { data: isAdmin, isLoading, error } = trpc.admin.isAdmin.useQuery(undefined, {
    retry: false,
  });

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !isAdmin) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="max-w-md w-full text-center">
          <Shield className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <h2 className="text-xl font-semibold mb-2">Access Denied</h2>
          <p className="text-muted-foreground">
            You do not have admin privileges to access this page.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 space-y-6">
      {/* Tab navigation */}
      <div className="border-b border-border/60">
        <nav className="flex gap-1 -mb-px" aria-label="Admin navigation">
          {adminTabs.map((tab) => {
            const isActive = tab.href === ROUTES.admin.overview
              ? pathname === tab.href
              : pathname.startsWith(tab.href);
            const Icon = tab.icon;

            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={cn(
                  'flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors',
                  isActive
                    ? 'border-primary text-foreground'
                    : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
                )}
              >
                <Icon className="h-4 w-4" />
                {tab.label}
              </Link>
            );
          })}
        </nav>
      </div>

      {children}
    </div>
  );
}
