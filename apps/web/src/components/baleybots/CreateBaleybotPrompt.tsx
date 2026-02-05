'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { ROUTES } from '@/lib/routes';
import { Sparkles, ArrowRight, Wand2 } from 'lucide-react';

interface CreateBaleybotPromptProps {
  className?: string;
}

const EXAMPLE_PROMPTS = [
  'Monitor my database for new signups',
  'Analyze support tickets by urgency',
  'Generate weekly analytics reports',
  'Suggest actions based on user behavior',
];

export function CreateBaleybotPrompt({ className }: CreateBaleybotPromptProps) {
  const router = useRouter();
  const [prompt, setPrompt] = useState('');
  const [isExpanded, setIsExpanded] = useState(false);
  const [isFocused, setIsFocused] = useState(false);

  const handleSubmit = () => {
    if (prompt.trim()) {
      // Navigate to create page with the prompt as a query param
      const encodedPrompt = encodeURIComponent(prompt.trim());
      router.push(`${ROUTES.baleybots.create}?prompt=${encodedPrompt}`);
    }
  };

  const handleExampleClick = (example: string) => {
    setPrompt(example);
    setIsExpanded(true);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className={`card-playful rounded-3xl overflow-hidden ${className}`}>
      {/* Gradient accent bar */}
      <div className="h-1 bg-gradient-to-r from-primary via-accent to-primary" />

      <div className="p-8">
        <div className="flex items-start gap-4 mb-6">
          <div className="icon-box w-14 h-14 shrink-0">
            <Wand2 className="h-7 w-7 text-primary" />
          </div>
          <div>
            <h2 className="text-2xl font-bold mb-1">
              Create a new BaleyBot
            </h2>
            <p className="text-muted-foreground">
              Describe what you need, and I&apos;ll build it for you
            </p>
          </div>
        </div>

        <div className="space-y-5">
          {/* Input area with glow effect */}
          <div className={`relative rounded-2xl transition-shadow duration-300 ${isFocused ? 'glow-sm' : ''}`}>
            <textarea
              placeholder="I need to..."
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onFocus={() => {
                setIsExpanded(true);
                setIsFocused(true);
              }}
              onBlur={() => setIsFocused(false)}
              onKeyDown={handleKeyDown}
              className={`w-full resize-none rounded-2xl border-2 border-border bg-background/50 px-5 py-4 text-lg transition-[border-color] duration-300 placeholder:text-muted-foreground/60 focus:border-primary focus:outline-none ${
                isExpanded ? 'min-h-[120px]' : 'min-h-[60px]'
              }`}
            />
            {!isExpanded && (
              <div className="absolute right-4 top-1/2 -translate-y-1/2">
                <Sparkles className="h-5 w-5 text-muted-foreground/40" />
              </div>
            )}
          </div>

          {isExpanded && (
            <>
              {/* Example prompts */}
              <div className="flex flex-wrap gap-2">
                <span className="text-sm text-muted-foreground mr-2 py-1">Try:</span>
                {EXAMPLE_PROMPTS.map((example) => (
                  <button
                    key={example}
                    onClick={() => handleExampleClick(example)}
                    className="pill text-sm hover:bg-secondary"
                  >
                    {example}
                  </button>
                ))}
              </div>

              {/* Submit button */}
              <div className="flex justify-end pt-2">
                <Button
                  onClick={handleSubmit}
                  disabled={!prompt.trim()}
                  size="lg"
                  className="btn-playful text-white rounded-xl px-6 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Continue
                  <ArrowRight className="h-5 w-5 ml-2" />
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
