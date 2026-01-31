'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Badge } from '@/components/ui/badge';
import { AlertCircle, Zap, Code, GitBranch, Sparkles } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';

export type ExecutionMode = 'ai_only' | 'code_only' | 'hybrid' | 'ab_test';

interface ExecutionModeSelectorProps {
  value: ExecutionMode;
  onChange: (mode: ExecutionMode) => void;
  hasGeneratedCode: boolean;
  codeAccuracy?: number | null;
  disabled?: boolean;
}

interface ModeOption {
  id: ExecutionMode;
  name: string;
  description: string;
  icon: React.ReactNode;
  costLevel: 'low' | 'medium' | 'high';
  latencyLevel: 'low' | 'medium' | 'high';
  accuracyLevel: 'medium' | 'high';
  requiresCode: boolean;
}

const MODE_OPTIONS: ModeOption[] = [
  {
    id: 'ai_only',
    name: 'AI Only',
    description: 'Always use AI model for execution. Best for complex, variable inputs where flexibility is needed.',
    icon: <Sparkles className="h-5 w-5 text-purple-500" />,
    costLevel: 'high',
    latencyLevel: 'high',
    accuracyLevel: 'high',
    requiresCode: false,
  },
  {
    id: 'code_only',
    name: 'Code Only',
    description: 'Always use generated code. Fast and cost-effective for known patterns. Falls back to AI if code unavailable.',
    icon: <Code className="h-5 w-5 text-blue-500" />,
    costLevel: 'low',
    latencyLevel: 'low',
    accuracyLevel: 'high',
    requiresCode: true,
  },
  {
    id: 'hybrid',
    name: 'Hybrid',
    description: 'Use code for known patterns, fall back to AI for edge cases. Best balance of speed and flexibility.',
    icon: <GitBranch className="h-5 w-5 text-green-500" />,
    costLevel: 'medium',
    latencyLevel: 'medium',
    accuracyLevel: 'high',
    requiresCode: true,
  },
  {
    id: 'ab_test',
    name: 'A/B Test',
    description: 'Random 50/50 split between AI and code. Use for comparing performance and validating code accuracy.',
    icon: <Zap className="h-5 w-5 text-orange-500" />,
    costLevel: 'medium',
    latencyLevel: 'medium',
    accuracyLevel: 'medium',
    requiresCode: true,
  },
];

export function ExecutionModeSelector({
  value,
  onChange,
  hasGeneratedCode,
  codeAccuracy,
  disabled = false,
}: ExecutionModeSelectorProps) {
  const [hoveredMode, setHoveredMode] = useState<ExecutionMode | null>(null);

  const getLevelColor = (level: 'low' | 'medium' | 'high'): string => {
    switch (level) {
      case 'low':
        return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100';
      case 'medium':
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-100';
      case 'high':
        return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-100';
    }
  };

  const getLevelLabel = (level: 'low' | 'medium' | 'high'): string => {
    switch (level) {
      case 'low':
        return 'Low';
      case 'medium':
        return 'Medium';
      case 'high':
        return 'High';
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Execution Mode</CardTitle>
        <CardDescription>
          Choose how this block executes: AI-only, code-only, or a hybrid approach.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!hasGeneratedCode && (
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              No generated code available. Generate code from patterns to enable code-based execution modes.
            </AlertDescription>
          </Alert>
        )}

        {hasGeneratedCode && codeAccuracy !== null && codeAccuracy !== undefined && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>Code Accuracy:</span>
            <Badge variant={codeAccuracy >= 90 ? 'default' : codeAccuracy >= 75 ? 'secondary' : 'destructive'}>
              {codeAccuracy.toFixed(1)}%
            </Badge>
          </div>
        )}

        <RadioGroup value={value} onValueChange={(v: string) => onChange(v as ExecutionMode)} disabled={disabled}>
          <div className="space-y-3">
            {MODE_OPTIONS.map((option) => {
              const isDisabled = disabled || (option.requiresCode && !hasGeneratedCode);
              const isHovered = hoveredMode === option.id;
              const isSelected = value === option.id;

              return (
                <div
                  key={option.id}
                  className={`relative rounded-lg border-2 transition-all ${
                    isSelected
                      ? 'border-primary bg-primary/5'
                      : isHovered
                      ? 'border-muted-foreground/50'
                      : 'border-border'
                  } ${isDisabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                  onMouseEnter={() => !isDisabled && setHoveredMode(option.id)}
                  onMouseLeave={() => setHoveredMode(null)}
                >
                  <Label
                    htmlFor={option.id}
                    className={`flex items-start gap-4 p-4 ${isDisabled ? 'cursor-not-allowed' : 'cursor-pointer'}`}
                  >
                    <RadioGroupItem value={option.id} id={option.id} disabled={isDisabled} className="mt-1" />

                    <div className="flex-1 space-y-2">
                      <div className="flex items-center gap-2">
                        {option.icon}
                        <span className="font-semibold">{option.name}</span>
                        {isDisabled && option.requiresCode && (
                          <Badge variant="outline" className="text-xs">
                            Requires Code
                          </Badge>
                        )}
                      </div>

                      <p className="text-sm text-muted-foreground">{option.description}</p>

                      {(isSelected || isHovered) && (
                        <div className="flex flex-wrap gap-2 pt-2">
                          <div className="flex items-center gap-1 text-xs">
                            <span className="text-muted-foreground">Cost:</span>
                            <Badge variant="secondary" className={getLevelColor(option.costLevel)}>
                              {getLevelLabel(option.costLevel)}
                            </Badge>
                          </div>

                          <div className="flex items-center gap-1 text-xs">
                            <span className="text-muted-foreground">Latency:</span>
                            <Badge variant="secondary" className={getLevelColor(option.latencyLevel)}>
                              {getLevelLabel(option.latencyLevel)}
                            </Badge>
                          </div>

                          <div className="flex items-center gap-1 text-xs">
                            <span className="text-muted-foreground">Reliability:</span>
                            <Badge variant="secondary" className={getLevelColor(
                              option.accuracyLevel === 'high' ? 'low' : 'medium'
                            )}>
                              {getLevelLabel(option.accuracyLevel)}
                            </Badge>
                          </div>
                        </div>
                      )}
                    </div>
                  </Label>
                </div>
              );
            })}
          </div>
        </RadioGroup>
      </CardContent>
    </Card>
  );
}
