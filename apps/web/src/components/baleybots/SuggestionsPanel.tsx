'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  AlertCircle,
  AlertTriangle,
  Info,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Sparkles,
  TrendingUp,
  Loader2,
  Check,
  X,
} from 'lucide-react';
import type { ReviewResult, ReviewIssue, ReviewSuggestion } from '@/lib/baleybot/reviewer';

interface SuggestionsPanelProps {
  review: ReviewResult;
  onAcceptSuggestion?: (suggestion: ReviewSuggestion) => Promise<void>;
  onDismissSuggestion?: (suggestion: ReviewSuggestion) => void;
  isApplying?: boolean;
  className?: string;
}

export function SuggestionsPanel({
  review,
  onAcceptSuggestion,
  onDismissSuggestion,
  isApplying = false,
  className,
}: SuggestionsPanelProps) {
  const [expandedIssues, setExpandedIssues] = useState<Set<string>>(new Set());
  const [expandedSuggestions, setExpandedSuggestions] = useState<Set<string>>(
    new Set()
  );
  const [acceptingId, setAcceptingId] = useState<string | null>(null);
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());

  const toggleIssue = (id: string) => {
    setExpandedIssues((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleSuggestion = (id: string) => {
    setExpandedSuggestions((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleAccept = async (suggestion: ReviewSuggestion) => {
    if (!onAcceptSuggestion) return;
    setAcceptingId(suggestion.id);
    try {
      await onAcceptSuggestion(suggestion);
      setDismissedIds((prev) => new Set([...prev, suggestion.id]));
    } finally {
      setAcceptingId(null);
    }
  };

  const handleDismiss = (suggestion: ReviewSuggestion) => {
    setDismissedIds((prev) => new Set([...prev, suggestion.id]));
    onDismissSuggestion?.(suggestion);
  };

  const getAssessmentColor = () => {
    switch (review.overallAssessment) {
      case 'excellent':
        return 'text-green-600';
      case 'good':
        return 'text-blue-600';
      case 'needs_improvement':
        return 'text-yellow-600';
      case 'failed':
        return 'text-red-600';
      default:
        return 'text-muted-foreground';
    }
  };

  const getAssessmentBadge = () => {
    switch (review.overallAssessment) {
      case 'excellent':
        return (
          <Badge className="bg-green-100 text-green-800">
            <CheckCircle2 className="h-3 w-3 mr-1" />
            Excellent
          </Badge>
        );
      case 'good':
        return (
          <Badge className="bg-blue-100 text-blue-800">
            <CheckCircle2 className="h-3 w-3 mr-1" />
            Good
          </Badge>
        );
      case 'needs_improvement':
        return (
          <Badge className="bg-yellow-100 text-yellow-800">
            <AlertTriangle className="h-3 w-3 mr-1" />
            Needs Improvement
          </Badge>
        );
      case 'failed':
        return (
          <Badge variant="destructive">
            <AlertCircle className="h-3 w-3 mr-1" />
            Failed
          </Badge>
        );
      default:
        return null;
    }
  };

  const getSeverityIcon = (severity: ReviewIssue['severity']) => {
    switch (severity) {
      case 'error':
        return <AlertCircle className="h-4 w-4 text-red-500" />;
      case 'warning':
        return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
      case 'suggestion':
        return <Info className="h-4 w-4 text-blue-500" />;
    }
  };

  const getImpactBadge = (impact: ReviewSuggestion['impact']) => {
    switch (impact) {
      case 'high':
        return <Badge variant="destructive">High Impact</Badge>;
      case 'medium':
        return <Badge variant="secondary">Medium Impact</Badge>;
      case 'low':
        return <Badge variant="outline">Low Impact</Badge>;
    }
  };

  const activeSuggestions = review.suggestions.filter(
    (s) => !dismissedIds.has(s.id)
  );

  return (
    <Card className={className}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            AI Review
          </CardTitle>
          {getAssessmentBadge()}
        </div>
        <p className={`text-sm ${getAssessmentColor()}`}>{review.summary}</p>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Metrics */}
        {review.metrics && (
          <div className="grid grid-cols-3 gap-4">
            <div className="text-center p-3 rounded-lg bg-muted">
              <div className="text-2xl font-bold">
                {review.metrics.outputQualityScore}
              </div>
              <div className="text-xs text-muted-foreground">Quality</div>
            </div>
            <div className="text-center p-3 rounded-lg bg-muted">
              <div className="text-2xl font-bold">
                {review.metrics.intentAlignmentScore}
              </div>
              <div className="text-xs text-muted-foreground">Alignment</div>
            </div>
            <div className="text-center p-3 rounded-lg bg-muted">
              <div className="text-2xl font-bold">
                {review.metrics.efficiencyScore}
              </div>
              <div className="text-xs text-muted-foreground">Efficiency</div>
            </div>
          </div>
        )}

        {/* Issues */}
        {review.issues.length > 0 && (
          <div className="space-y-2">
            <h4 className="font-medium flex items-center gap-2">
              <AlertCircle className="h-4 w-4" />
              Issues ({review.issues.length})
            </h4>
            <div className="space-y-2">
              {review.issues.map((issue) => (
                <Collapsible
                  key={issue.id}
                  open={expandedIssues.has(issue.id)}
                  onOpenChange={() => toggleIssue(issue.id)}
                >
                  <CollapsibleTrigger className="flex items-center gap-2 w-full p-2 rounded-lg hover:bg-muted text-left">
                    {expandedIssues.has(issue.id) ? (
                      <ChevronDown className="h-4 w-4" />
                    ) : (
                      <ChevronRight className="h-4 w-4" />
                    )}
                    {getSeverityIcon(issue.severity)}
                    <span className="flex-1 text-sm font-medium">
                      {issue.title}
                    </span>
                    <Badge variant="outline" className="text-xs">
                      {issue.category}
                    </Badge>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="pl-8 pr-2 py-2">
                    <p className="text-sm text-muted-foreground mb-2">
                      {issue.description}
                    </p>
                    {issue.affectedEntity && (
                      <p className="text-xs text-muted-foreground">
                        Affected: <code>{issue.affectedEntity}</code>
                      </p>
                    )}
                    {issue.suggestedFix && (
                      <p className="text-sm mt-2">
                        <span className="text-muted-foreground">Fix: </span>
                        {issue.suggestedFix}
                      </p>
                    )}
                  </CollapsibleContent>
                </Collapsible>
              ))}
            </div>
          </div>
        )}

        {/* Suggestions */}
        {activeSuggestions.length > 0 && (
          <div className="space-y-2">
            <h4 className="font-medium flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              Suggestions ({activeSuggestions.length})
            </h4>
            <div className="space-y-3">
              {activeSuggestions.map((suggestion) => (
                <Collapsible
                  key={suggestion.id}
                  open={expandedSuggestions.has(suggestion.id)}
                  onOpenChange={() => toggleSuggestion(suggestion.id)}
                >
                  <div className="border rounded-lg">
                    <CollapsibleTrigger className="flex items-center gap-2 w-full p-3 text-left hover:bg-muted/50">
                      {expandedSuggestions.has(suggestion.id) ? (
                        <ChevronDown className="h-4 w-4" />
                      ) : (
                        <ChevronRight className="h-4 w-4" />
                      )}
                      <span className="flex-1 text-sm font-medium">
                        {suggestion.title}
                      </span>
                      {getImpactBadge(suggestion.impact)}
                    </CollapsibleTrigger>
                    <CollapsibleContent className="px-3 pb-3 space-y-3">
                      <p className="text-sm text-muted-foreground">
                        {suggestion.description}
                      </p>

                      {suggestion.balCodeChange && (
                        <div className="space-y-2">
                          <div className="text-xs font-medium">
                            Proposed Change:
                          </div>
                          <div className="grid grid-cols-2 gap-2 text-xs">
                            <div>
                              <div className="text-muted-foreground mb-1">
                                Before
                              </div>
                              <pre className="bg-red-50 dark:bg-red-950/20 p-2 rounded text-red-800 dark:text-red-200 overflow-x-auto">
                                {suggestion.balCodeChange.original || '(empty)'}
                              </pre>
                            </div>
                            <div>
                              <div className="text-muted-foreground mb-1">
                                After
                              </div>
                              <pre className="bg-green-50 dark:bg-green-950/20 p-2 rounded text-green-800 dark:text-green-200 overflow-x-auto">
                                {suggestion.balCodeChange.proposed}
                              </pre>
                            </div>
                          </div>
                        </div>
                      )}

                      {suggestion.reasoning && (
                        <p className="text-xs text-muted-foreground italic">
                          {suggestion.reasoning}
                        </p>
                      )}

                      <div className="flex gap-2 pt-2">
                        <Button
                          size="sm"
                          onClick={() => handleAccept(suggestion)}
                          disabled={
                            isApplying || acceptingId === suggestion.id
                          }
                        >
                          {acceptingId === suggestion.id ? (
                            <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                          ) : (
                            <Check className="h-4 w-4 mr-1" />
                          )}
                          Accept
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleDismiss(suggestion)}
                          disabled={isApplying}
                        >
                          <X className="h-4 w-4 mr-1" />
                          Dismiss
                        </Button>
                      </div>
                    </CollapsibleContent>
                  </div>
                </Collapsible>
              ))}
            </div>
          </div>
        )}

        {/* No issues or suggestions */}
        {review.issues.length === 0 && activeSuggestions.length === 0 && (
          <div className="text-center py-4 text-muted-foreground">
            <CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-green-500" />
            <p>No issues found. This execution looks good!</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
