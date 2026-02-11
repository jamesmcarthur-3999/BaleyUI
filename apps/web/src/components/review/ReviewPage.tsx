'use client';

import { useState, useEffect, useRef } from 'react';
import type { VisualEntity } from '@/lib/baleybot/creator-types';
import type { RuntimeInterfaceSpec, TriggerConfig } from '@/lib/baleybot/types';
import type { ValidationStatus } from '@/lib/baleybot/creator-validation';
import { resolveReviewComponents } from '@/lib/baleybot/review-component-resolver';
import { ReviewExecutionProvider } from './ReviewExecutionContext';
import { ChatInterface } from './ChatInterface';
import { ResultView } from './ResultView';
import { ExecutionFlowReview } from './ExecutionFlowReview';
import { ValidationIndicator } from './ValidationIndicator';
import { DynamicTestRenderer } from './DynamicTestRenderer';
import { cn } from '@/lib/utils';
import { trpc } from '@/lib/trpc/client';

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
  onExecutionComplete?: (result: { success: boolean; executionId: string | null; durationMs: number }) => void;
  className?: string;
}

// ============================================================================
// HEURISTIC FALLBACK SPEC
// ============================================================================

function buildFallbackSpec(args: {
  entities: Array<{ name: string; tools: string[]; purpose: string }>;
  triggerConfig?: TriggerConfig;
  topology: string;
}): RuntimeInterfaceSpec {
  const resolved = resolveReviewComponents(args);
  const hasExecutionFlow = resolved.some(c => c.type === 'execution_flow');

  const components: RuntimeInterfaceSpec['components'] = [
    { type: 'chat_input', id: 'fallback-chat', label: 'Chat' },
  ];

  if (hasExecutionFlow) {
    components.push({ type: 'cluster_trace', id: 'fallback-flow', showEntityTiming: true });
  }

  components.push({ type: 'result_view', id: 'fallback-result', format: 'mixed' });

  return {
    version: 1,
    mode: 'chat',
    components,
  };
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
  onExecutionComplete,
  className,
}: ReviewPageProps) {
  const [spec, setSpec] = useState<RuntimeInterfaceSpec | null>(null);
  const [isDesigning, setIsDesigning] = useState(false);
  const designRequestedRef = useRef(false);

  const designMutation = trpc.baleybots.designTestInterface.useMutation({
    onSuccess: (data) => {
      setSpec(data as RuntimeInterfaceSpec);
      setIsDesigning(false);
    },
    onError: () => {
      // Fall back to heuristic spec
      setSpec(buildFallbackSpec({
        entities: entities.map(e => ({ name: e.name, tools: e.tools, purpose: e.purpose })),
        triggerConfig,
        topology,
      }));
      setIsDesigning(false);
    },
  });

  // Request AI-designed test interface on mount (ref prevents duplicate on re-mount)
  useEffect(() => {
    if (!designRequestedRef.current && balCode) {
      designRequestedRef.current = true;
      setIsDesigning(true);
      designMutation.mutate({ baleybotId });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baleybotId, balCode]);

  // Use heuristic fallback while AI is loading
  const activeSpec = spec ?? buildFallbackSpec({
    entities: entities.map(e => ({ name: e.name, tools: e.tools, purpose: e.purpose })),
    triggerConfig,
    topology,
  });

  return (
    <ReviewExecutionProvider baleybotId={baleybotId} onExecutionComplete={onExecutionComplete}>
      <div className={cn('h-full flex flex-col gap-3', className)}>
        {/* Header */}
        <div className="shrink-0 rounded-xl border border-border/50 bg-background/80 px-3.5 py-2.5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            {botIcon && <span className="text-lg">{botIcon}</span>}
            <div>
              <p className="text-sm font-medium">
                Test {botName || 'your bot'}
              </p>
              <p className="text-[11px] text-muted-foreground">
                {isDesigning
                  ? 'Designing test interface...'
                  : activeSpec.rationale || 'Interact with your creation before going live'}
              </p>
            </div>
          </div>
          <ValidationIndicator status={validationStatus} />
        </div>

        {/* Dynamic test interface */}
        <DynamicTestRenderer
          spec={activeSpec}
          balCode={balCode}
          className="flex-1 min-h-0"
        />
      </div>
    </ReviewExecutionProvider>
  );
}
