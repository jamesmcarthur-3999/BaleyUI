'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Save, Info } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

export interface FallbackTrigger {
  id: string;
  label: string;
  description: string;
  enabled: boolean;
}

const DEFAULT_FALLBACK_TRIGGERS: FallbackTrigger[] = [
  {
    id: 'unknown_pattern',
    label: 'Unknown Input Patterns',
    description: 'Fall back to AI when input does not match any known patterns',
    enabled: true,
  },
  {
    id: 'low_confidence',
    label: 'Confidence Below Threshold',
    description: 'Fall back to AI when pattern match confidence is below the threshold',
    enabled: true,
  },
  {
    id: 'edge_case',
    label: 'Explicit Edge Case Markers',
    description: 'Fall back to AI when input contains markers indicating an edge case',
    enabled: true,
  },
  {
    id: 'random_sampling',
    label: 'Random Sampling (10%)',
    description: 'Randomly fall back to AI for 10% of requests to enable continuous learning',
    enabled: false,
  },
];

interface HybridSettingsProps {
  threshold: number;
  onThresholdChange: (value: number) => void;
  fallbackTriggers?: FallbackTrigger[];
  onFallbackTriggersChange?: (triggers: FallbackTrigger[]) => void;
  onSave?: () => void;
  isSaving?: boolean;
  disabled?: boolean;
}

export function HybridSettings({
  threshold,
  onThresholdChange,
  fallbackTriggers: externalTriggers,
  onFallbackTriggersChange,
  onSave,
  isSaving = false,
  disabled = false,
}: HybridSettingsProps) {
  // Use external triggers if provided, otherwise use local state with defaults
  const [localTriggers, setLocalTriggers] = useState<FallbackTrigger[]>(DEFAULT_FALLBACK_TRIGGERS);
  const fallbackTriggers = externalTriggers ?? localTriggers;

  const handleTriggerToggle = (id: string) => {
    const newTriggers = fallbackTriggers.map(trigger =>
      trigger.id === id ? { ...trigger, enabled: !trigger.enabled } : trigger
    );

    // Persist to external state if callback provided, otherwise use local state
    if (onFallbackTriggersChange) {
      onFallbackTriggersChange(newTriggers);
    } else {
      setLocalTriggers(newTriggers);
    }
  };

  const getThresholdColor = (value: number): string => {
    if (value >= 90) return 'text-green-600 dark:text-green-400';
    if (value >= 75) return 'text-yellow-600 dark:text-yellow-400';
    return 'text-orange-600 dark:text-orange-400';
  };

  const getThresholdRecommendation = (value: number): string => {
    if (value >= 90) return 'Very conservative - minimal code usage, mostly AI';
    if (value >= 80) return 'Balanced - good mix of code and AI';
    if (value >= 70) return 'Aggressive - prefers code over AI';
    return 'Very aggressive - may increase fallback rate';
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Hybrid Mode Settings</CardTitle>
        <CardDescription>
          Configure when to use generated code vs. falling back to AI
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Confidence Threshold */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Label htmlFor="threshold">Confidence Threshold</Label>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="h-4 w-4 text-muted-foreground cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">
                    <p>
                      Minimum pattern match confidence required to use generated code.
                      Lower values prefer code execution, higher values prefer AI safety.
                    </p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <span className={`text-2xl font-bold ${getThresholdColor(threshold)}`}>
              {threshold}%
            </span>
          </div>

          <div className="space-y-2">
            <Slider
              id="threshold"
              value={[threshold]}
              onValueChange={(values) => onThresholdChange(values[0] || 80)}
              min={50}
              max={100}
              step={5}
              disabled={disabled}
              className="w-full"
            />

            <div className="flex justify-between text-xs text-muted-foreground">
              <span>50% (Aggressive)</span>
              <span>100% (Conservative)</span>
            </div>
          </div>

          <p className="text-sm text-muted-foreground">
            {getThresholdRecommendation(threshold)}
          </p>
        </div>

        {/* Fallback Triggers */}
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Label>Fallback Triggers</Label>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info className="h-4 w-4 text-muted-foreground cursor-help" />
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  <p>
                    Configure which conditions should trigger a fallback from generated code to AI execution.
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>

          <div className="space-y-3">
            {fallbackTriggers.map((trigger) => (
              <div
                key={trigger.id}
                className="flex items-start gap-3 rounded-lg border p-3 hover:bg-accent/50 transition-colors"
              >
                <Checkbox
                  id={trigger.id}
                  checked={trigger.enabled}
                  onCheckedChange={() => handleTriggerToggle(trigger.id)}
                  disabled={disabled || (trigger.id === 'unknown_pattern' || trigger.id === 'low_confidence')}
                  className="mt-1"
                />
                <div className="flex-1 space-y-1">
                  <Label
                    htmlFor={trigger.id}
                    className="text-sm font-medium cursor-pointer"
                  >
                    {trigger.label}
                    {(trigger.id === 'unknown_pattern' || trigger.id === 'low_confidence') && (
                      <span className="ml-2 text-xs text-muted-foreground">(Required)</span>
                    )}
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    {trigger.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Save Button */}
        {onSave && (
          <div className="flex justify-end pt-4 border-t">
            <Button onClick={onSave} disabled={disabled || isSaving}>
              {isSaving ? (
                <>
                  <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="mr-2 h-4 w-4" />
                  Save Settings
                </>
              )}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
