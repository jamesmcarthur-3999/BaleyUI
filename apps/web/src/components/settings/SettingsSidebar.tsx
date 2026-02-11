'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { ROUTES, isActiveRoute } from '@/lib/routes';
import { Settings, User, Users, ShieldCheck } from 'lucide-react';

interface SettingsNavItem {
  label: string;
  href: string;
  icon: typeof Settings;
}

const settingsNav: SettingsNavItem[] = [
  { label: 'General', href: ROUTES.settings.general, icon: Settings },
  { label: 'Profile', href: ROUTES.settings.profile, icon: User },
  { label: 'Team', href: ROUTES.settings.team, icon: Users },
  { label: 'Approvals', href: ROUTES.settings.approvals, icon: ShieldCheck },
];

export function SettingsSidebar() {
  const pathname = usePathname();

  return (
    <>
      {/* Desktop: vertical sidebar */}
      <nav className="hidden md:flex flex-col gap-1 w-48 shrink-0">
        {settingsNav.map((item) => {
          const Icon = item.icon;
          const active = isActiveRoute(pathname, item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors',
                active
                  ? 'bg-muted font-medium text-foreground'
                  : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
              )}
            >
              <Icon className={cn('h-4 w-4', active && 'text-primary')} />
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Mobile: horizontal tabs */}
      <nav className="md:hidden flex gap-1 overflow-x-auto pb-2 -mx-1 px-1">
        {settingsNav.map((item) => {
          const Icon = item.icon;
          const active = isActiveRoute(pathname, item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs whitespace-nowrap transition-colors border',
                active
                  ? 'bg-muted border-border font-medium text-foreground'
                  : 'border-transparent text-muted-foreground hover:bg-muted/50'
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </>
  );
}
