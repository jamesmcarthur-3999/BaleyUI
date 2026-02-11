'use client';

import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  MessageCircle,
  Sparkles,
  Command,
  Mic,
  MicOff,
  Zap,
  AlertCircle,
  CheckCircle,
  X,
} from 'lucide-react';

// ============================================================================
// TYPES
// ============================================================================

export type OrbState =
  | 'idle'
  | 'listening'
  | 'thinking'
  | 'speaking'
  | 'success'
  | 'error';

export interface OrbActivity {
  id: string;
  type: 'task' | 'notification' | 'alert';
  message: string;
  timestamp: Date;
  status: 'pending' | 'in-progress' | 'completed' | 'failed';
}

interface OrbModeProps {
  state?: OrbState;
  activities?: OrbActivity[];
  onExpand?: () => void;
  onChat?: () => void;
  onCommand?: () => void;
  onVoiceToggle?: () => void;
  isListening?: boolean;
  className?: string;
}

// ============================================================================
// ORB GLOW EFFECT
// ============================================================================

function OrbGlow({
  state,
  pulsing,
}: {
  state: OrbState;
  pulsing: boolean;
}) {
  const glowColors: Record<OrbState, string> = {
    idle: 'transparent',
    listening: 'hsl(0 72% 51% / 0.25)',
    thinking: 'hsl(262 83% 58% / 0.3)',
    speaking: 'hsl(217 91% 60% / 0.25)',
    success: 'hsl(152 69% 45% / 0.25)',
    error: 'hsl(0 72% 51% / 0.3)',
  };

  return (
    <div
      className={cn(
        'absolute inset-0 rounded-full',
        'scale-150 blur-sm',
        'transition-opacity duration-500 ease-out',
        pulsing ? 'opacity-100' : 'opacity-0'
      )}
      style={{
        background: `radial-gradient(circle, ${glowColors[state]}, transparent)`,
      }}
    />
  );
}

// ============================================================================
// ORB CORE
// ============================================================================

function OrbCore({
  state,
  onClick,
}: {
  state: OrbState;
  onClick: () => void;
}) {
  const stateColors: Record<OrbState, string> = {
    idle: 'bg-primary shadow-md shadow-primary/10',
    listening: 'bg-red-500 shadow-md shadow-red-500/20',
    thinking: 'bg-primary shadow-md shadow-primary/15',
    speaking: 'bg-blue-500 shadow-md shadow-blue-500/15',
    success: 'bg-green-500 shadow-md shadow-green-500/15',
    error: 'bg-red-500 shadow-md shadow-red-500/15',
  };

  const StateIcon =
    state === 'listening' ? Mic
    : state === 'error' ? AlertCircle
    : state === 'success' ? CheckCircle
    : Sparkles;

  return (
    <button
      onClick={onClick}
      aria-label={`AI assistant - ${state}`}
      className={cn(
        'relative h-14 w-14 rounded-full',
        stateColors[state],
        'flex items-center justify-center',
        'transition-all duration-500 ease-out',
        'hover:scale-105',
        'focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2',
        state === 'thinking' && 'animate-orb-breathe'
      )}
    >
      {/* Icon */}
      <StateIcon className="h-6 w-6 text-primary-foreground relative z-10" />

      {/* Thinking ring */}
      {state === 'thinking' && (
        <div className="absolute inset-0 rounded-full border-2 border-primary-foreground/20 animate-orb-ring-expand" />
      )}

      {/* Listening indicator */}
      {state === 'listening' && (
        <div className="absolute -inset-1 rounded-full border-2 border-red-400/40 animate-pulse-soft" />
      )}
    </button>
  );
}

// ============================================================================
// ACTIVITY INDICATOR
// ============================================================================

function ActivityIndicator({
  activities,
  onDismiss,
}: {
  activities: OrbActivity[];
  onDismiss?: (id: string) => void;
}) {
  const latestActivity = activities[0];
  if (!latestActivity) return null;

  const statusIcons: Record<OrbActivity['status'], typeof Zap> = {
    pending: Zap,
    'in-progress': Sparkles,
    completed: CheckCircle,
    failed: AlertCircle,
  };

  const statusColors: Record<OrbActivity['status'], string> = {
    pending: 'text-muted-foreground',
    'in-progress': 'text-primary animate-spin',
    completed: 'text-green-500',
    failed: 'text-red-500',
  };

  const Icon = statusIcons[latestActivity.status];

  return (
    <div
      className={cn(
        'absolute -top-2 left-1/2 -translate-x-1/2 -translate-y-full',
        'glass-surface rounded-xl elevation-2',
        'px-3 py-2 min-w-[200px] max-w-[280px]',
        'animate-companion-panel-enter'
      )}
    >
      <div className="flex items-start gap-2">
        <Icon className={cn('h-4 w-4 mt-0.5 shrink-0', statusColors[latestActivity.status])} />
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium truncate">{latestActivity.message}</p>
          <p className="text-[10px] text-muted-foreground">
            {latestActivity.timestamp.toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
            })}
          </p>
        </div>
        {onDismiss && (
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5 shrink-0"
            onClick={() => onDismiss(latestActivity.id)}
          >
            <X className="h-3 w-3" />
          </Button>
        )}
      </div>

      {activities.length > 1 && (
        <p className="text-[10px] text-muted-foreground mt-1 text-center">
          +{activities.length - 1} more
        </p>
      )}
    </div>
  );
}

