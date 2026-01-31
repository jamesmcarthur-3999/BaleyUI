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

  const { data, isLoading, error } = trpc.workspaces.checkWorkspace.useQuery(undefined, {
    retry: false,
    staleTime: 60000, // Cache for 1 minute
  });

  useEffect(() => {
    if (!isLoading && data && !data.hasWorkspace) {
      router.push(ROUTES.onboarding);
    }
  }, [data, isLoading, router]);

  // Show loading while checking
  if (isLoading) {
    return (
      <div className="h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // If no workspace, don't render children (will redirect)
  if (!data?.hasWorkspace) {
    return (
      <div className="h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Workspace exists, render children
  return <>{children}</>;
}
