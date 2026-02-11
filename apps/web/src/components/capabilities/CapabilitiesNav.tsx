'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { ROUTES, isActiveRoute } from '@/lib/routes';
import { Wrench, Plug, Key } from 'lucide-react';
import { trpc } from '@/lib/trpc/client';

interface CapNavItem {
  label: string;
  href: string;
  icon: typeof Wrench;
  countKey: 'tools' | 'connections' | 'apiKeys';
}

const navItems: CapNavItem[] = [
  { label: 'Tools', href: ROUTES.capabilities.tools, icon: Wrench, countKey: 'tools' },
  { label: 'Connections', href: ROUTES.capabilities.connections, icon: Plug, countKey: 'connections' },
  { label: 'API Keys', href: ROUTES.capabilities.apiKeys, icon: Key, countKey: 'apiKeys' },
];

export function CapabilitiesNav() {
  const pathname = usePathname();
  const { data: toolsData } = trpc.tools.list.useQuery(undefined, { staleTime: 30_000 });
  const { data: connectionsData } = trpc.connections.list.useQuery(undefined, { staleTime: 30_000 });
  const { data: apiKeysData } = trpc.apiKeys.list.useQuery(undefined, { staleTime: 30_000 });

  const counts: Record<string, number | undefined> = {
    tools: toolsData ? (Array.isArray(toolsData) ? toolsData.length : 0) : undefined,
    connections: connectionsData ? (Array.isArray(connectionsData) ? connectionsData.length : 0) : undefined,
    apiKeys: apiKeysData ? (Array.isArray(apiKeysData) ? apiKeysData.length : 0) : undefined,
  };

  return (
    <div className="flex items-center gap-1 bg-muted/50 rounded-lg p-1 w-fit mb-6">
      {navItems.map(({ label, href, icon: Icon, countKey }) => {
        const active = isActiveRoute(pathname, href);
        const count = counts[countKey];

        return (
          <Link
            key={href}
            href={href}
            className={cn(
              'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors',
              active
                ? 'bg-background text-foreground font-medium shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            <span>{label}</span>
            {count !== undefined && (
              <span
                className={cn(
                  'ml-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-medium leading-none',
                  active
                    ? 'bg-primary/10 text-primary'
                    : 'bg-muted text-muted-foreground'
                )}
              >
                {count}
              </span>
            )}
          </Link>
        );
      })}
    </div>
  );
}
