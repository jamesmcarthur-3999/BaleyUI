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
    idle: 'from-primary/20 to-transparent',
    listening: 'from-red-500/30 to-transparent',
    thinking: 'from-primary/40 to-transparent',
    speaking: 'from-blue-500/30 to-transparent',
    success: 'from-green-500/30 to-transparent',
    error: 'from-red-500/40 to-transparent',
  };

  return (
    <div
      className={cn(
        'absolute inset-0 rounded-full bg-gradient-radial',
        glowColors[state],
        pulsing && 'animate-pulse'
      )}
      style={{
        transform: 'scale(1.5)',
        filter: 'blur(12px)',
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
    idle: 'from-primary to-primary/80',
    listening: 'from-red-500 to-red-600',
    thinking: 'from-primary via-primary/90 to-primary/80',
    speaking: 'from-blue-500 to-blue-600',
    success: 'from-green-500 to-green-600',
    error: 'from-red-500 to-red-600',
  };

  const StateIcon =
    state === 'listening' ? Mic
    : state === 'error' ? AlertCircle
    : state === 'success' ? CheckCircle
    : Sparkles;

  return (
    <button
      onClick={onClick}
      className={cn(
        'relative h-14 w-14 rounded-full',
        'bg-gradient-to-br',
        stateColors[state],
        'shadow-lg',
        'flex items-center justify-center',
        'transition-all duration-300 ease-out',
        'hover:scale-110',
        'focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2',
        state === 'thinking' && 'animate-pulse'
      )}
    >
      {/* Inner glow */}
      <div className="absolute inset-1 rounded-full bg-white/10" />

      {/* Icon */}
      <StateIcon className="h-6 w-6 text-primary-foreground relative z-10" />

      {/* Thinking ripples */}
      {state === 'thinking' && (
        <>
          <div className="absolute inset-0 rounded-full border-2 border-primary-foreground/20 animate-ping" />
          <div
            className="absolute inset-0 rounded-full border-2 border-primary-foreground/10 animate-ping"
            style={{ animationDelay: '0.5s' }}
          />
        </>
      )}

      {/* Listening indicator */}
      {state === 'listening' && (
        <div className="absolute -inset-1 rounded-full border-2 border-red-400/50 animate-pulse" />
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
        'bg-background/95 backdrop-blur border rounded-lg shadow-lg',
        'px-3 py-2 min-w-[200px] max-w-[280px]',
        'animate-in slide-in-from-bottom-2 fade-in duration-200'
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
          'bg-background/95 backdrop-blur border rounded-full shadow-lg',
          'px-1 py-1',
          'animate-in slide-in-from-bottom-2 fade-in duration-200'
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
