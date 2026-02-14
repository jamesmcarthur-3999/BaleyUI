'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  MessageCircle,
  Sparkles,
  Command,
  Minimize2,
  X,
  Settings,
  Mic,
  MicOff,
} from 'lucide-react';

// ============================================================================
// TYPES
// ============================================================================

export type CompanionMode = 'collapsed' | 'orb' | 'chat' | 'command';

export interface CompanionState {
  mode: CompanionMode;
  isListening: boolean;
  isThinking: boolean;
  isConnected: boolean;
}

interface CompanionContainerProps {
  className?: string;
  defaultMode?: CompanionMode;
  position?: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';
  children?: React.ReactNode;
  onModeChange?: (mode: CompanionMode) => void;
  /** When true, the orb pulses to indicate workspace issues */
  hasAlert?: boolean;
}

// ============================================================================
// MODE SWITCHER
// ============================================================================

function ModeSwitcher({
  mode,
  onModeChange,
}: {
  mode: CompanionMode;
  onModeChange: (mode: CompanionMode) => void;
}) {
  const modes: { value: CompanionMode; icon: typeof MessageCircle; label: string }[] = [
    { value: 'orb', icon: Sparkles, label: 'Orb' },
    { value: 'chat', icon: MessageCircle, label: 'Chat' },
    { value: 'command', icon: Command, label: 'Commands' },
  ];

  return (
    <div className="flex items-center gap-1 bg-foreground/[0.03] rounded-xl p-0.5">
      {modes.map(({ value, icon: Icon, label }) => (
        <Button
          key={value}
          variant={mode === value ? 'secondary' : 'ghost'}
          size="sm"
          className={cn(
            'h-7 px-2 gap-1.5',
            mode === value && 'bg-background/80 shadow-sm backdrop-blur-sm'
          )}
          onClick={() => onModeChange(value)}
        >
          <Icon className="h-3.5 w-3.5" />
          <span className="text-xs">{label}</span>
        </Button>
      ))}
    </div>
  );
}

// ============================================================================
// STATUS INDICATOR
// ============================================================================

function StatusIndicator({
  state,
}: {
  state: CompanionState;
}) {
  if (state.isThinking) {
    return (
      <span className="text-xs text-muted-foreground/70">Thinking...</span>
    );
  }

  if (state.isListening) {
    return (
      <span className="text-xs text-muted-foreground/70">Listening</span>
    );
  }

  if (!state.isConnected) {
    return (
      <span className="text-xs text-muted-foreground/70">Offline</span>
    );
  }

  return null;
}

// ============================================================================
// COMPANION ORB (MINIMIZED VIEW)
// ============================================================================

