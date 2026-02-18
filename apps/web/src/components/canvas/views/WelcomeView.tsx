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

// ============================================================================
// QUICK-START CARDS
// ============================================================================

interface QuickStartCard {
  id: string;
  icon: React.ReactNode;
  title: string;
  description: string;
  prompt: string;
}

const QUICK_START_CARDS: QuickStartCard[] = [
  {
    id: 'dashboard',
    icon: <BarChart3 className="h-5 w-5" />,
    title: 'Analytics Dashboard',
    description: 'Real-time metrics with charts and filters',
    prompt:
      'Build me an analytics dashboard with a sidebar navigation, KPI cards at the top, and interactive charts showing revenue, users, and engagement metrics.',
  },
  {
    id: 'landing',
    icon: <Sparkles className="h-5 w-5" />,
    title: 'Landing Page',
    description: 'Modern landing page with hero section',
    prompt:
      'Build a modern SaaS landing page with a hero section, feature grid, pricing cards, testimonials carousel, and a CTA footer.',
  },
  {
    id: 'ecommerce',
    icon: <ShoppingCart className="h-5 w-5" />,
    title: 'E-commerce Store',
    description: 'Product catalog with cart and checkout',
    prompt:
      'Build an e-commerce product catalog page with a grid of product cards (image, title, price, rating), filters sidebar, search bar, and a shopping cart drawer.',
  },
  {
    id: 'chat',
    icon: <MessageSquare className="h-5 w-5" />,
    title: 'Chat Interface',
    description: 'Real-time messaging UI with threads',
    prompt:
      'Build a chat application interface with a contacts sidebar, message thread area with bubbles, typing indicators, and a message input with emoji picker.',
  },
];

// ============================================================================
// COMPONENT
// ============================================================================

interface WelcomeViewProps {
  onSendMessage: (message: string) => void;
  className?: string;
}

export function WelcomeView({ onSendMessage, className }: WelcomeViewProps) {
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
        {QUICK_START_CARDS.map((card) => (
          <button
            key={card.id}
            onClick={() => onSendMessage(card.prompt)}
            className="group relative flex flex-col items-start gap-2 rounded-xl border border-border/50 bg-card/50 p-4 text-left transition-all hover:border-primary/30 hover:bg-card/80 hover:shadow-sm"
          >
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-muted/60 flex items-center justify-center text-muted-foreground group-hover:text-primary group-hover:bg-primary/10 transition-colors">
                {card.icon}
              </div>
            </div>
            <div>
              <h3 className="text-sm font-medium">{card.title}</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                {card.description}
              </p>
            </div>
          </button>
        ))}
      </div>

      {/* Or section */}
      <div className="mt-6 flex items-center gap-3 text-xs text-muted-foreground">
        <Palette className="h-3.5 w-3.5" />
        <span>or start from your brand design package</span>
      </div>
    </div>
  );
}
