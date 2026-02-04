'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Checkbox } from '@/components/ui/checkbox';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Loader2, Info, Shield, ShieldCheck, ShieldAlert } from 'lucide-react';
import type { ToolCallDetails, PatternDefinition } from './ApprovalPrompt';

interface ApproveAndRememberDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  toolCall: ToolCallDetails;
  onConfirm: (pattern: PatternDefinition) => Promise<void>;
  isProcessing?: boolean;
}

type TrustLevel = 'provisional' | 'trusted' | 'permanent';

interface ParameterPattern {
  key: string;
  value: unknown;
  useExact: boolean;
  useWildcard: boolean;
  customPattern?: string;
}

export function ApproveAndRememberDialog({
  open,
  onOpenChange,
  toolCall,
  onConfirm,
  isProcessing = false,
}: ApproveAndRememberDialogProps) {
  const [trustLevel, setTrustLevel] = useState<TrustLevel>('provisional');
  const [includeEntityGoal, setIncludeEntityGoal] = useState(false);
  const [entityGoalPattern, setEntityGoalPattern] = useState('');

  // Parse parameters into configurable patterns
  const parameterPatterns: ParameterPattern[] = [];
  for (const [key, value] of Object.entries(toolCall.parameters)) {
    parameterPatterns.push({
      key,
      value,
      useExact: true,
      useWildcard: false,
    });
  }

  const [selectedParams, setSelectedParams] = useState<Record<string, ParameterPattern>>(() => {
    const initial: Record<string, ParameterPattern> = {};
    parameterPatterns.forEach((p) => {
      initial[p.key] = { ...p };
    });
    return initial;
  });

  const toggleParamExact = (key: string) => {
    setSelectedParams((prev) => {
      const existing = prev[key];
      if (!existing) return prev;
      return {
        ...prev,
        [key]: {
          ...existing,
          useExact: !existing.useExact,
          useWildcard: false,
        },
      };
    });
  };

  const toggleParamWildcard = (key: string) => {
    setSelectedParams((prev) => {
      const existing = prev[key];
      if (!existing) return prev;
      return {
        ...prev,
        [key]: {
          ...existing,
          useWildcard: !existing.useWildcard,
          useExact: false,
        },
      };
    });
  };

  const buildActionPattern = (): Record<string, unknown> => {
    const pattern: Record<string, unknown> = {
      action: toolCall.action,
    };

    for (const [key, param] of Object.entries(selectedParams)) {
      if (param.useWildcard) {
        pattern[key] = '*';
      } else if (param.useExact) {
        pattern[key] = param.value;
      }
      // If neither, parameter is not included in pattern (matches anything)
    }

    return pattern;
  };

  const handleConfirm = async () => {
    const pattern: PatternDefinition = {
      tool: toolCall.tool,
      actionPattern: buildActionPattern(),
      trustLevel,
    };

    if (includeEntityGoal && entityGoalPattern) {
      pattern.entityGoalPattern = entityGoalPattern;
    }

    await onConfirm(pattern);
  };

  const getTrustLevelDescription = (level: TrustLevel) => {
    switch (level) {
      case 'provisional':
        return 'Auto-approve for 24 hours, then require re-approval';
      case 'trusted':
        return 'Auto-approve indefinitely, but can be revoked';
      case 'permanent':
        return 'Always auto-approve for this workspace';
    }
  };

  const getTrustLevelIcon = (level: TrustLevel) => {
    switch (level) {
      case 'provisional':
        return <Shield className="h-4 w-4" />;
      case 'trusted':
        return <ShieldCheck className="h-4 w-4" />;
      case 'permanent':
        return <ShieldAlert className="h-4 w-4" />;
    }
  };

  const previewPattern = buildActionPattern();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Create Approval Pattern</DialogTitle>
          <DialogDescription>
            Configure when this action should be automatically approved in the
            future.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Trust Level */}
          <div className="space-y-3">
            <Label>Trust Level</Label>
            <RadioGroup
              value={trustLevel}
              onValueChange={(v) => setTrustLevel(v as TrustLevel)}
              className="space-y-2"
            >
              {(['provisional', 'trusted', 'permanent'] as TrustLevel[]).map(
                (level) => (
                  <div
                    key={level}
                    className="flex items-start space-x-3 p-3 rounded-lg border hover:bg-muted/50 cursor-pointer"
                    onClick={() => setTrustLevel(level)}
                  >
                    <RadioGroupItem value={level} id={level} className="mt-0.5" />
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        {getTrustLevelIcon(level)}
                        <Label htmlFor={level} className="font-medium capitalize cursor-pointer">
                          {level}
                        </Label>
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">
                        {getTrustLevelDescription(level)}
                      </p>
                    </div>
                  </div>
                )
              )}
            </RadioGroup>
          </div>

          {/* Parameter Patterns */}
          <div className="space-y-3">
            <Label>Parameter Matching</Label>
            <div className="space-y-2">
              {Object.entries(selectedParams).map(([key, param]) => (
                <div
                  key={key}
                  className="flex items-center justify-between p-3 rounded-lg border"
                >
                  <div className="flex-1">
                    <div className="font-mono text-sm">{key}</div>
                    <div className="text-xs text-muted-foreground truncate max-w-[200px]">
                      {typeof param.value === 'object'
                        ? JSON.stringify(param.value)
                        : String(param.value)}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge
                      variant={param.useExact ? 'default' : 'outline'}
                      className="cursor-pointer"
                      onClick={() => toggleParamExact(key)}
                    >
                      Exact
                    </Badge>
                    <Badge
                      variant={param.useWildcard ? 'default' : 'outline'}
                      className="cursor-pointer"
                      onClick={() => toggleParamWildcard(key)}
                    >
                      Any
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Entity Goal Pattern (optional) */}
          <div className="space-y-3">
            <div className="flex items-center space-x-2">
              <Checkbox
                id="includeEntityGoal"
                checked={includeEntityGoal}
                onCheckedChange={(checked) => setIncludeEntityGoal(!!checked)}
              />
              <Label htmlFor="includeEntityGoal">
                Restrict to specific BaleyBot goals
              </Label>
            </div>
            {includeEntityGoal && (
              <div className="pl-6">
                <Input
                  placeholder="e.g., refund.* or customer-support"
                  value={entityGoalPattern}
                  onChange={(e) => setEntityGoalPattern(e.target.value)}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Use regex pattern to match entity goals
                </p>
              </div>
            )}
          </div>

          {/* Pattern Preview */}
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription>
              <div className="text-sm font-medium mb-1">Pattern Preview:</div>
              <pre className="text-xs bg-muted p-2 rounded overflow-x-auto">
                {JSON.stringify(previewPattern, null, 2)}
              </pre>
            </AlertDescription>
          </Alert>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isProcessing}
          >
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={isProcessing}>
            {isProcessing ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : null}
            Approve &amp; Create Pattern
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
