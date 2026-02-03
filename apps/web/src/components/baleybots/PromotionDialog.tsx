'use client';

import { useState } from 'react';
import { Sparkles, Bot, Wrench, X, ArrowRight, Check, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { PromotableItem, PromotionResult } from '@/lib/baleybot/services/promotion-service';

interface PromotionDialogProps {
  item: PromotableItem;
  onPromote: (options: { name?: string; description?: string }) => Promise<PromotionResult>;
  onClose: () => void;
  className?: string;
}

export function PromotionDialog({
  item,
  onPromote,
  onClose,
  className,
}: PromotionDialogProps) {
  const [name, setName] = useState(
    item.type === 'tool'
      ? (item.config as { name: string }).name
      : (item.config as { name: string }).name
  );
  const [description, setDescription] = useState(
    item.type === 'tool'
      ? (item.config as { description: string }).description
      : (item.config as { goal: string }).goal
  );
  const [isPromoting, setIsPromoting] = useState(false);
  const [result, setResult] = useState<PromotionResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handlePromote = async () => {
    setIsPromoting(true);
    setError(null);

    try {
      const promotionResult = await onPromote({ name, description });
      setResult(promotionResult);

      if (!promotionResult.success) {
        setError(promotionResult.message);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Promotion failed');
    } finally {
      setIsPromoting(false);
    }
  };

  const Icon = item.type === 'tool' ? Wrench : Bot;
  const typeLabel = item.type === 'tool' ? 'Tool' : 'Agent';

  // Success state
  if (result?.success) {
    return (
      <div
        className={cn(
          'fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50',
          className
        )}
        onClick={onClose}
      >
        <div
          className="w-full max-w-md bg-card border border-border rounded-2xl shadow-xl p-6 text-center"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-emerald-500/10 mb-4">
            <Check className="h-8 w-8 text-emerald-500" />
          </div>
          <h3 className="text-xl font-semibold mb-2">Promoted Successfully</h3>
          <p className="text-muted-foreground mb-6">{result.message}</p>
          <button
            onClick={onClose}
            className="px-6 py-2.5 rounded-lg bg-primary text-primary-foreground font-medium hover:opacity-90 transition-opacity"
          >
            Done
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50',
        className
      )}
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-card border border-border rounded-2xl shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Sparkles className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h3 className="font-semibold">Promote to Workspace</h3>
              <p className="text-sm text-muted-foreground">
                Save this ephemeral {typeLabel.toLowerCase()} for reuse
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-muted transition-colors"
          >
            <X className="h-5 w-5 text-muted-foreground" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          {/* Item preview */}
          <div className="flex items-start gap-3 p-4 rounded-xl bg-muted/50">
            <div className={cn(
              'p-2 rounded-lg',
              item.type === 'tool' ? 'bg-emerald-500/10' : 'bg-blue-500/10'
            )}>
              <Icon className={cn(
                'h-5 w-5',
                item.type === 'tool' ? 'text-emerald-500' : 'text-blue-500'
              )} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm">{typeLabel}</p>
              <p className="text-sm text-muted-foreground truncate">
                {item.type === 'tool'
                  ? (item.config as { implementation: string }).implementation
                  : (item.config as { goal: string }).goal}
              </p>
            </div>
            <ArrowRight className="h-5 w-5 text-muted-foreground shrink-0" />
            <div className="text-right">
              <p className="font-medium text-sm text-primary">Workspace</p>
              <p className="text-sm text-muted-foreground">Permanent</p>
            </div>
          </div>

          {/* Name input */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={cn(
                'w-full px-4 py-2.5 rounded-lg',
                'border border-border bg-background',
                'focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/50',
                'text-sm'
              )}
              placeholder={`Enter ${typeLabel.toLowerCase()} name`}
            />
          </div>

          {/* Description input */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">
              {item.type === 'tool' ? 'Description' : 'Goal'}
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className={cn(
                'w-full px-4 py-2.5 rounded-lg',
                'border border-border bg-background',
                'focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/50',
                'text-sm resize-none'
              )}
              placeholder={
                item.type === 'tool'
                  ? 'What does this tool do?'
                  : 'What should this agent accomplish?'
              }
            />
          </div>

          {/* Error message */}
          {error && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-border">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm font-medium hover:bg-muted transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handlePromote}
            disabled={isPromoting || !name.trim()}
            className={cn(
              'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium',
              'bg-primary text-primary-foreground',
              'hover:opacity-90 transition-opacity',
              'disabled:opacity-50 disabled:cursor-not-allowed'
            )}
          >
            {isPromoting ? (
              <>
                <span className="h-4 w-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                Promoting...
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" />
                Promote to Workspace
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Compact promotion button for execution details
 */
export function PromoteButton({
  onClick,
  type,
  className,
}: {
  onClick: () => void;
  type: 'tool' | 'agent';
  className?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex items-center gap-1.5 px-3 py-1.5 rounded-lg',
        'text-xs font-medium',
        'bg-primary/10 text-primary hover:bg-primary/20',
        'transition-colors',
        className
      )}
    >
      <Sparkles className="h-3.5 w-3.5" />
      Promote {type === 'tool' ? 'Tool' : 'Agent'}
    </button>
  );
}
