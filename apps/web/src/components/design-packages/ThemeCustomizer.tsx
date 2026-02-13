'use client';

import { useState } from 'react';
import { Slider } from '@/components/ui/slider';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { ColorPicker } from './ColorPicker';
import { Sparkles, ChevronDown, ChevronUp } from 'lucide-react';
import type { DesignPackageData, DesignMood, AnimationStyle } from '@/lib/design-packages/types';
import { cn } from '@/lib/utils';

interface ThemeCustomizerProps {
  data: DesignPackageData;
  onChange: (data: DesignPackageData) => void;
  onRefine?: (prompt: string) => void;
  isRefining?: boolean;
}

const MOODS: { value: DesignMood; label: string; icon: string }[] = [
  { value: 'playful', label: 'Playful', icon: '🎈' },
  { value: 'professional', label: 'Professional', icon: '💼' },
  { value: 'minimal', label: 'Minimal', icon: '◻️' },
  { value: 'elegant', label: 'Elegant', icon: '✦' },
  { value: 'bold', label: 'Bold', icon: '⚡' },
];

const ANIMATION_STYLES: { value: AnimationStyle; label: string }[] = [
  { value: 'playful', label: 'Bouncy' },
  { value: 'professional', label: 'Smooth' },
  { value: 'minimal', label: 'Subtle' },
];

function parseRadius(radius: string): number {
  return parseFloat(radius) || 0.75;
}

