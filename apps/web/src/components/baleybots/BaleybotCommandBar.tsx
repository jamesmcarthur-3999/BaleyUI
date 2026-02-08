'use client';

import { useState } from 'react';
import { ArrowRight, Lightbulb, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

interface BaleybotCommandBarProps {
  onSubmitPrompt: (prompt: string) => void;
  isSubmitting?: boolean;
  className?: string;
}

const STARTER_PROMPTS = [
  'Create a bot that summarizes customer feedback every Friday',
  'Build a bot that monitors new signups and tags high-intent leads',
  'Create a bot that researches a topic and returns a short brief',
  'Build a bot that drafts weekly status updates from activity data',
];

export function BaleybotCommandBar({
  onSubmitPrompt,
  isSubmitting = false,
  className,
}: BaleybotCommandBarProps) {
  const [prompt, setPrompt] = useState('');
  const [showIdeas, setShowIdeas] = useState(false);

  const handleSubmit = () => {
    const trimmed = prompt.trim();
    if (!trimmed) return;
    onSubmitPrompt(trimmed);
  };

  const handleIdeaClick = (idea: string) => {
    setPrompt(idea);
  };

  return (
    <section className={cn('card-playful rounded-2xl border border-border/60 p-5', className)}>
      <div className="flex flex-col gap-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold tracking-tight">Create with AI</h2>
            <p className="text-sm text-muted-foreground">
              Describe the outcome you want. We will generate the bot and guide you through the first run.
            </p>
          </div>
          <div className="hidden sm:inline-flex items-center gap-1 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
            <Sparkles className="h-3.5 w-3.5" />
            Simple start
          </div>
        </div>

        <form
          className="flex flex-col gap-3 md:flex-row"
          onSubmit={(event) => {
            event.preventDefault();
            handleSubmit();
          }}
        >
          <Input
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            placeholder="Create a bot that..."
            className="h-11 text-sm"
            aria-label="Describe your BaleyBot"
          />
          <Button type="submit" className="h-11 px-5" disabled={!prompt.trim() || isSubmitting}>
            Build BaleyBot
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </form>

        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">What happens next:</span>
          <span className="rounded-full border border-border/70 bg-background px-2 py-1">Draft</span>
          <span className="rounded-full border border-border/70 bg-background px-2 py-1">Validate</span>
          <span className="rounded-full border border-border/70 bg-background px-2 py-1">First test run</span>
          <button
            type="button"
            className="ml-auto inline-flex items-center gap-1 text-primary hover:underline"
            onClick={() => setShowIdeas((prev) => !prev)}
          >
            <Lightbulb className="h-3.5 w-3.5" />
            {showIdeas ? 'Hide ideas' : 'Need ideas?'}
          </button>
        </div>

        {showIdeas && (
          <div className="flex flex-wrap gap-2 border-t border-border/60 pt-3">
            {STARTER_PROMPTS.map((idea) => (
              <button
                key={idea}
                type="button"
                className="rounded-full border border-border/70 bg-background px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
                onClick={() => handleIdeaClick(idea)}
              >
                {idea}
              </button>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
