'use client';

import { useState, useRef, useEffect } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';
import { formatTimeAgo } from '@/lib/format';
import {
  AlertCircle,
  AlertTriangle,
  Info,
  ChevronDown,
  Loader2,
} from 'lucide-react';

// ============================================================================
// TYPES
// ============================================================================

type Severity = 'critical' | 'warning' | 'info';

export interface RecommendationItem {
  id: string;
  title: string;
  description: string;
  severity: string;
  targetType: string;
  proposedAction: unknown;
  status: string;
  createdAt: Date | string;
  sourceBaleybot?: { id: string; name: string; icon: string | null } | null;
  targetBaleybot?: { id: string; name: string; icon: string | null } | null;
}

interface ActionCardProps {
  recommendation: RecommendationItem;
  defaultExpanded?: boolean;
  onAccept: (id: string) => void;
  onDismiss: (id: string) => void;
  isPending?: boolean;
}

// ============================================================================
// SEVERITY CONFIG — reuses InsightCard visual language
// ============================================================================

const severityConfig: Record<
  Severity,
  {
    icon: typeof AlertCircle;
    bgClass: string;
    borderClass: string;
    badgeVariant: 'destructive' | 'outline' | 'secondary';
    label: string;
  }
> = {
  critical: {
    icon: AlertCircle,
    bgClass: 'bg-red-50/50 dark:bg-red-950/20',
    borderClass: 'border-red-500/50',
    badgeVariant: 'destructive',
    label: 'Critical',
  },
  warning: {
    icon: AlertTriangle,
    bgClass: 'bg-yellow-50/50 dark:bg-yellow-950/20',
    borderClass: 'border-yellow-500/50',
    badgeVariant: 'outline',
    label: 'Warning',
  },
  info: {
    icon: Info,
    bgClass: 'bg-blue-50/50 dark:bg-blue-950/20',
    borderClass: 'border-blue-500/50',
    badgeVariant: 'secondary',
    label: 'Info',
  },
};

const TYPE_LABELS: Record<string, string> = {
  approval_pattern: 'Auto-approval',
  bal_patch: 'Code fix',
  error_review: 'Error analysis',
  configuration: 'Configuration',
  insight: 'Insight',
  performance: 'Performance',
};

// ============================================================================
// TYPE-SPECIFIC BUTTONS
// ============================================================================

function getActionButtons(targetType: string): {
  primary: { label: string } | null;
  secondary: { label: string };
} {
  switch (targetType) {
    case 'approval_pattern':
      return { primary: { label: 'Accept Rule' }, secondary: { label: 'Skip' } };
    case 'bal_patch':
      return { primary: { label: 'Apply Fix' }, secondary: { label: 'Skip' } };
    case 'error_review':
      return { primary: null, secondary: { label: 'Got it' } };
    case 'configuration':
      return { primary: { label: 'Apply' }, secondary: { label: 'Skip' } };
    case 'insight':
      return { primary: null, secondary: { label: 'Got it' } };
    case 'performance':
      return { primary: null, secondary: { label: 'Got it' } };
    default:
      return { primary: { label: 'Accept' }, secondary: { label: 'Skip' } };
  }
}

// ============================================================================
// PROPOSED ACTION PREVIEW
// ============================================================================

function ProposedActionPreview({
  targetType,
  proposedAction,
  targetBotName,
}: {
  targetType: string;
  proposedAction: unknown;
  targetBotName: string | null;
}) {
  const action = proposedAction as Record<string, unknown> | null;
  if (!action) return null;

  switch (targetType) {
    case 'approval_pattern': {
      const tool = String(action.tool ?? 'unknown tool');
      const condition = action.entityGoalPattern ? ` when goal matches "${action.entityGoalPattern}"` : '';
      return (
        <p className="text-sm text-muted-foreground">
          Allow <strong>{targetBotName ?? 'this BaleyBot'}</strong> to use{' '}
          <strong>{tool}</strong> without asking{condition}
        </p>
      );
    }

    case 'bal_patch': {
      const currentCode = String(action.currentCode ?? '');
      const proposedCode = String(action.proposedCode ?? '');
      return (
        <div className="space-y-2">
          {currentCode && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1">Current</p>
              <pre className="text-xs bg-muted/50 rounded-md p-3 overflow-x-auto font-mono whitespace-pre-wrap">
                {currentCode}
              </pre>
            </div>
          )}
          {proposedCode && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1">Proposed</p>
              <pre className="text-xs bg-muted/50 rounded-md p-3 overflow-x-auto font-mono whitespace-pre-wrap">
                {proposedCode}
              </pre>
            </div>
          )}
        </div>
      );
    }

    case 'error_review': {
      const rootCause = action.rootCause
        ? String(
            typeof action.rootCause === 'object'
              ? (action.rootCause as Record<string, unknown>).summary ??
                  JSON.stringify(action.rootCause)
              : action.rootCause
          )
        : null;
      const steps = Array.isArray(action.hardeningSteps)
        ? (action.hardeningSteps as Array<Record<string, unknown>>)
        : [];
      return (
        <div className="space-y-2">
          {rootCause && (
            <p className="text-sm text-muted-foreground">{rootCause}</p>
          )}
          {steps.length > 0 && (
            <ul className="text-sm text-muted-foreground list-disc pl-4 space-y-1">
              {steps.map((step, i) => (
                <li key={i}>
                  {step.title ? <strong>{String(step.title)}: </strong> : null}
                  {String(step.description ?? '')}
                </li>
              ))}
            </ul>
          )}
        </div>
      );
    }

    default:
      return null;
  }
}

