'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { trpc } from '@/lib/trpc/client';
import { UserButton } from '@clerk/nextjs';
import { ThemeToggle } from '@/components/ThemeToggle';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Separator } from '@/components/ui/separator';
import { ROUTES, isActiveRoute } from '@/lib/routes';
import { cn } from '@/lib/utils';
import {
  Bot,
  Activity,
  Plug,
  Wrench,
  BarChart3,
  Settings,
  Key,
  Shield,
  PanelLeftClose,
  PanelLeft,
  Menu,
  X,
} from 'lucide-react';

// ============================================================================
// TYPES
// ============================================================================

interface NavItem {
  label: string;
  href: string;
  icon: typeof Bot;
}

// ============================================================================
// NAV CONFIG
// ============================================================================

const mainNav: NavItem[] = [
  { label: 'BaleyBots', href: ROUTES.baleybots.list, icon: Bot },
  { label: 'Activity', href: ROUTES.activity.list, icon: Activity },
];

const resourceNav: NavItem[] = [
  { label: 'Connections', href: ROUTES.connections.list, icon: Plug },
  { label: 'Tools', href: ROUTES.tools.list, icon: Wrench },
];

const bottomNav: NavItem[] = [
  { label: 'Analytics', href: ROUTES.analytics.overview, icon: BarChart3 },
  { label: 'Settings', href: ROUTES.settings.workspace, icon: Settings },
  { label: 'API Keys', href: ROUTES.settings.apiKeys, icon: Key },
];

const adminNav: NavItem[] = [
  { label: 'Admin Panel', href: ROUTES.admin.baleybots, icon: Shield },
];

const COLLAPSED_KEY = 'sidebar-collapsed';

// ============================================================================
// NAV LINK
// ============================================================================

function NavLink({
  item,
  isActive,
  collapsed,
}: {
  item: NavItem;
  isActive: boolean;
  collapsed: boolean;
}) {
  const Icon = item.icon;

  const link = (
    <Link
      href={item.href}
      className={cn(
        'flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors',
        'hover:bg-accent hover:text-accent-foreground',
        isActive
          ? 'bg-accent text-accent-foreground font-medium'
          : 'text-muted-foreground',
        collapsed && 'justify-center px-2'
      )}
    >
      <Icon className="h-4 w-4 shrink-0" />
      {!collapsed && <span className="truncate">{item.label}</span>}
    </Link>
  );

  if (collapsed) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>{link}</TooltipTrigger>
        <TooltipContent side="right" sideOffset={8}>
          {item.label}
        </TooltipContent>
      </Tooltip>
    );
  }

  return link;
}

// ============================================================================
// NAV GROUP
// ============================================================================

function NavGroup({
  items,
  pathname,
  collapsed,
}: {
  items: NavItem[];
  pathname: string;
  collapsed: boolean;
}) {
  return (
    <nav className="flex flex-col gap-1">
      {items.map((item) => (
        <NavLink
          key={item.href}
          item={item}
          isActive={isActiveRoute(pathname, item.href)}
          collapsed={collapsed}
        />
      ))}
    </nav>
  );
}

// ============================================================================
// SIDEBAR
// ============================================================================

export function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  // Persist collapsed state
  useEffect(() => {
    const stored = localStorage.getItem(COLLAPSED_KEY);
    if (stored === 'true') setCollapsed(true);
  }, []);

  const toggleCollapsed = () => {
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem(COLLAPSED_KEY, String(next));
  };

  // Close mobile drawer on navigation
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  const sidebarContent = (
    <div className="flex h-full flex-col">
      {/* Logo */}
      <div className={cn('flex items-center h-14 border-b px-4', collapsed && 'justify-center px-2')}>
        <Link
          href={ROUTES.dashboard}
          className="flex items-center gap-2 font-bold text-lg"
        >
          <span className="text-primary">B</span>
          {!collapsed && (
            <>
              <span className="text-primary">aley</span>
              <span>UI</span>
            </>
          )}
        </Link>
      </div>

      {/* Nav sections */}
      <div className="flex-1 overflow-y-auto px-3 py-4 space-y-6">
        <NavGroup items={mainNav} pathname={pathname} collapsed={collapsed} />

        <Separator />

        <NavGroup items={resourceNav} pathname={pathname} collapsed={collapsed} />

        <Separator />

        <NavGroup items={bottomNav} pathname={pathname} collapsed={collapsed} />

        {/* Admin section - conditionally rendered */}
        <AdminSection pathname={pathname} collapsed={collapsed} />
      </div>

      {/* Footer */}
      <div className={cn(
        'border-t p-3 space-y-2',
        collapsed && 'flex flex-col items-center'
      )}>
        {/* Collapse toggle - desktop only */}
        <div className="hidden md:block">
          <Button
            variant="ghost"
            size="sm"
            onClick={toggleCollapsed}
            className={cn('w-full justify-start gap-2', collapsed && 'justify-center px-2')}
          >
            {collapsed ? (
              <PanelLeft className="h-4 w-4" />
            ) : (
              <>
                <PanelLeftClose className="h-4 w-4" />
                <span>Collapse</span>
              </>
            )}
          </Button>
        </div>

        <div className={cn('flex items-center gap-2', collapsed ? 'flex-col' : 'justify-between')}>
          <UserButton afterSignOutUrl="/" />
          <ThemeToggle />
        </div>
      </div>
    </div>
  );

  return (
    <TooltipProvider delayDuration={0}>
      {/* Mobile hamburger */}
      <Button
        variant="ghost"
        size="icon"
        className="fixed top-3 left-3 z-50 md:hidden"
        onClick={() => setMobileOpen(!mobileOpen)}
        aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
      >
        {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
      </Button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-background/80 backdrop-blur-sm md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Mobile drawer */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 w-60 bg-background border-r transition-transform duration-300 md:hidden',
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        {sidebarContent}
      </aside>

      {/* Desktop sidebar */}
      <aside
        className={cn(
          'hidden md:flex flex-col h-screen bg-background border-r transition-[width] duration-200',
          collapsed ? 'w-16' : 'w-60'
        )}
      >
        {sidebarContent}
      </aside>
    </TooltipProvider>
  );
}

// ============================================================================
// ADMIN SECTION (conditional)
// ============================================================================

function AdminSection({
  pathname,
  collapsed,
}: {
  pathname: string;
  collapsed: boolean;
}) {
  const { data: isAdmin } = trpc.admin.isAdmin.useQuery(undefined, {
    retry: false,
  });

  if (!isAdmin) return null;

  return (
    <>
      <Separator />
      <NavGroup items={adminNav} pathname={pathname} collapsed={collapsed} />
    </>
  );
}
