'use client';

import React, { useState } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { ChevronDown, ChevronRight } from 'lucide-react';

interface PatternSample {
  input: unknown;
  output: unknown;
  decisionId: string;
}

interface Pattern {
  id: string;
  rule: string;
  condition: unknown;
  outputTemplate?: unknown;
  confidence: string | number | null;
  supportCount: number | null;
  samples?: PatternSample[] | unknown; // Accept unknown from DB query
  patternType?: string | null;
  createdAt?: Date;
}

interface PatternCardProps {
  pattern: Pattern;
}

/**
 * Get pattern type from the rule string.
 */
function getPatternType(rule: string): string {
  if (rule.includes('IN [')) return 'set_membership';
  if (rule.includes('>') || rule.includes('<')) return 'threshold';
  if (rule.includes('AND') || rule.includes('OR')) return 'compound';
  if (rule.includes('==')) return 'exact_match';
  return 'unknown';
}

/**
 * Get badge variant for pattern type.
 */
function getPatternTypeBadge(type: string) {
  switch (type) {
    case 'threshold':
      return { label: 'Threshold', variant: 'default' as const };
    case 'set_membership':
      return { label: 'Set Membership', variant: 'secondary' as const };
    case 'compound':
      return { label: 'Compound', variant: 'outline' as const };
    case 'exact_match':
      return { label: 'Exact Match', variant: 'outline' as const };
    default:
      return { label: 'Unknown', variant: 'outline' as const };
  }
}

/**
 * Get confidence color and background classes.
 */
function getConfidenceStyle(confidence: number) {
  if (confidence >= 90) {
    return {
      bg: 'bg-green-100 dark:bg-green-900/20',
      text: 'text-green-700 dark:text-green-400',
      label: 'Very High',
    };
  }
  if (confidence >= 70) {
    return {
      bg: 'bg-yellow-100 dark:bg-yellow-900/20',
      text: 'text-yellow-700 dark:text-yellow-400',
      label: 'High',
    };
  }
  return {
    bg: 'bg-red-100 dark:bg-red-900/20',
    text: 'text-red-700 dark:text-red-400',
    label: 'Medium',
  };
}

/**
 * Display a single detected pattern.
 */
export function PatternCard({ pattern }: PatternCardProps) {
  const [isOpen, setIsOpen] = useState(false);

  // Parse confidence
  const confidence =
    pattern.confidence === null
      ? 0
      : typeof pattern.confidence === 'string'
      ? parseFloat(pattern.confidence) * 100
      : pattern.confidence;

  // Use stored patternType or infer from rule
  const patternType = pattern.patternType || getPatternType(pattern.rule);
  const typeBadge = getPatternTypeBadge(patternType);
  const confidenceStyle = getConfidenceStyle(confidence);

  // Safely cast samples to expected type
  const samples = Array.isArray(pattern.samples) ? (pattern.samples as PatternSample[]) : [];

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 space-y-2">
            <div className="flex items-center gap-2">
              <Badge variant={typeBadge.variant}>{typeBadge.label}</Badge>
              <div
                className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${confidenceStyle.bg} ${confidenceStyle.text}`}
              >
                {confidence.toFixed(1)}% confidence
              </div>
            </div>
            <CardTitle className="text-base font-mono">{pattern.rule}</CardTitle>
          </div>
        </div>
        <CardDescription>
          {confidenceStyle.label} confidence with{' '}
          {pattern.supportCount || 0} supporting decisions
        </CardDescription>
      </CardHeader>

      {samples.length > 0 && (
        <CardContent>
          <Collapsible open={isOpen} onOpenChange={setIsOpen}>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="w-full justify-start">
                {isOpen ? (
                  <ChevronDown className="h-4 w-4 mr-2" />
                ) : (
                  <ChevronRight className="h-4 w-4 mr-2" />
                )}
                View {samples.length} Sample
                {samples.length !== 1 ? 's' : ''}
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-4 space-y-3">
              {samples.map((sample, index) => (
                <div
                  key={sample.decisionId}
                  className="rounded-md border p-3 space-y-2"
                >
                  <div className="text-xs font-medium text-muted-foreground">
                    Sample {index + 1}
                  </div>
                  <div className="space-y-1">
                    <div className="text-sm">
                      <span className="font-medium">Input:</span>{' '}
                      <code className="text-xs bg-muted px-1.5 py-0.5 rounded">
                        {JSON.stringify(sample.input)}
                      </code>
                    </div>
                    <div className="text-sm">
                      <span className="font-medium">Output:</span>{' '}
                      <code className="text-xs bg-muted px-1.5 py-0.5 rounded">
                        {JSON.stringify(sample.output)}
                      </code>
                    </div>
                  </div>
                </div>
              ))}
            </CollapsibleContent>
          </Collapsible>
        </CardContent>
      )}
    </Card>
  );
}
