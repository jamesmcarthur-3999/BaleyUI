'use client';

import { UserButton } from '@clerk/nextjs';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { WorkspaceGuard } from '@/components/WorkspaceGuard';
import { ThemeToggle } from '@/components/ThemeToggle';
import { cn } from '@/lib/utils';
import { ROUTES } from '@/lib/routes';
import { Bot, Activity, Settings } from 'lucide-react';

const navLinks = [
  { href: ROUTES.dashboard, label: 'BaleyBots', icon: Bot },
  { href: ROUTES.activity.list, label: 'Activity', icon: Activity },
  { href: ROUTES.settings.root, label: 'Settings', icon: Settings },
];

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <WorkspaceGuard>
      <div className="flex min-h-screen flex-col bg-background">
        {/* Top Navigation */}
        <header className="sticky top-0 z-50 w-full border-b border-border/50 bg-background/80 backdrop-blur-xl">
          <div className="mx-auto flex h-16 max-w-7xl items-center px-6 lg:px-8">
            {/* Logo */}
            <Link href={ROUTES.dashboard} className="mr-8 flex items-center gap-2 group">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-primary to-accent flex items-center justify-center">
                <Bot className="h-4 w-4 text-white" />
              </div>
              <span className="font-bold text-lg">
                <span className="text-gradient">Baley</span>
                <span className="text-foreground">UI</span>
              </span>
            </Link>

            {/* Nav Links */}
            <nav className="flex flex-1 items-center gap-1">
              {navLinks.map((link) => {
                const Icon = link.icon;
                const isActive = pathname === link.href ||
                  (link.href !== ROUTES.dashboard && pathname.startsWith(link.href));

                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    className={cn(
                      'flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200',
                      isActive
                        ? 'bg-primary/10 text-primary'
                        : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    {link.label}
                  </Link>
                );
              })}
            </nav>

            {/* Right side */}
            <div className="flex items-center gap-3">
              <ThemeToggle />
              <div className="h-8 w-px bg-border/50" />
              <UserButton
                afterSignOutUrl="/"
                appearance={{
                  elements: {
                    avatarBox: 'w-9 h-9 ring-2 ring-primary/20 ring-offset-2 ring-offset-background',
                  },
                }}
              />
            </div>
          </div>
        </header>

        {/* Main Content with proper padding */}
        <main className="flex-1">
          {children}
        </main>
      </div>
    </WorkspaceGuard>
  );
}
