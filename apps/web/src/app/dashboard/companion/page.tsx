'use client';

import { Card, CardContent } from '@/components/ui/card';
import { CompanionContainer } from '@/components/companion';
import {
  Sparkles,
  MessageCircle,
  Command as CommandIcon,
  Mic,
} from 'lucide-react';

const MODES = [
  {
    icon: Sparkles,
    title: 'Orb Mode',
    description:
      'A floating orb that provides quick access to AI features. Click to expand into chat or command modes.',
    color: 'text-violet-500',
    bg: 'bg-violet-500/10',
  },
  {
    icon: MessageCircle,
    title: 'Chat Mode',
    description:
      'Have a full conversation with your AI assistant. Ask questions, get help with workflows, and more.',
    color: 'text-blue-500',
    bg: 'bg-blue-500/10',
  },
  {
    icon: CommandIcon,
    title: 'Command Mode',
    description:
      'Quick command palette for fast actions. Press Cmd+K to open from anywhere in the dashboard.',
    color: 'text-amber-500',
    bg: 'bg-amber-500/10',
  },
  {
    icon: Mic,
    title: 'Voice Input',
    description:
      'Speak to your AI assistant using voice input. Available in any mode by clicking the microphone button.',
    color: 'text-rose-500',
    bg: 'bg-rose-500/10',
  },
] as const;

export default function CompanionPage() {
  return (
    <div className="container py-10">
      <div className="flex flex-col gap-8">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold tracking-tight">AI Companion</h1>
          <p className="text-muted-foreground">
            Interactive AI assistant with multiple interaction modes
          </p>
        </div>

        {/* Mode Cards */}
        <div className="grid gap-4 md:grid-cols-2">
          {MODES.map(({ icon: Icon, title, description, color, bg }) => (
            <Card key={title}>
              <CardContent className="flex items-start gap-4 pt-6">
                <div
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${bg}`}
                >
                  <Icon className={`h-5 w-5 ${color}`} />
                </div>
                <div>
                  <h3 className="font-medium">{title}</h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    {description}
                  </p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Usage Hint */}
        <p className="text-sm text-muted-foreground">
          The AI Companion widget is active in the bottom-right corner. Click the
          orb to get started.
        </p>
      </div>

      {/* Floating Companion Widget */}
      <CompanionContainer defaultMode="orb" position="bottom-right" />
    </div>
  );
}
