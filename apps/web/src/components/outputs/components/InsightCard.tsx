'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Info,
  CheckCircle,
  AlertTriangle,
  AlertCircle,
} from 'lucide-react';
import type { InsightCardConfig, InsightSeverity } from '@/lib/outputs/types';
import { cn } from '@/lib/utils';

// ============================================================================
// TYPES
// ============================================================================

interface InsightCardProps {
  config: InsightCardConfig;
  className?: string;
}

// ============================================================================
// HELPERS
// ============================================================================

const severityConfig: Record<
  InsightSeverity,
  {
    icon: typeof Info;
    bgClass: string;
    borderClass: string;
    badgeVariant: 'default' | 'secondary' | 'destructive' | 'outline';
  }
> = {
  info: {
    icon: Info,
    bgClass: 'bg-blue-50/50 dark:bg-blue-950/20',
    borderClass: 'border-blue-500/50',
    badgeVariant: 'secondary',
  },
  success: {
    icon: CheckCircle,
    bgClass: 'bg-green-50/50 dark:bg-green-950/20',
    borderClass: 'border-green-500/50',
    badgeVariant: 'default',
  },
  warning: {
    icon: AlertTriangle,
    bgClass: 'bg-yellow-50/50 dark:bg-yellow-950/20',
    borderClass: 'border-yellow-500/50',
    badgeVariant: 'outline',
  },
  critical: {
    icon: AlertCircle,
    bgClass: 'bg-red-50/50 dark:bg-red-950/20',
    borderClass: 'border-red-500/50',
    badgeVariant: 'destructive',
  },
};

// ============================================================================
// COMPONENT
// ============================================================================

export function InsightCard({ config, className }: InsightCardProps) {
  const { title, description, severity, evidence, recommendations } = config;

  const { icon: Icon, bgClass, borderClass, badgeVariant } =
    severityConfig[severity];

  return (
    <Card className={cn(bgClass, borderClass, className)}>
      <CardHeader className="flex flex-row items-start gap-3 space-y-0 pb-2">
        <Icon className="h-5 w-5 mt-0.5 shrink-0" />
        <div className="flex-1 space-y-1">
          <div className="flex items-center gap-2">
            <CardTitle className="text-sm font-medium">{title}</CardTitle>
            <Badge variant={badgeVariant} className="text-xs capitalize">
              {severity}
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">{description}</p>

        {evidence && evidence.length > 0 && (
          <div className="space-y-1">
            <p className="text-xs font-medium">Evidence:</p>
            <ul className="text-xs text-muted-foreground list-disc pl-4 space-y-0.5">
              {evidence.map((item, i) => (
                <li key={i}>{item}</li>
              ))}
            </ul>
          </div>
        )}

        {recommendations && recommendations.length > 0 && (
          <div className="space-y-1">
            <p className="text-xs font-medium">Recommendations:</p>
            <ul className="text-xs text-muted-foreground list-disc pl-4 space-y-0.5">
              {recommendations.map((item, i) => (
                <li key={i}>{item}</li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
