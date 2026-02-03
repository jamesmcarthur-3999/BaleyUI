'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  AlertCircle,
  AlertTriangle,
  Clock,
  Zap,
  ExternalLink,
} from 'lucide-react';
import type { ActionCardConfig } from '@/lib/outputs/types';
import { cn } from '@/lib/utils';

// ============================================================================
// TYPES
// ============================================================================

interface ActionCardProps {
  config: ActionCardConfig;
  className?: string;
  onAction?: (actionLabel: string) => void;
}

// ============================================================================
// HELPERS
// ============================================================================

const priorityConfig: Record<
  NonNullable<ActionCardConfig['priority']>,
  { icon: typeof Clock; color: string; label: string }
> = {
  low: {
    icon: Clock,
    color: 'text-muted-foreground',
    label: 'Low Priority',
  },
  medium: {
    icon: Zap,
    color: 'text-blue-500',
    label: 'Medium Priority',
  },
  high: {
    icon: AlertTriangle,
    color: 'text-yellow-500',
    label: 'High Priority',
  },
  urgent: {
    icon: AlertCircle,
    color: 'text-red-500',
    label: 'Urgent',
  },
};

// ============================================================================
// COMPONENT
// ============================================================================

export function ActionCard({ config, className, onAction }: ActionCardProps) {
  const { title, description, actions, priority } = config;

  const priorityInfo = priority ? priorityConfig[priority] : null;
  const PriorityIcon = priorityInfo?.icon;

  const handleClick = (action: ActionCardConfig['actions'][0]) => {
    if (action.href) {
      window.open(action.href, '_blank', 'noopener,noreferrer');
    } else if (action.onClick && onAction) {
      onAction(action.onClick);
    }
  };

  return (
    <Card className={cn(className)}>
      <CardHeader className="flex flex-row items-start gap-3 space-y-0 pb-2">
        <div className="flex-1 space-y-1">
          <div className="flex items-center gap-2">
            <CardTitle className="text-sm font-medium">{title}</CardTitle>
            {priorityInfo && (
              <Badge variant="outline" className={cn('gap-1', priorityInfo.color)}>
                {PriorityIcon && <PriorityIcon className="h-3 w-3" />}
                {priorityInfo.label}
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">{description}</p>

        {actions.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {actions.map((action, index) => (
              <Button
                key={index}
                variant={action.type === 'primary' ? 'default' : action.type === 'secondary' ? 'outline' : 'ghost'}
                size="sm"
                onClick={() => handleClick(action)}
                className={cn(action.type === 'link' && 'text-primary underline-offset-4 hover:underline')}
              >
                {action.label}
                {action.href && <ExternalLink className="h-3 w-3 ml-1" />}
              </Button>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
