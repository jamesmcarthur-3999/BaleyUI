'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { trpc } from '@/lib/trpc/client';
import { Loader2 } from 'lucide-react';
import { ROUTES } from '@/lib/routes';

interface WorkspaceGuardProps {
  children: React.ReactNode;
}

/**
 * Client component that checks if user has a workspace.
 * Redirects to onboarding if no workspace exists.
 */
export function WorkspaceGuard({ children }: WorkspaceGuardProps) {
  const router = useRouter();

  const { data, isLoading } = trpc.workspaces.checkWorkspace.useQuery(undefined, {
    retry: false,
    staleTime: 60000, // Cache for 1 minute
  });

  const shouldRedirect = !isLoading && data && !data.hasWorkspace;

  useEffect(() => {
    if (shouldRedirect) {
      router.push(ROUTES.onboarding);
    }
  }, [router, shouldRedirect]);

  // If no workspace, don't render children (will redirect)
  if (shouldRedirect) {
    return (
      <div className="h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Workspace exists, render children
  return (
    <>
      {children}
      {isLoading && (
        <div className="fixed inset-x-0 top-3 z-50 flex justify-center pointer-events-none">
          <div className="flex items-center gap-2 rounded-full border border-border bg-background/90 px-3 py-1 text-xs text-muted-foreground shadow-sm backdrop-blur">
            <Loader2 className="h-3 w-3 animate-spin" />
            Checking workspace...
          </div>
        </div>
      )}
    </>
  );
}
