'use client';

import { UserButton } from '@clerk/nextjs';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { WorkspaceGuard } from '@/components/WorkspaceGuard';
import { ThemeToggle } from '@/components/ThemeToggle';
import { cn } from '@/lib/utils';
import { ROUTES } from '@/lib/routes';

const navLinks = [
  { href: ROUTES.dashboard, label: 'Dashboard' },
  { href: ROUTES.blocks.list, label: 'Blocks' },
  { href: ROUTES.flows.list, label: 'Flows' },
  { href: ROUTES.executions.list, label: 'Executions' },
  { href: ROUTES.decisions.list, label: 'Decisions' },
  { href: ROUTES.analytics.overview, label: 'Analytics' },
  { href: ROUTES.settings.root, label: 'Settings' },
];

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <WorkspaceGuard>
      <div className="flex min-h-screen flex-col">
        {/* Top Navigation */}
        <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
          <div className="container flex h-14 items-center">
            <Link href={ROUTES.dashboard} className="mr-6 flex items-center space-x-2">
              <span className="font-bold">
                <span className="text-primary">Baley</span>UI
              </span>
            </Link>
            <nav className="flex flex-1 items-center space-x-6 text-sm font-medium">
              {navLinks.map((link) => {
                const isActive = pathname === link.href ||
                  (link.href !== ROUTES.dashboard && pathname.startsWith(link.href));

                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    className={cn(
                      'transition-colors hover:text-foreground/80',
                      isActive ? 'text-foreground' : 'text-foreground/60'
                    )}
                  >
                    {link.label}
                  </Link>
                );
              })}
            </nav>
            <div className="flex items-center space-x-2">
              <ThemeToggle />
              <UserButton afterSignOutUrl="/" />
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="flex-1">{children}</main>
      </div>
    </WorkspaceGuard>
  );
}
