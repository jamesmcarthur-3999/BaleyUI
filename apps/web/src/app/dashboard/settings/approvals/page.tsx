'use client';

import { useState } from 'react';
import { trpc } from '@/lib/trpc/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Shield,
  ShieldCheck,
  ShieldAlert,
  Trash2,
  Clock,
  CheckCircle2,
} from 'lucide-react';

export default function ApprovalsSettingsPage() {
  const [patternToRevoke, setPatternToRevoke] = useState<string | null>(null);

  const { data: patterns, isLoading, refetch } = trpc.policies.listApprovalPatterns.useQuery({
    includeRevoked: false,
  });

  const revokeMutation = trpc.policies.revokeApprovalPattern.useMutation({
    onSuccess: () => {
      refetch();
      setPatternToRevoke(null);
    },
  });

  const getTrustLevelIcon = (level: string) => {
    switch (level) {
      case 'provisional':
        return <Shield className="h-4 w-4 text-blue-500" />;
      case 'trusted':
        return <ShieldCheck className="h-4 w-4 text-green-500" />;
      case 'permanent':
        return <ShieldAlert className="h-4 w-4 text-orange-500" />;
      default:
        return <Shield className="h-4 w-4" />;
    }
  };

  const getTrustLevelBadge = (level: string) => {
    switch (level) {
      case 'provisional':
        return <Badge variant="secondary">Provisional</Badge>;
      case 'trusted':
        return <Badge variant="default" className="bg-green-600">Trusted</Badge>;
      case 'permanent':
        return <Badge variant="default" className="bg-orange-600">Permanent</Badge>;
      default:
        return <Badge variant="outline">{level}</Badge>;
    }
  };

  const formatDate = (date: Date | null) => {
    if (!date) return 'N/A';
    return new Date(date).toLocaleDateString();
  };

  const isExpired = (expiresAt: Date | null) => {
    if (!expiresAt) return false;
    return new Date(expiresAt) < new Date();
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium">Approval Patterns</h3>
        <p className="text-sm text-muted-foreground">
          Manage auto-approval rules for BaleyBot tool usage. Patterns allow
          specific tool actions to be automatically approved based on trust
          levels.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Active Patterns</CardTitle>
          <CardDescription>
            These patterns will automatically approve matching tool calls without
            manual intervention.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-20 w-full" />
              ))}
            </div>
          ) : patterns && patterns.length > 0 ? (
            <div className="space-y-3">
              {patterns.map((pattern) => {
                const expired = isExpired(pattern.expiresAt);
                return (
                  <div
                    key={pattern.id}
                    className={`flex items-start justify-between p-4 rounded-lg border ${
                      expired ? 'opacity-60 bg-muted/50' : ''
                    }`}
                  >
                    <div className="flex items-start gap-4">
                      <div className="mt-1">
                        {getTrustLevelIcon(pattern.trustLevel)}
                      </div>
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-sm font-medium">
                            {pattern.tool}
                          </span>
                          {getTrustLevelBadge(pattern.trustLevel)}
                          {expired && (
                            <Badge variant="outline" className="text-muted-foreground">
                              Expired
                            </Badge>
                          )}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          <pre className="inline-block bg-muted px-2 py-1 rounded text-xs">
                            {JSON.stringify(pattern.actionPattern, null, 2).slice(0, 100)}
                            {JSON.stringify(pattern.actionPattern).length > 100 ? '...' : ''}
                          </pre>
                        </div>
                        {pattern.entityGoalPattern && (
                          <div className="text-xs text-muted-foreground">
                            Entity pattern: <code>{pattern.entityGoalPattern}</code>
                          </div>
                        )}
                        <div className="flex items-center gap-4 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            Created: {formatDate(pattern.approvedAt)}
                          </span>
                          {pattern.expiresAt && (
                            <span className="flex items-center gap-1">
                              Expires: {formatDate(pattern.expiresAt)}
                            </span>
                          )}
                          <span className="flex items-center gap-1">
                            <CheckCircle2 className="h-3 w-3" />
                            Used {pattern.timesUsed}x
                          </span>
                        </div>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setPatternToRevoke(pattern.id)}
                      disabled={revokeMutation.isPending}
                      aria-label={`Revoke approval pattern for ${pattern.tool}`}
                    >
                      <Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" aria-hidden="true" />
                    </Button>
                  </div>
                );
              })}
            </div>
          ) : (
            <EmptyState
              icon={Shield}
              title="No approval patterns"
              description="Approval patterns are created when you choose 'Approve & Remember' during BaleyBot execution."
              className="py-8"
            />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>About Trust Levels</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <Shield className="h-5 w-5 text-blue-500 mt-0.5" />
              <div>
                <div className="font-medium">Provisional</div>
                <p className="text-sm text-muted-foreground">
                  Auto-approves for 24 hours, then requires re-approval. Good for
                  temporary tasks.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <ShieldCheck className="h-5 w-5 text-green-500 mt-0.5" />
              <div>
                <div className="font-medium">Trusted</div>
                <p className="text-sm text-muted-foreground">
                  Auto-approves indefinitely but can be revoked at any time.
                  Recommended for regular operations.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <ShieldAlert className="h-5 w-5 text-orange-500 mt-0.5" />
              <div>
                <div className="font-medium">Permanent</div>
                <p className="text-sm text-muted-foreground">
                  Always auto-approves for this workspace. Use with caution for
                  sensitive operations.
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <AlertDialog open={!!patternToRevoke} onOpenChange={() => setPatternToRevoke(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke Approval Pattern?</AlertDialogTitle>
            <AlertDialogDescription>
              This pattern will be revoked and future tool calls matching this
              pattern will require manual approval again.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (patternToRevoke) {
                  revokeMutation.mutate({ id: patternToRevoke });
                }
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Revoke Pattern
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
