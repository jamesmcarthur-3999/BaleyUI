'use client';

import Link from 'next/link';
import { cn } from '@/lib/utils';
import { ROUTES } from '@/lib/routes';
import { Play, Clock, Zap, AlertCircle, Pause, FileQuestion } from 'lucide-react';
import { TriggerBadge } from './TriggerConfig';
import type { TriggerConfig } from '@/lib/baleybot/types';

interface BaleybotCardProps {
  id: string;
  name: string;
  description: string | null;
  icon: string | null;
  status: 'draft' | 'active' | 'paused' | 'error';
  executionCount: number;
  lastExecutedAt: Date | null;
  trigger?: TriggerConfig;
  className?: string;
}

const statusConfig = {
  draft: {
    label: 'Draft',
    className: 'badge-playful',
    Icon: FileQuestion,
  },
  active: {
    label: 'Active',
    className: 'badge-success',
    Icon: Zap,
  },
  paused: {
    label: 'Paused',
    className: 'badge-warning',
    Icon: Pause,
  },
  error: {
    label: 'Error',
    className: 'badge-error',
    Icon: AlertCircle,
  },
};

export function BaleybotCard({
  id,
  name,
  description,
  icon,
  status,
  executionCount,
  lastExecutedAt,
  trigger,
  className,
}: BaleybotCardProps) {
  const config = statusConfig[status];
  const StatusIcon = config.Icon;

  const formatTimeAgo = (date: Date) => {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  return (
    <Link href={ROUTES.baleybots.detail(id)}>
      <div
        className={cn(
          'card-playful group cursor-pointer rounded-2xl overflow-hidden',
          className
        )}
      >
        {/* Status color bar */}
        <div className={cn(
          'h-1 transition-all duration-300 group-hover:h-1.5',
          status === 'active' && 'bg-gradient-to-r from-emerald-400 to-emerald-500',
          status === 'draft' && 'bg-gradient-to-r from-primary/60 to-primary',
          status === 'paused' && 'bg-gradient-to-r from-amber-400 to-amber-500',
          status === 'error' && 'bg-gradient-to-r from-red-400 to-red-500',
        )} />

        <div className="p-5">
          <div className="flex items-start gap-4">
            {/* Icon */}
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/10 to-accent/10 text-2xl shrink-0 transition-transform duration-300 group-hover:scale-110 group-hover:rotate-3">
              {icon || '🤖'}
            </div>

            <div className="flex-1 min-w-0">
              {/* Header */}
              <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                <h3 className="font-semibold text-base truncate transition-colors group-hover:text-primary">
                  {name}
                </h3>
                <span className={cn(config.className, 'shrink-0')}>
                  <StatusIcon className="h-3 w-3" />
                  {config.label}
                </span>
                {trigger && trigger.type !== 'manual' && (
                  <TriggerBadge trigger={trigger} />
                )}
              </div>

              {/* Description */}
              {description && (
                <p className="text-sm text-muted-foreground line-clamp-2 mb-3">
                  {description}
                </p>
              )}

              {/* Footer stats */}
              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <Play className="h-3.5 w-3.5" />
                  <span className="font-medium">{executionCount}</span> runs
                </span>
                {lastExecutedAt && (
                  <span className="flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5" />
                    {formatTimeAgo(lastExecutedAt)}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </Link>
  );
}
