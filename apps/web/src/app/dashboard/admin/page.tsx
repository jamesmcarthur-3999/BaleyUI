'use client';

import { trpc } from '@/lib/trpc/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/use-toast';
import Link from 'next/link';
import { ROUTES } from '@/lib/routes';
import {
  Users,
  Monitor,
  Briefcase,
  Bot,
  Zap,
  TrendingUp,
  UserPlus,
  Play,
  AlertCircle,
  CheckCircle2,
  Trash2,
  ArrowRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';

function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - new Date(date).getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDays = Math.floor(diffHr / 24);
  return `${diffDays}d ago`;
}

export default function AdminOverviewPage() {
  const { toast } = useToast();
  const { data: stats, isLoading: statsLoading } = trpc.admin.getSystemStats.useQuery();
  const { data: activity, isLoading: activityLoading } = trpc.admin.getRecentActivity.useQuery();
  const { data: authHealth } = trpc.admin.getAuthHealth.useQuery();

  const revokeExpired = trpc.admin.revokeExpiredSessions.useMutation({
    onSuccess: (data) => {
      toast({ title: `Revoked ${data.count} expired sessions` });
    },
    onError: (error) => {
      toast({ title: 'Failed to revoke sessions', description: error.message, variant: 'destructive' });
    },
  });

  return (
    <div className="space-y-6">
      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <StatCard
          label="Total Users"
          value={stats?.totalUsers}
          loading={statsLoading}
          icon={Users}
          detail={stats?.newUsersThisWeek ? `+${stats.newUsersThisWeek} this week` : undefined}
          detailColor="text-green-500"
        />
        <StatCard
          label="Active Sessions"
          value={stats?.activeSessions}
          loading={statsLoading}
          icon={Monitor}
          detail={stats?.expiredSessions ? `${stats.expiredSessions} expired` : undefined}
          detailColor="text-orange-500"
        />
        <StatCard
          label="Workspaces"
          value={stats?.totalWorkspaces}
          loading={statsLoading}
          icon={Briefcase}
        />
        <StatCard
          label="BaleyBots"
          value={stats?.totalBaleybots}
          loading={statsLoading}
          icon={Bot}
          detail={stats?.internalBaleybots ? `${stats.internalBaleybots} internal` : undefined}
          detailColor="text-primary"
        />
        <StatCard
          label="Executions Today"
          value={stats?.executionsToday}
          loading={statsLoading}
          icon={Zap}
        />
        <StatCard
          label="Total Executions"
          value={stats?.totalExecutions}
          loading={statsLoading}
          icon={TrendingUp}
        />
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Recent Activity */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
            <CardDescription>Latest system events</CardDescription>
          </CardHeader>
          <CardContent>
            {activityLoading ? (
              <div className="text-sm text-muted-foreground py-4">Loading activity...</div>
            ) : activity && activity.length > 0 ? (
              <div className="space-y-3">
                {activity.map((item, i) => (
                  <ActivityItem key={i} item={item} />
                ))}
              </div>
            ) : (
              <div className="text-sm text-muted-foreground py-4">No recent activity</div>
            )}
          </CardContent>
        </Card>

        {/* Quick Actions + Auth Health */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Quick Actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Button
                variant="outline"
                className="w-full justify-start"
                onClick={() => revokeExpired.mutate()}
                loading={revokeExpired.isPending}
                loadingText="Revoking..."
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Revoke Expired Sessions
                {(stats?.expiredSessions ?? 0) > 0 && (
                  <Badge variant="secondary" className="ml-auto">
                    {stats?.expiredSessions}
                  </Badge>
                )}
              </Button>
              <Button variant="outline" className="w-full justify-start" asChild>
                <Link href={ROUTES.admin.users}>
                  <Users className="h-4 w-4 mr-2" />
                  View All Users
                  <ArrowRight className="h-3 w-3 ml-auto" />
                </Link>
              </Button>
              <Button variant="outline" className="w-full justify-start" asChild>
                <Link href={ROUTES.admin.sessions}>
                  <Monitor className="h-4 w-4 mr-2" />
                  View All Sessions
                  <ArrowRight className="h-3 w-3 ml-auto" />
                </Link>
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Auth Health</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Active sessions</span>
                <span className="font-medium">{authHealth?.totalActive ?? '-'}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Expired sessions</span>
                <span className="font-medium text-orange-500">{authHealth?.totalExpired ?? '-'}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Users without sessions</span>
                <span className="font-medium">{authHealth?.usersWithNoSessions ?? '-'}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Avg session age</span>
                <span className="font-medium">
                  {authHealth?.avgSessionAgeSeconds
                    ? `${Math.round(authHealth.avgSessionAgeSeconds / 86400)}d`
                    : '-'}
                </span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// STAT CARD
// ============================================================================

function StatCard({
  label,
  value,
  loading,
  icon: Icon,
  detail,
  detailColor,
}: {
  label: string;
  value: number | undefined;
  loading: boolean;
  icon: typeof Users;
  detail?: string;
  detailColor?: string;
}) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className="text-2xl font-bold">
              {loading ? '-' : (value?.toLocaleString() ?? '0')}
            </p>
            {detail && (
              <p className={cn('text-xs', detailColor ?? 'text-muted-foreground')}>
                {detail}
              </p>
            )}
          </div>
          <div className="h-9 w-9 rounded-lg bg-muted flex items-center justify-center">
            <Icon className="h-4 w-4 text-muted-foreground" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================================================
// ACTIVITY ITEM
// ============================================================================

function ActivityItem({ item }: { item: { type: string; data: Record<string, unknown>; timestamp: Date } }) {
  if (item.type === 'user_signup') {
    const data = item.data as { name?: string | null; email: string };
    return (
      <div className="flex items-center gap-3 py-1">
        <div className="h-7 w-7 rounded-full bg-blue-500/10 flex items-center justify-center shrink-0">
          <UserPlus className="h-3.5 w-3.5 text-blue-500" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm truncate">
            <span className="font-medium">{data.name || data.email}</span>
            {' signed up'}
          </p>
        </div>
        <span className="text-xs text-muted-foreground shrink-0">
          {formatRelativeTime(item.timestamp)}
        </span>
      </div>
    );
  }

  if (item.type === 'execution') {
    const data = item.data as {
      status: string;
      baleybotName?: string | null;
      isInternal?: boolean;
    };
    const isError = data.status === 'failed';
    const isSuccess = data.status === 'completed';

    return (
      <div className="flex items-center gap-3 py-1">
        <div className={cn(
          'h-7 w-7 rounded-full flex items-center justify-center shrink-0',
          isError ? 'bg-destructive/10' : isSuccess ? 'bg-green-500/10' : 'bg-muted'
        )}>
          {isError ? (
            <AlertCircle className="h-3.5 w-3.5 text-destructive" />
          ) : isSuccess ? (
            <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
          ) : (
            <Play className="h-3.5 w-3.5 text-muted-foreground" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm truncate">
            <span className="font-medium">{data.baleybotName || 'Unknown'}</span>
            {' '}
            <span className={cn(
              isError ? 'text-destructive' : isSuccess ? 'text-green-600' : 'text-muted-foreground'
            )}>
              {data.status}
            </span>
            {data.isInternal && (
              <Badge variant="secondary" className="ml-1.5 text-[10px] px-1 py-0">
                internal
              </Badge>
            )}
          </p>
        </div>
        <span className="text-xs text-muted-foreground shrink-0">
          {formatRelativeTime(item.timestamp)}
        </span>
      </div>
    );
  }

  return null;
}