export function ThemeCustomizer({ data, onChange, onRefine, isRefining }: ThemeCustomizerProps) {
  const [refinePrompt, setRefinePrompt] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const isDark = false; // Customize light mode colors by default

  const palette = isDark ? data.colors.dark : data.colors.light;

  const updateColor = (key: string, value: string) => {
    const mode = isDark ? 'dark' : 'light';
    onChange({
      ...data,
      colors: {
        ...data.colors,
        [mode]: {
          ...data.colors[mode],
          [key]: value,
        },
      },
    });
  };

  const handleRefine = () => {
    if (!refinePrompt.trim() || !onRefine) return;
    onRefine(refinePrompt.trim());
    setRefinePrompt('');
  };

  return (
    <div className="space-y-5">
      {/* AI Refinement */}
      {onRefine && (
        <div className="space-y-2">
          <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Refine with AI
          </Label>
          <div className="relative">
            <Textarea
              value={refinePrompt}
              onChange={(e) => setRefinePrompt(e.target.value.slice(0, 2000))}
              placeholder="Make it more corporate, use darker blue..."
              className="min-h-[60px] resize-none pr-10 pb-6 text-sm"
              maxLength={2000}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleRefine();
                }
              }}
            />
            <div className="absolute bottom-1.5 left-2 text-[10px] text-muted-foreground/60">
              {refinePrompt.length > 0 && `${refinePrompt.length}/2000`}
            </div>
            <Button
              size="sm"
              variant="ghost"
              className="absolute bottom-1.5 right-1.5 h-7 w-7 p-0"
              onClick={handleRefine}
              disabled={!refinePrompt.trim() || isRefining}
            >
              <Sparkles className={cn('h-4 w-4', isRefining && 'animate-pulse text-primary')} />
            </Button>
          </div>
        </div>
      )}

      <Separator />

      {/* Mood Selector */}
      <div className="space-y-2">
        <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Mood
        </Label>
        <div className="grid grid-cols-5 gap-1.5">
          {MOODS.map((mood) => (
            <button
              key={mood.value}
              onClick={() => onChange({ ...data, mood: mood.value })}
              className={cn(
                'flex flex-col items-center gap-1 rounded-lg border p-2 text-xs transition-all',
                data.mood === mood.value
                  ? 'border-primary bg-primary/5 text-primary shadow-sm'
                  : 'border-border text-muted-foreground hover:border-primary/40 hover:bg-muted/50'
              )}
            >
              <span className="text-base">{mood.icon}</span>
              <span className="font-medium">{mood.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Core Colors */}
      <div className="space-y-3">
        <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Core Colors
        </Label>
        <div className="grid grid-cols-2 gap-3">
          <ColorPicker label="Primary" value={palette.primary} onChange={(v) => updateColor('primary', v)} />
          <ColorPicker label="Secondary" value={palette.secondary} onChange={(v) => updateColor('secondary', v)} />
          <ColorPicker label="Accent" value={palette.accent} onChange={(v) => updateColor('accent', v)} />
          <ColorPicker label="Background" value={palette.background} onChange={(v) => updateColor('background', v)} />
        </div>
      </div>

      {/* Typography */}
      <div className="space-y-2">
        <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Typography
        </Label>
        <Input
          value={data.typography.fontFamily}
          onChange={(e) =>
            onChange({
              ...data,
              typography: { ...data.typography, fontFamily: e.target.value },
            })
          }
          placeholder="Inter, sans-serif"
          className="h-8 text-sm"
        />
        <Input
          value={data.typography.googleFontsUrl ?? ''}
          onChange={(e) =>
            onChange({
              ...data,
              typography: {
                ...data.typography,
                googleFontsUrl: e.target.value || undefined,
              },
            })
          }
          placeholder="Google Fonts URL (optional)"
          className="h-8 text-xs text-muted-foreground"
        />
      </div>

      {/* Border Radius */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Border Radius
          </Label>
          <span className="text-xs font-mono text-muted-foreground">{data.borderRadius}</span>
        </div>
        <Slider
          value={[parseRadius(data.borderRadius)]}
          min={0}
          max={2}
          step={0.125}
          onValueChange={([v]) =>
            onChange({ ...data, borderRadius: `${v}rem` })
          }
        />
        <div className="flex justify-between text-[10px] text-muted-foreground">
          <span>Sharp</span>
          <span>Rounded</span>
        </div>
      </div>

      {/* Animation Style */}
      <div className="space-y-2">
        <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Animation Style
        </Label>
        <div className="grid grid-cols-3 gap-1.5">
          {ANIMATION_STYLES.map((style) => (
            <button
              key={style.value}
              onClick={() => onChange({ ...data, animationStyle: style.value })}
              className={cn(
                'rounded-lg border px-3 py-1.5 text-xs font-medium transition-all',
                data.animationStyle === style.value
                  ? 'border-primary bg-primary/5 text-primary'
                  : 'border-border text-muted-foreground hover:border-primary/40'
              )}
            >
              {style.label}
            </button>
          ))}
        </div>
      </div>

      {/* Advanced Colors Toggle */}
      <button
        onClick={() => setShowAdvanced(!showAdvanced)}
        className="flex w-full items-center justify-between rounded-lg border border-border px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/50"
      >
        <span>Advanced Colors</span>
        {showAdvanced ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
      </button>

      {showAdvanced && (
        <div className="grid grid-cols-2 gap-3 animate-in fade-in slide-in-from-top-2 duration-200">
          <ColorPicker label="Foreground" value={palette.foreground} onChange={(v) => updateColor('foreground', v)} />
          <ColorPicker label="Card" value={palette.card} onChange={(v) => updateColor('card', v)} />
          <ColorPicker label="Muted" value={palette.muted} onChange={(v) => updateColor('muted', v)} />
          <ColorPicker label="Border" value={palette.border} onChange={(v) => updateColor('border', v)} />
          <ColorPicker label="Destructive" value={palette.destructive} onChange={(v) => updateColor('destructive', v)} />
          <ColorPicker label="Ring" value={palette.ring} onChange={(v) => updateColor('ring', v)} />
          <ColorPicker label="Success" value={palette.success} onChange={(v) => updateColor('success', v)} />
          <ColorPicker label="Warning" value={palette.warning} onChange={(v) => updateColor('warning', v)} />
        </div>
      )}
    </div>
  );
}