function CompanionOrb({
  state,
  onClick,
  hasAlert,
}: {
  state: CompanionState;
  onClick: () => void;
  hasAlert?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'relative h-14 w-14 rounded-full',
        'bg-primary',
        'shadow-md shadow-primary/15',
        'flex items-center justify-center',
        'transition-[transform,box-shadow] duration-300 ease-out',
        'hover:scale-105 hover:shadow-[0_0_20px_8px_hsl(var(--primary)/0.2)]',
        'focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2',
        state.isThinking && 'animate-orb-breathe'
      )}
    >
      <div className="h-6 w-6 rounded-full bg-primary-foreground/90" />

      {/* Alert indicator */}
      {hasAlert && !state.isListening && (
        <div className="absolute -top-1 -right-1">
          <div className="h-4 w-4 rounded-full bg-amber-500 border-2 border-background" />
        </div>
      )}

      {/* Listening indicator */}
      {state.isListening && (
        <div className="absolute -top-1 -right-1">
          <div className="h-4 w-4 rounded-full bg-red-500 flex items-center justify-center">
            <Mic className="h-2.5 w-2.5 text-white" />
          </div>
        </div>
      )}

      {/* Thinking animation - single expanding ring */}
      {state.isThinking && (
        <div className="absolute inset-0 rounded-full border-2 border-primary-foreground/20 animate-orb-ring-expand" />
      )}
    </button>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function CompanionContainer({
  className,
  defaultMode = 'collapsed',
  position = 'bottom-right',
  children,
  onModeChange,
  hasAlert,
}: CompanionContainerProps) {
  const [mode, setMode] = useState<CompanionMode>(defaultMode);
  const [state, setState] = useState<CompanionState>({
    mode: defaultMode,
    isListening: false,
    isThinking: false,
    isConnected: true,
  });

  const positionClasses: Record<string, string> = {
    'bottom-right': 'bottom-4 right-4',
    'bottom-left': 'bottom-4 left-4',
    'top-right': 'top-4 right-4',
    'top-left': 'top-4 left-4',
  };

  const handleModeChange = (newMode: CompanionMode) => {
    setMode(newMode);
    setState((prev) => ({ ...prev, mode: newMode }));
    onModeChange?.(newMode);
  };

  const toggleListening = () => {
    setState((prev) => ({ ...prev, isListening: !prev.isListening }));
  };

  // Collapsed state - just show the orb
  if (mode === 'collapsed') {
    return (
      <div
        className={cn(
          'fixed z-50',
          positionClasses[position],
          className
        )}
      >
        <CompanionOrb
          state={state}
          onClick={() => handleModeChange('orb')}
          hasAlert={hasAlert}
        />
      </div>
    );
  }

  // Orb mode - floating orb with quick actions
  if (mode === 'orb') {
    return (
      <div
        className={cn(
          'fixed z-50',
          positionClasses[position],
          className
        )}
      >
        <div className="flex flex-col items-end gap-3">
          {/* Quick action buttons */}
          <div className="flex items-center gap-2 glass-surface rounded-full px-2 py-1 elevation-2">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-full"
              onClick={() => handleModeChange('chat')}
            >
              <MessageCircle className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-full"
              onClick={() => handleModeChange('command')}
            >
              <Command className="h-4 w-4" />
            </Button>
            <Button
              variant={state.isListening ? 'destructive' : 'ghost'}
              size="icon"
              className="h-8 w-8 rounded-full"
              onClick={toggleListening}
            >
              {state.isListening ? (
                <MicOff className="h-4 w-4" />
              ) : (
                <Mic className="h-4 w-4" />
              )}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-full"
              onClick={() => handleModeChange('collapsed')}
            >
              <Minimize2 className="h-4 w-4" />
            </Button>
          </div>

          {/* The orb */}
          <CompanionOrb
            state={state}
            onClick={() => handleModeChange('chat')}
            hasAlert={hasAlert}
          />
        </div>
      </div>
    );
  }

  // Chat or Command mode - full panel
  return (
    <div
      className={cn(
        'fixed z-50',
        positionClasses[position],
        className
      )}
    >
      <div
        className={cn(
          'w-full sm:w-96 glass-panel',
          'rounded-2xl elevation-3',
          'flex flex-col relative',
          'max-h-[80vh]',
          'animate-companion-panel-enter'
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-3">
          <div className="flex items-center gap-2.5">
            <div className="h-2.5 w-2.5 rounded-full bg-primary" />
            <div>
              <h3 className="text-sm font-medium text-foreground/90">Baley</h3>
              <StatusIndicator state={state} />
            </div>
          </div>

          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 rounded-full text-muted-foreground/60 hover:text-foreground"
              onClick={toggleListening}
            >
              {state.isListening ? (
                <MicOff className="h-3.5 w-3.5 text-destructive" />
              ) : (
                <Mic className="h-3.5 w-3.5" />
              )}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 rounded-full text-muted-foreground/60 hover:text-foreground"
              onClick={() => handleModeChange('orb')}
            >
              <Minimize2 className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 rounded-full text-muted-foreground/60 hover:text-foreground"
              onClick={() => handleModeChange('collapsed')}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        {/* Mode Switcher */}
        <div className="px-3 pb-2">
          <ModeSwitcher mode={mode} onModeChange={handleModeChange} />
        </div>

        {/* Content Area — not a scroll container; ChatThread handles scrolling */}
        <div className="flex-1 min-h-0 overflow-hidden">
          {children}

          {/* Placeholder content when no children */}
          {!children && mode === 'chat' && (
            <div className="h-full min-h-[300px] flex flex-col items-center justify-center text-center p-6">
              <MessageCircle className="h-12 w-12 text-muted-foreground mb-4" />
              <h4 className="font-medium">Chat Mode</h4>
              <p className="text-sm text-muted-foreground mt-1">
                Have a conversation with your AI assistant
              </p>
            </div>
          )}

          {!children && mode === 'command' && (
            <div className="h-full min-h-[300px] flex flex-col items-center justify-center text-center p-6">
              <Command className="h-12 w-12 text-muted-foreground mb-4" />
              <h4 className="font-medium">Command Palette</h4>
              <p className="text-sm text-muted-foreground mt-1">
                Press{' '}
                <kbd className="px-1.5 py-0.5 rounded bg-muted text-xs">
                  Cmd+K
                </kbd>{' '}
                for quick commands
              </p>
            </div>
          )}
        </div>

        {/* Footer with settings — absolute so it doesn't consume layout space */}
        <div className="absolute bottom-1 right-1 opacity-0 hover:opacity-100 transition-opacity duration-200 z-10">
          <Button variant="ghost" size="sm" className="gap-1.5 text-xs">
            <Settings className="h-3.5 w-3.5" />
            Settings
          </Button>
        </div>
      </div>
    </div>
  );
}
