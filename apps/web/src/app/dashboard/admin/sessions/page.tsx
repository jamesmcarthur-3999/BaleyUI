'use client';

import { useState } from 'react';
import { trpc } from '@/lib/trpc/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/use-toast';
import { parseUserAgent } from '@/lib/utils/user-agent';
import { ROUTES } from '@/lib/routes';
import Link from 'next/link';
import {
  Monitor,
  Globe,
  Trash2,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';

function formatDate(date: Date | string): string {
  return new Date(date).toLocaleString();
}

function isExpired(date: Date | string): boolean {
  return new Date(date) < new Date();
}

const PAGE_SIZE = 30;

type SessionFilter = 'all' | 'active' | 'expired';

export default function AdminSessionsPage() {
  const { toast } = useToast();
  const [filter, setFilter] = useState<SessionFilter>('all');
  const [page, setPage] = useState(0);
  const utils = trpc.useUtils();

  const { data, isLoading } = trpc.admin.listSessions.useQuery({
    filter,
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
  });

  const revokeSession = trpc.admin.revokeSession.useMutation({
    onSuccess: () => {
      toast({ title: 'Session revoked' });
      utils.admin.listSessions.invalidate();
    },
    onError: (err) => {
      toast({ title: 'Failed to revoke session', description: err.message, variant: 'destructive' });
    },
  });

  const revokeExpired = trpc.admin.revokeExpiredSessions.useMutation({
    onSuccess: (result) => {
      toast({ title: `Revoked ${result.count} expired sessions` });
      utils.admin.listSessions.invalidate();
    },
    onError: (err) => {
      toast({ title: 'Failed to revoke expired sessions', description: err.message, variant: 'destructive' });
    },
  });

  const sessions = data?.sessions ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  const filters: { label: string; value: SessionFilter }[] = [
    { label: 'All', value: 'all' },
    { label: 'Active', value: 'active' },
    { label: 'Expired', value: 'expired' },
  ];

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {filters.map((f) => (
            <Button
              key={f.value}
              variant={filter === f.value ? 'default' : 'outline'}
              size="sm"
              onClick={() => {
                setFilter(f.value);
                setPage(0);
              }}
            >
              {f.label}
            </Button>
          ))}
          <span className="text-sm text-muted-foreground ml-2">
            {total} session{total !== 1 ? 's' : ''}
          </span>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => revokeExpired.mutate()}
          loading={revokeExpired.isPending}
          loadingText="Revoking..."
        >
          <Trash2 className="h-4 w-4 mr-1" />
          Revoke All Expired
        </Button>
      </div>

      {/* Sessions Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center text-muted-foreground">Loading sessions...</div>
          ) : sessions.length === 0 ? (
            <div className="p-8 text-center">
              <Monitor className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
              <p className="text-muted-foreground">No sessions found</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/60">
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">User</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Device</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">IP</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Created</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Expires</th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {sessions.map((sess) => {
                    const { browser, os } = parseUserAgent(sess.userAgent);
                    const expired = isExpired(sess.expiresAt);

                    return (
                      <tr
                        key={sess.id}
                        className={cn(
                          'border-b border-border/30 hover:bg-muted/30 transition-colors',
                          expired && 'opacity-60'
                        )}
                      >
                        <td className="px-4 py-3">
                          <Link
                            href={ROUTES.admin.user(sess.userId)}
                            className="hover:underline"
                          >
                            <p className="font-medium">{sess.userName || 'Unnamed'}</p>
                            <p className="text-xs text-muted-foreground">{sess.userEmail}</p>
                          </Link>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5">
                            <Monitor className="h-3.5 w-3.5 text-muted-foreground" />
                            <span>{browser}</span>
                          </div>
                          <p className="text-xs text-muted-foreground">{os}</p>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5 text-muted-foreground">
                            <Globe className="h-3.5 w-3.5" />
                            <span>{sess.ipAddress || '-'}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {formatDate(sess.createdAt)}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5">
                            <span className="text-muted-foreground">{formatDate(sess.expiresAt)}</span>
                            {expired && (
                              <Badge variant="destructive" className="text-[10px] px-1">
                                Expired
                              </Badge>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => revokeSession.mutate({ sessionId: sess.id })}
                            disabled={revokeSession.isPending}
                          >
                            Revoke
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">
            Page {page + 1} of {totalPages}
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(page - 1)}
              disabled={page === 0}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(page + 1)}
              disabled={page >= totalPages - 1}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
