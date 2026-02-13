'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { trpc } from '@/lib/trpc/client';
import { authClient } from '@/lib/auth/client';
import { ThemeToggle } from '@/components/ThemeToggle';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Separator } from '@/components/ui/separator';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ROUTES, isActiveRoute } from '@/lib/routes';
import { cn } from '@/lib/utils';
import {
  Bot,
  Activity,
  Sparkles,
  Plug,
  Wrench,
  BarChart3,
  Settings,
  Key,
  Shield,
  BookOpen,
  PanelLeftClose,
  PanelLeft,
  Menu,
  X,
  LogOut,
  User,
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
  { label: 'Actions', href: ROUTES.actions.list, icon: Sparkles },
];

const capabilitiesNav: NavItem[] = [
  { label: 'Tools', href: ROUTES.capabilities.tools, icon: Wrench },
  { label: 'Connections', href: ROUTES.capabilities.connections, icon: Plug },
  { label: 'API Keys', href: ROUTES.capabilities.apiKeys, icon: Key },
];

const bottomNav: NavItem[] = [
  { label: 'Analytics', href: ROUTES.analytics.overview, icon: BarChart3 },
  { label: 'Shared Context', href: ROUTES.sharedContext, icon: BookOpen },
  { label: 'Settings', href: ROUTES.settings.general, icon: Settings },
];

const adminNav: NavItem[] = [
  { label: 'Admin Panel', href: ROUTES.admin.overview, icon: Shield },
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
        'group flex items-center gap-3 rounded-xl border px-3 py-2 text-sm transition-all',
        'border-transparent hover:border-border/70 hover:bg-muted/45 hover:text-foreground',
        isActive
          ? 'border-primary/20 bg-primary/8 text-foreground font-medium'
          : 'text-muted-foreground',
        collapsed && 'justify-center px-2'
      )}
    >
      <Icon className={cn('h-4 w-4 shrink-0', isActive ? 'text-primary' : 'group-hover:text-foreground')} />
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
  label,
  items,
  pathname,
  collapsed,
}: {
  label?: string;
  items: NavItem[];
  pathname: string;
  collapsed: boolean;
}) {
  return (
    <nav className="flex flex-col gap-1.5">
      {!collapsed && label && (
        <p className="px-1 text-[10px] uppercase tracking-wide text-muted-foreground/80 font-semibold">
          {label}
        </p>
      )}
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
    <div className="flex h-full flex-col bg-background/95">
      {/* Logo */}
      <div className={cn('flex items-center h-14 border-b border-border/60 px-4', collapsed && 'justify-center px-2')}>
        <Link
          href={ROUTES.dashboard}
          className="flex items-center gap-2 font-bold text-lg tracking-tight"
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
      <div className="flex-1 overflow-y-auto px-3 py-4 space-y-5">
        <NavGroup label="Build" items={mainNav} pathname={pathname} collapsed={collapsed} />

        <Separator className="bg-border/60" />

        <NavGroup label="Integrations" items={capabilitiesNav} pathname={pathname} collapsed={collapsed} />

        <Separator className="bg-border/60" />

        <NavGroup label="Workspace" items={bottomNav} pathname={pathname} collapsed={collapsed} />

        {/* Admin section - conditionally rendered */}
        <AdminSection pathname={pathname} collapsed={collapsed} />
      </div>

      {/* Footer */}
      <div className={cn(
        'border-t border-border/60 p-3 space-y-2',
        collapsed && 'flex flex-col items-center'
      )}>
        {/* Collapse toggle - desktop only */}
        <div className="hidden md:block">
          <Button
            variant="ghost"
            size="sm"
            onClick={toggleCollapsed}
            className={cn('w-full justify-start gap-2', collapsed && 'justify-center px-2')}
            aria-label="Toggle sidebar"
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
          <UserMenu collapsed={collapsed} />
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
// USER MENU
// ============================================================================

function UserMenu({ collapsed }: { collapsed: boolean }) {
  const { data: sessionData } = authClient.useSession();

  const handleSignOut = async () => {
    await authClient.signOut();
    window.location.href = '/';
  };

  const initials = sessionData?.user?.name
    ? sessionData.user.name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)
    : '?';

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full">
          <div className="h-7 w-7 rounded-full bg-gradient-to-br from-primary/15 to-accent/15 ring-1 ring-primary/20 flex items-center justify-center text-xs font-medium text-primary">
            {initials}
          </div>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={collapsed ? 'center' : 'start'} side="top" className="w-52">
        <div className="px-2 py-1.5">
          <p className="text-sm font-medium truncate">{sessionData?.user?.name || 'User'}</p>
          <p className="text-xs text-muted-foreground truncate">{sessionData?.user?.email}</p>
        </div>
        <Separator className="my-1" />
        <DropdownMenuItem onClick={() => window.location.href = ROUTES.settings.profile}>
          <User className="mr-2 h-4 w-4" />
          Profile
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handleSignOut}>
          <LogOut className="mr-2 h-4 w-4" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
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
      <Separator className="bg-border/60" />
      <NavGroup label="Admin" items={adminNav} pathname={pathname} collapsed={collapsed} />
    </>
  );
}
