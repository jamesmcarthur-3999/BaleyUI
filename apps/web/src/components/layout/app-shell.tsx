'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { KeyboardShortcut } from '@/components/ui/kbd';
import {
  CompanionContainer,
  CommandPalette,
  useCommandPalette,
  ChatMode,
} from '@/components/companion';
import { Toaster } from '@/components/ui/toaster';
import { Sidebar } from './sidebar';
import { useBreadcrumbs } from './breadcrumb-context';

interface AppShellProps {
  children: React.ReactNode;
}

function AppShell({ children }: AppShellProps) {
  const commandPalette = useCommandPalette();
  const { breadcrumbs } = useBreadcrumbs();
  const pathname = usePathname();
  const hideCompanion = pathname?.startsWith('/dashboard/baleybots/');

  return (
    <div className="flex h-screen">
      {/* Sidebar */}
      <Sidebar />

      {/* Main area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Simplified header — no logo (in sidebar), no user/theme (in sidebar footer) */}
        <header className="sticky top-0 z-30 w-full border-b bg-background">
          <div className="flex h-14 items-center justify-between px-4 md:px-6">
            {/* Spacer for mobile hamburger */}
            <div className="w-10 md:hidden" />

            {/* Breadcrumbs (inline in header) */}
            {breadcrumbs && breadcrumbs.length > 0 ? (
              <nav className="flex-1 min-w-0" aria-label="Breadcrumb">
                <ol className="flex items-center gap-2 text-sm">
                  {breadcrumbs.map((crumb, index) => (
                    <li key={crumb.label} className="flex items-center gap-2">
                      {index > 0 && (
                        <span className="text-muted-foreground">/</span>
                      )}
                      {crumb.href ? (
                        <Link
                          href={crumb.href}
                          className="text-muted-foreground hover:text-foreground transition-colors"
                        >
                          {crumb.label}
                        </Link>
                      ) : (
                        <span className="font-medium">{crumb.label}</span>
                      )}
                    </li>
                  ))}
                </ol>
              </nav>
            ) : (
              <div className="flex-1" />
            )}

            {/* Command Palette Trigger */}
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => commandPalette.open()}
                className="hidden sm:flex items-center gap-2 text-muted-foreground"
              >
                <span>Search...</span>
                <KeyboardShortcut shortcut="mod+k" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => commandPalette.open()}
                className="sm:hidden"
                aria-label="Open command palette"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <circle cx="11" cy="11" r="8" />
                  <path d="m21 21-4.3-4.3" />
                </svg>
              </Button>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="flex-1 overflow-auto">{children}</main>
      </div>

      {/* AI Companion — hidden on baleybot pages to avoid competing with creator chat */}
      {!hideCompanion && (
        <CompanionContainer defaultMode="orb" position="bottom-right">
          <ChatMode />
        </CompanionContainer>
      )}

      {/* Command Palette */}
      <CommandPalette
        open={commandPalette.isOpen}
        onOpenChange={commandPalette.setIsOpen}
      />

      {/* Toast Notifications */}
      <Toaster />
    </div>
  );
}

AppShell.displayName = 'AppShell';

export { AppShell, type AppShellProps };
