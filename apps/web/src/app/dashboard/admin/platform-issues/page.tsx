'use client';

import { useState } from 'react';
import { trpc } from '@/lib/trpc/client';
import { Button } from '@/components/ui/button';
import {
  Bug,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Clock,
  Github,
} from 'lucide-react';
import { cn } from '@/lib/utils';

type BugStatus = 'new' | 'acknowledged' | 'filed' | 'resolved' | 'wontfix';
type Severity = 'low' | 'medium' | 'high' | 'critical';

const STATUS_BADGES: Record<BugStatus, { label: string; className: string }> = {
  new: { label: 'New', className: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300' },
  acknowledged: { label: 'Ack', className: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300' },
  filed: { label: 'Filed', className: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300' },
  resolved: { label: 'Resolved', className: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300' },
  wontfix: { label: "Won't Fix", className: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300' },
};

const SEVERITY_BADGES: Record<Severity, { label: string; className: string }> = {
  low: { label: 'Low', className: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300' },
  medium: { label: 'Medium', className: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300' },
  high: { label: 'High', className: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300' },
  critical: { label: 'Critical', className: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300' },
};

export default function PlatformIssuesPage() {
  const [statusFilter, setStatusFilter] = useState<BugStatus | undefined>(undefined);
  const [severityFilter, setSeverityFilter] = useState<Severity | undefined>(undefined);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const utils = trpc.useUtils();

  const { data: stats } = trpc.admin.getPlatformBugStats.useQuery();
  const { data, isLoading } = trpc.admin.listPlatformBugs.useQuery({
    status: statusFilter,
    severity: severityFilter,
    limit: 50,
    offset: 0,
  });

  const updateStatus = trpc.admin.updatePlatformBugStatus.useMutation({
    onSuccess: () => {
      utils.admin.listPlatformBugs.invalidate();
      utils.admin.getPlatformBugStats.invalidate();
    },
  });

  const createIssue = trpc.admin.createGithubIssue.useMutation({
    onSuccess: () => {
      utils.admin.listPlatformBugs.invalidate();
    },
  });

  return (
    <div className="space-y-6">
      {/* Header + Stats */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <Bug className="h-5 w-5" />
            Platform Issues
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            AI-triaged platform bugs detected from error boundaries and API routes
          </p>
        </div>
      </div>

      {/* Stats cards */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <StatCard label="Total" value={stats.total} icon={Bug} />
          <StatCard label="New" value={stats.new} icon={AlertTriangle} accent={stats.new > 0} />
          <StatCard label="Critical" value={stats.critical} icon={XCircle} accent={stats.critical > 0} />
          <StatCard label="High" value={stats.high} icon={AlertTriangle} />
          <StatCard label="Last 24h" value={stats.last24h} icon={Clock} />
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        <FilterChip
          label="All Statuses"
          active={!statusFilter}
          onClick={() => setStatusFilter(undefined)}
        />
        {(['new', 'acknowledged', 'filed', 'resolved', 'wontfix'] as BugStatus[]).map((s) => (
          <FilterChip
            key={s}
            label={STATUS_BADGES[s].label}
            active={statusFilter === s}
            onClick={() => setStatusFilter(statusFilter === s ? undefined : s)}
          />
        ))}
        <div className="w-px bg-border mx-1" />
        <FilterChip
          label="All Severities"
          active={!severityFilter}
          onClick={() => setSeverityFilter(undefined)}
        />
        {(['critical', 'high', 'medium', 'low'] as Severity[]).map((s) => (
          <FilterChip
            key={s}
            label={SEVERITY_BADGES[s].label}
            active={severityFilter === s}
            onClick={() => setSeverityFilter(severityFilter === s ? undefined : s)}
          />
        ))}
      </div>

      {/* Bug list */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : !data?.bugs.length ? (
        <div className="text-center py-12">
          <CheckCircle2 className="h-10 w-10 text-emerald-500 mx-auto mb-3" />
          <p className="text-sm font-medium">No platform issues found</p>
          <p className="text-xs text-muted-foreground mt-1">
            {statusFilter || severityFilter ? 'Try adjusting your filters' : 'All clear!'}
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-border/60 overflow-hidden">
          {data.bugs.map((bug) => {
            const isExpanded = expandedId === bug.id;
            const statusBadge = STATUS_BADGES[(bug.status as BugStatus) ?? 'new'];
            const severityBadge = SEVERITY_BADGES[(bug.severity as Severity) ?? 'medium'];

            return (
              <div key={bug.id} className="border-b border-border/30 last:border-b-0">
                {/* Row */}
                <button
                  onClick={() => setExpandedId(isExpanded ? null : bug.id)}
                  className="w-full flex items-center gap-3 px-4 py-3 text-sm hover:bg-muted/20 transition-colors text-left"
                >
                  {/* Status badge */}
                  <span className={cn('text-[10px] font-medium px-1.5 py-0.5 rounded-full whitespace-nowrap', statusBadge.className)}>
                    {statusBadge.label}
                  </span>

                  {/* Severity */}
                  <span className={cn('text-[10px] font-medium px-1.5 py-0.5 rounded-full whitespace-nowrap', severityBadge.className)}>
                    {severityBadge.label}
                  </span>

                  {/* Title */}
                  <span className="flex-1 truncate text-foreground">
                    {bug.title ?? bug.errorMessage.slice(0, 80)}
                  </span>

                  {/* Category */}
                  <span className="text-[10px] text-muted-foreground font-mono whitespace-nowrap hidden sm:inline">
                    {bug.category}
                  </span>

                  {/* Occurrences */}
                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                    {bug.occurrenceCount}x
                  </span>

                  {/* Environment */}
                  <span className="text-[10px] text-muted-foreground whitespace-nowrap hidden md:inline">
                    {bug.environment}
                  </span>

                  {/* Last seen */}
                  <span className="text-xs text-muted-foreground whitespace-nowrap hidden lg:inline">
                    {formatRelative(bug.lastSeenAt)}
                  </span>

                  {/* GitHub link */}
                  {bug.githubIssueUrl && (
                    <a
                      href={bug.githubIssueUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="text-muted-foreground hover:text-foreground"
                    >
                      <Github className="h-3.5 w-3.5" />
                    </a>
                  )}

                  {isExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0" /> : <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />}
                </button>

                {/* Expanded detail */}
                {isExpanded && (
                  <div className="px-4 py-4 bg-muted/10 border-t border-border/20 space-y-4">
                    {/* Error message */}
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground/60 mb-1">Error Message</p>
                      <pre className="text-xs bg-muted/30 rounded-lg px-3 py-2 max-h-[120px] overflow-y-auto whitespace-pre-wrap break-words font-mono">
                        {bug.errorMessage}
                      </pre>
                    </div>

                    {/* Stack trace */}
                    {bug.stackTrace && (
                      <div>
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground/60 mb-1">Stack Trace</p>
                        <pre className="text-xs bg-muted/30 rounded-lg px-3 py-2 max-h-[200px] overflow-y-auto whitespace-pre-wrap break-words font-mono">
                          {bug.stackTrace}
                        </pre>
                      </div>
                    )}

                    {/* AI Analysis */}
                    {(bug.rootCause || bug.suggestedFix) && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {bug.rootCause && (
                          <div>
                            <p className="text-[10px] uppercase tracking-wider text-muted-foreground/60 mb-1">
                              Root Cause (AI)
                              {bug.triageConfidence != null && (
                                <span className="ml-2 text-muted-foreground/40">
                                  {Math.round(bug.triageConfidence * 100)}% confidence
                                </span>
                              )}
                            </p>
                            <p className="text-xs bg-muted/30 rounded-lg px-3 py-2">{bug.rootCause}</p>
                          </div>
                        )}
                        {bug.suggestedFix && (
                          <div>
                            <p className="text-[10px] uppercase tracking-wider text-muted-foreground/60 mb-1">Suggested Fix (AI)</p>
                            <p className="text-xs bg-muted/30 rounded-lg px-3 py-2">{bug.suggestedFix}</p>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Metadata */}
                    <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                      <span>Source: {bug.source}</span>
                      <span>First seen: {new Date(bug.firstSeenAt).toLocaleString()}</span>
                      <span>Last seen: {new Date(bug.lastSeenAt).toLocaleString()}</span>
                      {(bug.affectedWorkspaces as string[])?.length > 0 && (
                        <span>{(bug.affectedWorkspaces as string[]).length} workspace(s)</span>
                      )}
                      {(bug.affectedRoutes as string[])?.length > 0 && (
                        <span>Routes: {(bug.affectedRoutes as string[]).join(', ')}</span>
                      )}
                    </div>

                    {/* Resolution */}
                    {bug.resolution && (
                      <div>
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground/60 mb-1">Resolution</p>
                        <p className="text-xs bg-emerald-50 dark:bg-emerald-950/20 rounded-lg px-3 py-2">{bug.resolution}</p>
                      </div>
                    )}

                    {/* Actions */}
                    <div className="flex items-center gap-2 pt-1">
                      {bug.status === 'new' && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs"
                          disabled={updateStatus.isPending}
                          onClick={() => updateStatus.mutate({ id: bug.id, version: bug.version, status: 'acknowledged' })}
                        >
                          Acknowledge
                        </Button>
                      )}
                      {!bug.githubIssueUrl && bug.status !== 'resolved' && bug.status !== 'wontfix' && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs"
                          disabled={createIssue.isPending}
                          onClick={() => createIssue.mutate({ id: bug.id, version: bug.version })}
                        >
                          {createIssue.isPending ? (
                            <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                          ) : (
                            <Github className="h-3 w-3 mr-1" />
                          )}
                          Create GitHub Issue
                        </Button>
                      )}
                      {bug.githubIssueUrl && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 text-xs"
                          asChild
                        >
                          <a href={bug.githubIssueUrl} target="_blank" rel="noopener noreferrer">
                            <ExternalLink className="h-3 w-3 mr-1" />
                            View Issue #{bug.githubIssueNumber}
                          </a>
                        </Button>
                      )}
                      {bug.status !== 'resolved' && bug.status !== 'wontfix' && (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs"
                            disabled={updateStatus.isPending}
                            onClick={() => {
                              const resolution = prompt('Enter resolution description:');
                              if (resolution) {
                                updateStatus.mutate({ id: bug.id, version: bug.version, status: 'resolved', resolution });
                              }
                            }}
                          >
                            Resolve
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 text-xs text-muted-foreground"
                            disabled={updateStatus.isPending}
                            onClick={() => updateStatus.mutate({ id: bug.id, version: bug.version, status: 'wontfix' })}
                          >
                            Won&apos;t Fix
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination info */}
      {data && data.total > 0 && (
        <p className="text-xs text-muted-foreground text-center">
          Showing {data.bugs.length} of {data.total} issues
        </p>
      )}
    </div>
  );
}

// ============================================================================
// HELPER COMPONENTS
// ============================================================================

function StatCard({
  label,
  value,
  icon: Icon,
  accent,
}: {
  label: string;
  value: number;
  icon: React.ComponentType<{ className?: string }>;
  accent?: boolean;
}) {
  return (
    <div className="rounded-xl border border-border/60 bg-card/70 px-4 py-3">
      <div className="flex items-center gap-2 mb-1">
        <Icon className={cn('h-3.5 w-3.5', accent ? 'text-destructive' : 'text-muted-foreground')} />
        <span className="text-xs text-muted-foreground">{label}</span>
      </div>
      <p className={cn('text-xl font-semibold', accent && value > 0 && 'text-destructive')}>
        {value}
      </p>
    </div>
  );
}

function FilterChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'text-xs px-3 py-1.5 rounded-full border transition-colors',
        active
          ? 'bg-primary text-primary-foreground border-primary'
          : 'bg-card border-border/60 text-muted-foreground hover:text-foreground hover:border-border'
      )}
    >
      {label}
    </button>
  );
}

function formatRelative(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const now = Date.now();
  const diff = now - d.getTime();

  if (diff < 60_000) return 'just now';
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86400_000) return `${Math.floor(diff / 3600_000)}h ago`;
  if (diff < 604800_000) return `${Math.floor(diff / 86400_000)}d ago`;
  return d.toLocaleDateString();
}
