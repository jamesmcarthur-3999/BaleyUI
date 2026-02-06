'use client';

import { trpc } from '@/lib/trpc/client';
import { Shield, Loader2 } from 'lucide-react';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { data: isAdmin, isLoading, error } = trpc.admin.isAdmin.useQuery(undefined, {
    retry: false,
  });

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !isAdmin) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="max-w-md w-full text-center">
          <Shield className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <h2 className="text-xl font-semibold mb-2">Access Denied</h2>
          <p className="text-muted-foreground">
            You do not have admin privileges to access this page.
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
