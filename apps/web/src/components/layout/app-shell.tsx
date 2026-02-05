'use client';

import * as React from 'react';
import Link from 'next/link';
import { UserButton } from '@clerk/nextjs';
import { ThemeToggle } from '@/components/ThemeToggle';
import { Button } from '@/components/ui/button';
import { KeyboardShortcut } from '@/components/ui/kbd';
import {
  CompanionContainer,
  CommandPalette,
  useCommandPalette,
  ChatMode,
} from '@/components/companion';
import { Toaster } from '@/components/ui/toaster';
import { ROUTES } from '@/lib/routes';
import { useBreadcrumbs } from './breadcrumb-context';

interface AppShellProps {
  children: React.ReactNode;
}

function AppShell({ children }: AppShellProps) {
  const commandPalette = useCommandPalette();
  const { breadcrumbs } = useBreadcrumbs();

  return (
    <div className="min-h-screen flex flex-col">
      {/* Minimal Top Navigation */}
      <header className="sticky top-0 z-40 w-full border-b bg-background">
        <div className="container max-w-4xl mx-auto flex h-14 items-center justify-between">
          {/* Logo */}
          <Link
            href={ROUTES.dashboard}
            className="flex items-center gap-2 font-bold text-lg"
          >
            <span className="text-primary">Baley</span>
            <span>UI</span>
          </Link>

          {/* Command Palette Trigger + User Actions */}
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => commandPalette.open()}
              className="hidden sm:flex items-center gap-2 text-muted-foreground"
            >
              <span>Search or run commands...</span>
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
            <ThemeToggle />
            <UserButton afterSignOutUrl="/" />
          </div>
        </div>
      </header>

      {/* Breadcrumbs */}
      {breadcrumbs && breadcrumbs.length > 0 && (
        <nav className="container max-w-4xl mx-auto py-2 border-b" aria-label="Breadcrumb">
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
      )}

      {/* Main Content */}
      <main className="flex-1">{children}</main>

      {/* AI Companion */}
      <CompanionContainer defaultMode="orb" position="bottom-right">
        <ChatMode />
      </CompanionContainer>

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
