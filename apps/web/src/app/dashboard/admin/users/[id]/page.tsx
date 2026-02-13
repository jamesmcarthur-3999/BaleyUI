'use client';

import { use } from 'react';
import { trpc } from '@/lib/trpc/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/use-toast';
import { useRouter } from 'next/navigation';
import { ROUTES } from '@/lib/routes';
import { parseUserAgent } from '@/lib/utils/user-agent';
import {
  ArrowLeft,
  Mail,
  Shield,
  Calendar,
  Briefcase,
  Monitor,
  Trash2,
  Globe,
  Clock,
  Bot,
  AlertTriangle,
} from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';

function formatDate(date: Date | string): string {
  return new Date(date).toLocaleString();
}

function isExpired(date: Date | string): boolean {
  return new Date(date) < new Date();
}

export default function AdminUserDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { toast } = useToast();
  const router = useRouter();
  const utils = trpc.useUtils();

  const { data: userData, isLoading, error } = trpc.admin.getUser.useQuery({ id });

  const revokeSession = trpc.admin.revokeSession.useMutation({
    onSuccess: () => {
      toast({ title: 'Session revoked' });
      utils.admin.getUser.invalidate({ id });
    },
    onError: (err) => {
      toast({ title: 'Failed to revoke session', description: err.message, variant: 'destructive' });
    },
  });

  const revokeAll = trpc.admin.revokeAllUserSessions.useMutation({
    onSuccess: (result) => {
      toast({ title: `Revoked ${result.count} sessions` });
      utils.admin.getUser.invalidate({ id });
    },
  });

  const deleteUser = trpc.admin.deleteUser.useMutation({
    onSuccess: () => {
      toast({ title: 'User deleted' });
      router.push(ROUTES.admin.users);
    },
    onError: (err) => {
      toast({ title: 'Failed to delete user', description: err.message, variant: 'destructive' });
    },
  });

  if (isLoading) {
    return <div className="text-muted-foreground py-8">Loading user details...</div>;
  }

  if (error || !userData) {
    return (
      <div className="text-center py-8">
        <AlertTriangle className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
        <p className="text-muted-foreground">User not found</p>
        <Button variant="outline" className="mt-4" asChild>
          <Link href={ROUTES.admin.users}>Back to Users</Link>
        </Button>
      </div>
    );
  }

  const initials = userData.name
    ? userData.name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)
    : '?';

  return (
    <div className="space-y-6">
      {/* Back link */}
      <Link
        href={ROUTES.admin.users}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Users
      </Link>

      {/* Profile Card */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-start gap-4">
            <div className="h-16 w-16 rounded-full bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center ring-2 ring-primary/10">
              <span className="text-xl font-bold text-primary">{initials}</span>
            </div>
            <div className="flex-1 space-y-2">
              <h2 className="text-xl font-bold">{userData.name || 'Unnamed'}</h2>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Mail className="h-3.5 w-3.5" />
                <span>{userData.email}</span>
                {userData.emailVerified && (
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                    <Shield className="h-2.5 w-2.5 mr-0.5" />
                    Verified
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  Created {formatDate(userData.createdAt)}
                </span>
                {userData.workspace && (
                  <span className="flex items-center gap-1">
                    <Briefcase className="h-3 w-3" />
                    {userData.workspace.name}
                  </span>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Sessions */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Active Sessions</CardTitle>
            <CardDescription>{userData.sessions.length} session(s)</CardDescription>
          </div>
          {userData.sessions.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => revokeAll.mutate({ userId: id })}
              loading={revokeAll.isPending}
              loadingText="Revoking..."
            >
              Revoke All
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {userData.sessions.length === 0 ? (
            <p className="text-sm text-muted-foreground">No sessions</p>
          ) : (
            <div className="space-y-3">
              {userData.sessions.map((sess) => {
                const { browser, os } = parseUserAgent(sess.userAgent);
                const expired = isExpired(sess.expiresAt);

                return (
                  <div
                    key={sess.id}
                    className={cn(
                      'flex items-center justify-between p-3 rounded-lg border',
                      expired ? 'border-destructive/20 bg-destructive/5' : 'border-border/60'
                    )}
                  >
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <Monitor className="h-4 w-4 text-muted-foreground shrink-0" />
                        <span className="text-sm font-medium">{browser} on {os}</span>
                        {expired && (
                          <Badge variant="destructive" className="text-[10px]">Expired</Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        {sess.ipAddress && (
                          <span className="flex items-center gap-1">
                            <Globe className="h-3 w-3" />
                            {sess.ipAddress}
                          </span>
                        )}
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          Created {formatDate(sess.createdAt)}
                        </span>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => revokeSession.mutate({ sessionId: sess.id })}
                      disabled={revokeSession.isPending}
                    >
                      Revoke
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recent Executions */}
      {userData.recentExecutions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Recent Executions</CardTitle>
            <CardDescription>Last 10 BaleyBot executions in this user&apos;s workspace</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {userData.recentExecutions.map((exec) => (
                <div key={exec.id} className="flex items-center justify-between py-2 border-b border-border/30 last:border-0">
                  <div className="flex items-center gap-2">
                    <Bot className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-medium">{exec.baleybotName}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    {exec.durationMs && (
                      <span className="text-xs text-muted-foreground">{exec.durationMs}ms</span>
                    )}
                    <Badge
                      variant={exec.status === 'completed' ? 'default' : exec.status === 'failed' ? 'destructive' : 'secondary'}
                    >
                      {exec.status}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {formatDate(exec.createdAt)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Danger Zone */}
      <Card className="border-destructive/30">
        <CardHeader>
          <CardTitle className="text-destructive flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            Danger Zone
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Delete User</p>
              <p className="text-xs text-muted-foreground">
                Permanently delete this user and all their data. This cannot be undone.
              </p>
            </div>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => {
                if (confirm(`Are you sure you want to delete "${userData.name || userData.email}"? This cannot be undone.`)) {
                  deleteUser.mutate({ id });
                }
              }}
              loading={deleteUser.isPending}
              loadingText="Deleting..."
            >
              <Trash2 className="h-4 w-4 mr-1" />
              Delete User
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
