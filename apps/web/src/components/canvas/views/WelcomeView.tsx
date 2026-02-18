'use client';

import {
  Bot,
  Palette,
  ShoppingCart,
  BarChart3,
  MessageSquare,
  Sparkles,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { CANVAS_QUICK_ACTIONS } from '@/components/canvas/quick-actions';
import { useCanvasStore } from '@/stores/canvas';

// ============================================================================
// ICON MAP
// ============================================================================

// Icons are view-specific (WelcomeView renders cards; ChatPanel renders text pills).
// Map action IDs to their icons here so quick-actions.ts stays icon-free.
const ACTION_ICONS: Record<string, React.ReactNode> = {
  dashboard: <BarChart3 className="h-5 w-5" />,
  landing: <Sparkles className="h-5 w-5" />,
  ecommerce: <ShoppingCart className="h-5 w-5" />,
  chat: <MessageSquare className="h-5 w-5" />,
};

// ============================================================================
// COMPONENT
// ============================================================================

interface WelcomeViewProps {
  onSendMessage: (message: string) => void;
  className?: string;
}

export function WelcomeView({ onSendMessage, className }: WelcomeViewProps) {
  const startBrand = useCanvasStore((s) => s.startBrand);

  return (
    <div
      className={cn(
        'h-full flex flex-col items-center justify-center px-6',
        className,
      )}
    >
      {/* Logo / branding */}
      <div className="mb-8 text-center">
        <div className="mx-auto mb-4 h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center">
          <Bot className="h-7 w-7 text-primary" />
        </div>
        <h2 className="text-xl font-semibold tracking-tight">
          Build with Baley
        </h2>
        <p className="mt-1 text-sm text-muted-foreground max-w-xs mx-auto">
          Describe your app. Baley plans, designs the brand, writes the code,
          and shows it live.
        </p>
      </div>

      {/* Quick-start cards */}
      <div className="grid grid-cols-2 gap-3 max-w-lg w-full">
        {CANVAS_QUICK_ACTIONS.map((action) => (
          <button
            key={action.id}
            onClick={() => onSendMessage(action.prompt)}
            className="group relative flex flex-col items-start gap-2 rounded-xl border border-border/50 bg-card/50 p-4 text-left transition-all hover:border-primary/30 hover:bg-card/80 hover:shadow-sm"
          >
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-muted/60 flex items-center justify-center text-muted-foreground group-hover:text-primary group-hover:bg-primary/10 transition-colors">
                {ACTION_ICONS[action.id]}
              </div>
            </div>
            <div>
              <h3 className="text-sm font-medium">{action.label}</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                {action.description}
              </p>
            </div>
          </button>
        ))}
      </div>

      {/* Brand design entry point */}
      <button
        onClick={() => startBrand()}
        className="mt-6 flex items-center gap-3 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        <Palette className="h-3.5 w-3.5" />
        <span>or start from your brand design package</span>
      </button>
    </div>
  );
}