// ============================================================================
// ACTION CARD
// ============================================================================

export function ActionCard({
  recommendation,
  defaultExpanded = false,
  onAccept,
  onDismiss,
  isPending = false,
}: ActionCardProps) {
  const [open, setOpen] = useState(defaultExpanded);
  const [removing, setRemoving] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  const severity = (recommendation.severity as Severity) || 'info';
  const config = severityConfig[severity] ?? severityConfig.info;
  const Icon = config.icon;
  const typeLabel = TYPE_LABELS[recommendation.targetType] ?? recommendation.targetType;
  const targetBotName = recommendation.targetBaleybot?.name ?? null;
  const isResolved = recommendation.status !== 'pending';
  const buttons = getActionButtons(recommendation.targetType);

  // Focus management: after removal animation, focus next sibling
  useEffect(() => {
    if (removing) {
      const timer = setTimeout(() => {
        const nextSibling = cardRef.current?.nextElementSibling;
        const nextButton = nextSibling?.querySelector('button') as HTMLElement | null;
        if (nextButton) {
          nextButton.focus();
        }
      }, 220);
      return () => clearTimeout(timer);
    }
  }, [removing]);

  const handleAccept = () => {
    setRemoving(true);
    setTimeout(() => onAccept(recommendation.id), 200);
  };

  const handleDismiss = () => {
    setRemoving(true);
    setTimeout(() => onDismiss(recommendation.id), 200);
  };

  return (
    <div
      ref={cardRef}
      tabIndex={-1}
      className={cn(
        'rounded-lg border transition-all duration-200',
        config.bgClass,
        config.borderClass,
        removing && 'opacity-0 scale-y-95 origin-top'
      )}
    >
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger asChild>
          <button
            className="flex items-center gap-3 w-full px-4 py-3 text-left"
            disabled={isPending}
          >
            <Icon className="h-4 w-4 shrink-0" />

            <span className="flex-1 min-w-0 text-sm font-medium truncate">
              {recommendation.title}
            </span>

            <Badge variant={config.badgeVariant} className="text-[10px] shrink-0">
              {config.label}
            </Badge>

            {targetBotName && (
              <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded shrink-0">
                {targetBotName}
              </span>
            )}

            <span className="text-[10px] text-muted-foreground shrink-0">
              {typeLabel}
            </span>

            <span className="text-[10px] text-muted-foreground/60 shrink-0">
              {formatTimeAgo(recommendation.createdAt)}
            </span>

            <ChevronDown
              className={cn(
                'h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200',
                open && 'rotate-180'
              )}
            />
          </button>
        </CollapsibleTrigger>

        <CollapsibleContent className="overflow-hidden data-[state=open]:animate-collapsible-down data-[state=closed]:animate-collapsible-up">
          <div className="px-4 pb-4 space-y-3 border-t border-border/30 pt-3">
            {/* Description */}
            <p className="text-sm text-muted-foreground">
              {recommendation.description}
            </p>

            {/* Type-specific proposed action preview */}
            <ProposedActionPreview
              targetType={recommendation.targetType}
              proposedAction={recommendation.proposedAction}
              targetBotName={targetBotName}
            />

            {/* Actions */}
            {isResolved ? (
              <Badge
                variant={recommendation.status === 'accepted' ? 'default' : 'secondary'}
                className="text-xs"
              >
                {recommendation.status === 'accepted' ? 'Accepted' : 'Dismissed'}
              </Badge>
            ) : (
              <div className="flex items-center gap-2 pt-1">
                {buttons.primary && (
                  <Button
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleAccept();
                    }}
                    disabled={isPending || removing}
                  >
                    {isPending && <Loader2 className="h-3 w-3 mr-1.5 animate-spin" />}
                    {buttons.primary.label}
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDismiss();
                  }}
                  disabled={isPending || removing}
                >
                  {buttons.secondary.label}
                </Button>
              </div>
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
