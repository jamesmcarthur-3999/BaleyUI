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
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  Shield,
  ShieldCheck,
  ShieldAlert,
  Trash2,
  Clock,
  CheckCircle2,
  Search,
  ChevronRight,
} from 'lucide-react';
import { PageShell } from '@/components/layout/page-shell';

function summarizePattern(pattern: Record<string, unknown>): string {
  const entries = Object.entries(pattern);
  if (entries.length === 0) return 'Any action';
  return entries.map(([k, v]) => `${k}: ${JSON.stringify(v)}`).join(', ');
}

export default function ApprovalsSettingsPage() {
  const [patternToRevoke, setPatternToRevoke] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPatterns, setSelectedPatterns] = useState<Set<string>>(new Set());
  const [batchRevokeOpen, setBatchRevokeOpen] = useState(false);

  const { data: patterns, isLoading, refetch } = trpc.policies.listApprovalPatterns.useQuery({
    includeRevoked: false,
  });

  const revokeMutation = trpc.policies.revokeApprovalPattern.useMutation({
    onSuccess: () => {
      refetch();
      setPatternToRevoke(null);
      setBatchRevokeOpen(false);
      setSelectedPatterns(new Set());
    },
  });

  // Search filter
  const query = searchQuery.toLowerCase();
  const filteredPatterns = patterns?.filter(
    (p) =>
      !query ||
      p.tool.toLowerCase().includes(query) ||
      summarizePattern(p.actionPattern as Record<string, unknown>).toLowerCase().includes(query)
  );

  // Group by tool name
  const groupedPatterns = (filteredPatterns ?? []).reduce<Record<string, typeof filteredPatterns>>(
    (acc, pattern) => {
      const key = pattern.tool;
      if (!acc[key]) acc[key] = [];
      acc[key]!.push(pattern);
      return acc;
    },
    {}
  );

  const toolGroups = Object.entries(groupedPatterns).sort(([a], [b]) => a.localeCompare(b));

  function toggleSelected(id: string) {
    setSelectedPatterns((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleBatchRevoke() {
    for (const id of selectedPatterns) {
      await revokeMutation.mutateAsync({ id });
    }
  }

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
    <PageShell
      title="Approval Patterns"
      titleSize="2xl"
      description="Manage auto-approval rules for BaleyBot tool usage. Patterns allow specific tool actions to be automatically approved based on trust levels."
      container="none"
      className="space-y-6"
    >
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-4">
            <div>
              <CardTitle>Active Patterns</CardTitle>
              <CardDescription>
                These patterns will automatically approve matching tool calls without
                manual intervention.
              </CardDescription>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {selectedPatterns.size > 0 && (
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => setBatchRevokeOpen(true)}
                >
                  <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                  Revoke {selectedPatterns.size}
                </Button>
              )}
            </div>
          </div>
          {/* Search */}
          <div className="relative mt-3">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by tool name or pattern..."
              className="pl-9"
            />
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-20 w-full" />
              ))}
            </div>
          ) : toolGroups.length > 0 ? (
            <div className="space-y-4">
              {toolGroups.map(([toolName, toolPatterns]) => (
                <Collapsible key={toolName} defaultOpen>
                  <CollapsibleTrigger className="flex items-center gap-2 w-full text-left py-1 group">
                    <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-data-[state=open]:rotate-90" />
                    <span className="font-mono text-sm font-medium">{toolName}</span>
                    <Badge variant="secondary" className="text-xs">{toolPatterns!.length}</Badge>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="pl-6 pt-2 space-y-2">
                    {toolPatterns!.map((pattern) => {
                      const expired = isExpired(pattern.expiresAt);
                      return (
                        <div
                          key={pattern.id}
                          className={`flex items-start gap-3 p-3 rounded-lg border ${
                            expired ? 'opacity-60 bg-muted/50' : ''
                          }`}
                        >
                          <Checkbox
                            checked={selectedPatterns.has(pattern.id)}
                            onCheckedChange={() => toggleSelected(pattern.id)}
                            className="mt-1"
                          />
                          <div className="flex items-start gap-3 flex-1 min-w-0">
                            <div className="mt-0.5 shrink-0">
                              {getTrustLevelIcon(pattern.trustLevel)}
                            </div>
                            <div className="space-y-1 min-w-0 flex-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                {getTrustLevelBadge(pattern.trustLevel)}
                                {expired && (
                                  <Badge variant="outline" className="text-muted-foreground">
                                    Expired
                                  </Badge>
                                )}
                              </div>
                              <p className="text-sm text-muted-foreground truncate">
                                {summarizePattern(pattern.actionPattern as Record<string, unknown>)}
                              </p>
                              {pattern.entityGoalPattern && (
                                <p className="text-xs text-muted-foreground">
                                  Entity: <code>{pattern.entityGoalPattern}</code>
                                </p>
                              )}
                              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                                <span className="flex items-center gap-1">
                                  <Clock className="h-3 w-3" />
                                  {formatDate(pattern.approvedAt)}
                                </span>
                                {pattern.expiresAt && (
                                  <span>Expires: {formatDate(pattern.expiresAt)}</span>
                                )}
                                <span className="flex items-center gap-1">
                                  <CheckCircle2 className="h-3 w-3" />
                                  {pattern.timesUsed}x
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
                            className="shrink-0"
                          >
                            <Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" aria-hidden="true" />
                          </Button>
                        </div>
                      );
                    })}
                  </CollapsibleContent>
                </Collapsible>
              ))}
            </div>
          ) : (
            <EmptyState
              icon={Shield}
              title={searchQuery ? 'No matching patterns' : 'No approval patterns'}
              description={searchQuery ? 'Try a different search term.' : "Approval patterns are created when you choose 'Approve & Remember' during BaleyBot execution."}
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

      {/* Single revoke confirmation */}
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

      {/* Batch revoke confirmation */}
      <AlertDialog open={batchRevokeOpen} onOpenChange={setBatchRevokeOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke {selectedPatterns.size} Patterns?</AlertDialogTitle>
            <AlertDialogDescription>
              All selected patterns will be revoked. Future tool calls matching
              these patterns will require manual approval again.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleBatchRevoke}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {revokeMutation.isPending ? 'Revoking...' : `Revoke ${selectedPatterns.size} Patterns`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageShell>
  );
}