// ============================================================================
// QUICK ACTIONS
// ============================================================================

function QuickActions({
  visible,
  onChat,
  onCommand,
  onVoiceToggle,
  isListening,
}: {
  visible: boolean;
  onChat?: () => void;
  onCommand?: () => void;
  onVoiceToggle?: () => void;
  isListening?: boolean;
}) {
  if (!visible) return null;

  const actions = [
    { icon: MessageCircle, label: 'Chat', onClick: onChat },
    { icon: Command, label: 'Commands', onClick: onCommand },
    {
      icon: isListening ? MicOff : Mic,
      label: isListening ? 'Stop' : 'Voice',
      onClick: onVoiceToggle,
      variant: isListening ? ('destructive' as const) : ('ghost' as const),
    },
  ];

  return (
    <TooltipProvider>
      <div
        className={cn(
          'absolute -top-2 left-1/2 -translate-x-1/2 -translate-y-full',
          'flex items-center gap-1',
          'glass-surface rounded-full elevation-2',
          'px-1 py-1',
          'animate-companion-panel-enter'
        )}
      >
        {actions.map(({ icon: Icon, label, onClick, variant = 'ghost' }) => (
          <Tooltip key={label}>
            <TooltipTrigger asChild>
              <Button
                variant={variant}
                size="icon"
                className="h-8 w-8 rounded-full"
                onClick={onClick}
              >
                <Icon className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top" className="text-xs">
              {label}
            </TooltipContent>
          </Tooltip>
        ))}
      </div>
    </TooltipProvider>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function OrbMode({
  state = 'idle',
  activities = [],
  onExpand,
  onChat,
  onCommand,
  onVoiceToggle,
  isListening = false,
  className,
}: OrbModeProps) {
  const [showQuickActions, setShowQuickActions] = useState(false);
  const [dismissedActivities, setDismissedActivities] = useState<Set<string>>(new Set());

  // Filter out dismissed activities
  const activeActivities = activities.filter(
    (a) => !dismissedActivities.has(a.id)
  );

  // Show quick actions on hover
  const handleMouseEnter = () => setShowQuickActions(true);
  const handleMouseLeave = () => setShowQuickActions(false);

  // Dismiss activity
  const handleDismissActivity = (id: string) => {
    setDismissedActivities((prev) => new Set([...prev, id]));
  };

  // Auto-dismiss success/error after delay
  useEffect(() => {
    if (state === 'success' || state === 'error') {
      const timer = setTimeout(() => {
        // Could trigger state change callback here
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [state]);

  const isPulsing = state === 'thinking' || state === 'listening';
  const hasActivities = activeActivities.length > 0;

  return (
    <div
      className={cn('relative inline-flex', className)}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/* Glow effect */}
      <OrbGlow state={state} pulsing={isPulsing} />

      {/* Activity indicator (when not hovering) */}
      {hasActivities && !showQuickActions && (
        <ActivityIndicator
          activities={activeActivities}
          onDismiss={handleDismissActivity}
        />
      )}

      {/* Quick actions (when hovering) */}
      <QuickActions
        visible={showQuickActions && !hasActivities}
        onChat={onChat}
        onCommand={onCommand}
        onVoiceToggle={onVoiceToggle}
        isListening={isListening}
      />

      {/* The orb */}
      <OrbCore state={state} onClick={onExpand || (() => {})} />

      {/* Activity count badge */}
      {activeActivities.length > 0 && (
        <div
          className={cn(
            'absolute -top-1 -right-1',
            'h-5 w-5 rounded-full',
            'bg-primary text-primary-foreground',
            'text-[10px] font-medium',
            'flex items-center justify-center',
            'shadow-sm'
          )}
        >
          {activeActivities.length > 9 ? '9+' : activeActivities.length}
        </div>
      )}
    </div>
  );
}
