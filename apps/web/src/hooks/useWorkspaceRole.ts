import { trpc } from '@/lib/trpc/client';

export type WorkspaceRole = 'admin' | 'editor' | 'operator' | 'viewer';

export function useWorkspaceRole() {
  const { data, isLoading } = trpc.team.getMyRole.useQuery(undefined, {
    staleTime: 60_000, // Cache for 1 minute
    retry: false,
  });

  const role = data?.role ?? null;

  return {
    role,
    isLoading,
    isAdmin: role === 'admin',
    isEditor: role === 'admin' || role === 'editor',
    isOperator: role === 'admin' || role === 'editor' || role === 'operator',
    isViewer: role !== null,
    canEdit: role === 'admin' || role === 'editor',
    canExecute: role === 'admin' || role === 'editor' || role === 'operator',
    canManage: role === 'admin',
  };
}
