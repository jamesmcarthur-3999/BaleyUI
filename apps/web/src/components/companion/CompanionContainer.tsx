'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
    <div className="flex items-center gap-1 bg-muted/50 rounded-lg p-1">
      {modes.map(({ value, icon: Icon, label }) => (
        <Button
          key={value}
          variant={mode === value ? 'secondary' : 'ghost'}
          size="sm"
          className={cn(
            'h-7 px-2 gap-1.5',
            mode === value && 'bg-background shadow-sm'
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
      <Badge variant="secondary" className="gap-1 animate-pulse">
        <div className="h-2 w-2 rounded-full bg-primary animate-pulse" />
        Thinking...
      </Badge>
    );
  }

  if (state.isListening) {
    return (
      <Badge variant="secondary" className="gap-1">
        <div className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
        Listening
      </Badge>
    );
  }

  if (!state.isConnected) {
    return (
      <Badge variant="outline" className="gap-1 text-muted-foreground">
        <div className="h-2 w-2 rounded-full bg-muted-foreground" />
        Offline
      </Badge>
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
}: {
  state: CompanionState;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'relative h-14 w-14 rounded-full',
        'bg-gradient-to-br from-primary to-primary/80',
        'shadow-lg shadow-primary/25',
        'flex items-center justify-center',
        'transition-[transform,box-shadow] duration-300 ease-out',
        'hover:scale-110 hover:shadow-xl hover:shadow-primary/30',
        'focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2',
        state.isThinking && 'animate-pulse'
      )}
    >
      <Sparkles className="h-6 w-6 text-primary-foreground" />

      {/* Listening indicator */}
      {state.isListening && (
        <div className="absolute -top-1 -right-1">
          <div className="h-4 w-4 rounded-full bg-red-500 flex items-center justify-center">
            <Mic className="h-2.5 w-2.5 text-white" />
          </div>
        </div>
      )}

      {/* Thinking animation */}
      {state.isThinking && (
        <div className="absolute inset-0 rounded-full">
          <div className="absolute inset-0 rounded-full border-2 border-primary-foreground/30 animate-ping" />
        </div>
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
          <div className="flex items-center gap-2 bg-background rounded-full px-2 py-1 border shadow-lg">
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
          'w-96 bg-background',
          'border rounded-xl shadow-2xl',
          'flex flex-col',
          'max-h-[80vh]',
          'animate-in slide-in-from-bottom-4 fade-in duration-200'
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-3 border-b">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-full bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center">
              <Sparkles className="h-4 w-4 text-primary-foreground" />
            </div>
            <div>
              <h3 className="text-sm font-medium">AI Companion</h3>
              <StatusIndicator state={state} />
            </div>
          </div>

          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={toggleListening}
            >
              {state.isListening ? (
                <MicOff className="h-4 w-4 text-destructive" />
              ) : (
                <Mic className="h-4 w-4" />
              )}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => handleModeChange('orb')}
            >
              <Minimize2 className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => handleModeChange('collapsed')}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Mode Switcher */}
        <div className="p-2 border-b">
          <ModeSwitcher mode={mode} onModeChange={handleModeChange} />
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-auto min-h-[300px]">
          {children}

          {/* Placeholder content when no children */}
          {!children && mode === 'chat' && (
            <div className="h-full flex flex-col items-center justify-center text-center p-6">
              <MessageCircle className="h-12 w-12 text-muted-foreground mb-4" />
              <h4 className="font-medium">Chat Mode</h4>
              <p className="text-sm text-muted-foreground mt-1">
                Have a conversation with your AI assistant
              </p>
            </div>
          )}

          {!children && mode === 'command' && (
            <div className="h-full flex flex-col items-center justify-center text-center p-6">
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

        {/* Footer with settings */}
        <div className="p-2 border-t flex items-center justify-end">
          <Button variant="ghost" size="sm" className="gap-1.5 text-xs">
            <Settings className="h-3.5 w-3.5" />
            Settings
          </Button>
        </div>
      </div>
    </div>
  );
}
