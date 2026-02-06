'use client';

import Link from 'next/link';
import { Play, Clock, Zap, AlertCircle, Pause, FileQuestion, MoreHorizontal, Trash2, Bot, Pencil } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ROUTES } from '@/lib/routes';
import { cn } from '@/lib/utils';

import { Badge } from '@/components/ui/badge';
import { TriggerBadge } from './TriggerConfig';

import type { TriggerConfig } from '@/lib/baleybot/types';

interface BaleybotCardProps {
  id: string;
  name: string;
  description: string | null;
  icon: string | null;
  status: 'draft' | 'active' | 'paused' | 'error';
  version: number;
  executionCount: number;
  lastExecutedAt: Date | null;
  trigger?: TriggerConfig;
  isInternal?: boolean;
  adminEdited?: boolean;
  href?: string;
  className?: string;
  onExecute?: (id: string) => void;
  onPause?: (id: string) => void;
  onActivate?: (id: string) => void;
  onDelete?: (id: string) => void;
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
  version: _version,
  executionCount,
  lastExecutedAt,
  trigger,
  isInternal,
  adminEdited,
  href,
  className,
  onExecute,
  onPause,
  onActivate,
  onDelete,
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
    <Link href={href ?? ROUTES.baleybots.detail(id)}>
      <div
        className={cn(
          'card-playful group relative cursor-pointer rounded-2xl overflow-hidden',
          className
        )}
      >
        {/* Actions dropdown */}
        <div
          className="absolute top-3 right-3 z-10"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
        >
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onExecute?.(id)}>
                <Play className="mr-2 h-4 w-4" />
                Execute
              </DropdownMenuItem>
              {status !== 'active' && (
                <DropdownMenuItem onClick={() => onActivate?.(id)}>
                  <Zap className="mr-2 h-4 w-4" />
                  Activate
                </DropdownMenuItem>
              )}
              {status === 'active' && (
                <DropdownMenuItem onClick={() => onPause?.(id)}>
                  <Pause className="mr-2 h-4 w-4" />
                  Pause
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive"
                onClick={() => onDelete?.(id)}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Status color bar */}
        <div className={cn(
          'h-1 transition-[height] duration-300 group-hover:h-1.5',
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
                {isInternal && (
                  <Badge variant="secondary" className="bg-violet-500/10 text-violet-600 border-violet-500/20 shrink-0">
                    <Bot className="h-3 w-3 mr-1" />
                    System
                  </Badge>
                )}
                {adminEdited && (
                  <Badge variant="outline" className="text-amber-600 border-amber-500/30 shrink-0">
                    <Pencil className="h-3 w-3 mr-1" />
                    Customized
                  </Badge>
                )}
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
