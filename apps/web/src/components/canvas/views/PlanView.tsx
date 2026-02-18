'use client';

import { Check, Pencil, Bot, Workflow, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useCanvasStore } from '@/stores/canvas';
import type { PlanPreviewData } from '@/lib/baleybot/creator-types';
import { cn } from '@/lib/utils';

// ============================================================================
// COMPONENT
// ============================================================================

interface PlanViewProps {
  plan: PlanPreviewData;
  onSendMessage: (message: string) => void;
  className?: string;
}

export function PlanView({ plan, onSendMessage, className }: PlanViewProps) {
  const startLive = useCanvasStore((s) => s.startLive);

  const handleApprove = () => {
    // TODO: Check if workspace has design package; if not, go to brand first
    // For now, go straight to live
    startLive();
    onSendMessage('I approve the plan. Go ahead and build it.');
  };

  const handleRevise = () => {
    onSendMessage("I'd like to make some changes to the plan.");
  };

  return (
    <div className={cn('h-full overflow-y-auto p-6', className)}>
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Header */}
        <div>
          <h2 className="text-xl font-semibold tracking-tight">
            {plan.name || 'Build Plan'}
          </h2>
          {plan.description && (
            <p className="mt-1 text-sm text-muted-foreground">
              {plan.description}
            </p>
          )}
        </div>

        {/* Entities */}
        {plan.entities && plan.entities.length > 0 && (
          <div className="space-y-3">
            <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
              Components
            </h3>
            <div className="space-y-2">
              {plan.entities.map((entity, i) => (
                <div key={entity.name || i}>
                  <div className="flex items-start gap-3 rounded-lg border border-border/50 bg-card/50 p-4">
                    <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                      <Bot className="h-4 w-4 text-primary" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h4 className="text-sm font-medium">{entity.name}</h4>
                      {entity.purpose && (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {entity.purpose}
                        </p>
                      )}
                      {entity.tools && entity.tools.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {entity.tools.map((tool) => (
                            <span
                              key={tool}
                              className="text-[10px] px-1.5 py-0.5 rounded bg-muted/60 text-muted-foreground"
                            >
                              {tool}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                  {/* Downward arrow connector between cards */}
                  {i < plan.entities.length - 1 && (
                    <div className="flex justify-start py-1 pl-[1.875rem]">
                      <ArrowRight className="h-3 w-3 text-muted-foreground/40 rotate-90" />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Topology */}
        {plan.topology && (
          <div className="flex items-center gap-2 text-sm">
            <Workflow className="h-4 w-4 text-muted-foreground" />
            <span className="text-muted-foreground">Topology:</span>
            <span className="font-medium capitalize">{plan.topology}</span>
          </div>
        )}

        {/* Rationale */}
        {plan.designRationale && (
          <div className="rounded-lg bg-muted/30 p-4">
            <p className="text-sm text-muted-foreground italic">
              {plan.designRationale}
            </p>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-3 pt-2">
          <Button onClick={handleApprove} className="gap-2">
            <Check className="h-4 w-4" />
            Approve & Build
          </Button>
          <Button variant="outline" onClick={handleRevise} className="gap-2">
            <Pencil className="h-4 w-4" />
            Request Changes
          </Button>
        </div>
      </div>
    </div>
  );
}
