'use client';

import type { VisualEntity } from '@/lib/baleybot/creator-types';
import type { TriggerConfig } from '@/lib/baleybot/types';
import type { ValidationStatus } from '@/lib/baleybot/creator-validation';
import { resolveReviewComponents } from '@/lib/baleybot/review-component-resolver';
import { ReviewExecutionProvider } from './ReviewExecutionContext';
import { ChatInterface } from './ChatInterface';
import { ResultView } from './ResultView';
import { ExecutionFlowReview } from './ExecutionFlowReview';
import { ValidationIndicator } from './ValidationIndicator';
import { cn } from '@/lib/utils';

// ============================================================================
// TYPES
// ============================================================================

interface ReviewPageProps {
  baleybotId: string;
  balCode: string;
  entities: VisualEntity[];
  triggerConfig?: TriggerConfig;
  topology: string;
  validationStatus: ValidationStatus;
  botName?: string;
  botIcon?: string;
  className?: string;
}

// ============================================================================
// COMPONENT
// ============================================================================

export function ReviewPage({
  baleybotId,
  balCode,
  entities,
  triggerConfig,
  topology,
  validationStatus,
  botName,
  botIcon,
  className,
}: ReviewPageProps) {
  const components = resolveReviewComponents({
    entities: entities.map((e) => ({
      name: e.name,
      tools: e.tools,
      purpose: e.purpose,
    })),
    triggerConfig,
    topology,
  });

  const hasExecutionFlow = components.some((c) => c.type === 'execution_flow');

  return (
    <ReviewExecutionProvider baleybotId={baleybotId}>
      <div className={cn('h-full flex flex-col gap-3', className)}>
        {/* Header */}
        <div className="shrink-0 rounded-xl border border-border/50 bg-background/80 px-3.5 py-2.5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            {botIcon && <span className="text-lg">{botIcon}</span>}
            <div>
              <p className="text-sm font-medium">
                Review {botName || 'your bot'}
              </p>
              <p className="text-[11px] text-muted-foreground">
                Interact with your creation before going live
              </p>
            </div>
          </div>
          <ValidationIndicator status={validationStatus} />
        </div>

        {/* Two-column layout */}
        <div className="flex-1 min-h-0 grid grid-cols-1 xl:grid-cols-[1fr_minmax(320px,40%)] gap-4">
          {/* Left: Interaction surface */}
          <div className="h-full flex flex-col gap-3 min-h-0">
            <ChatInterface className="flex-1 min-h-0" />
          </div>

          {/* Right: Execution visualization + result */}
          <div className="h-full flex flex-col gap-3 min-h-0">
            {hasExecutionFlow && (
              <ExecutionFlowReview
                balCode={balCode}
                className="flex-1 min-h-0"
              />
            )}
            <ResultView className={hasExecutionFlow ? 'h-[200px] shrink-0' : 'flex-1 min-h-0'} />
          </div>
        </div>
      </div>
    </ReviewExecutionProvider>
  );
}
