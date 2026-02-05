'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { ThumbsUp, ThumbsDown, X } from 'lucide-react';
import { trpc } from '@/lib/trpc/client';
import { useToast } from '@/components/ui/use-toast';
import { formatCost, formatDuration, formatTokens } from '@/lib/format';

interface Decision {
  id: string;
  blockId: string;
  blockName: string;
  blockType: string;
  blockExecutionId: string;
  input: unknown;
  output: unknown;
  reasoning: string | null;
  model: string | null;
  tokensInput: number | null;
  tokensOutput: number | null;
  latencyMs: number | null;
  cost: string | null;
  feedbackCorrect: boolean | null;
  feedbackNotes: string | null;
  feedbackCorrectedOutput: unknown;
  feedbackAt: Date | null;
  createdAt: Date;
}

interface DecisionDetailProps {
  decision: Decision;
  onClose?: () => void;
}

export function DecisionDetail({ decision, onClose }: DecisionDetailProps) {
  const [showFeedbackForm, setShowFeedbackForm] = useState(false);
  const [feedbackNotes, setFeedbackNotes] = useState(decision.feedbackNotes || '');
  const [correctedOutput, setCorrectedOutput] = useState(
    decision.feedbackCorrectedOutput ? JSON.stringify(decision.feedbackCorrectedOutput, null, 2) : ''
  );
  const { toast } = useToast();
  const utils = trpc.useUtils();

  const submitFeedbackMutation = trpc.decisions.submitFeedback.useMutation({
    onSuccess: () => {
      toast({
        title: 'Feedback Submitted',
        description: 'Your feedback has been saved successfully.',
      });
      utils.decisions.list.invalidate();
      utils.decisions.getById.invalidate({ id: decision.id });
      utils.decisions.getStats.invalidate();
      setShowFeedbackForm(false);
    },
    onError: (error) => {
      toast({
        title: 'Failed to Submit Feedback',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const handleFeedback = (correct: boolean) => {
    if (showFeedbackForm) {
      // Submit the feedback
      let parsedOutput = undefined;
      if (correctedOutput.trim()) {
        try {
          parsedOutput = JSON.parse(correctedOutput);
        } catch {
          toast({
            title: 'Invalid JSON',
            description: 'Corrected output must be valid JSON',
            variant: 'destructive',
          });
          return;
        }
      }

      submitFeedbackMutation.mutate({
        id: decision.id,
        correct,
        notes: feedbackNotes.trim() || undefined,
        correctedOutput: parsedOutput,
      });
    } else {
      // Show the feedback form
      setShowFeedbackForm(true);
    }
  };

  const formatJson = (data: unknown) => {
    if (!data) return 'null';
    try {
      return JSON.stringify(data, null, 2);
    } catch {
      return String(data);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-2xl font-bold">{decision.blockName}</h2>
          <p className="text-sm text-muted-foreground">
            Decision ID: <span className="font-mono">{decision.id}</span>
          </p>
        </div>
        {onClose && (
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>

      {/* Metadata */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Metadata</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <span className="text-muted-foreground">Model:</span>{' '}
              <span className="font-mono text-xs">{decision.model || '-'}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Latency:</span>{' '}
              <span className="font-semibold">{formatDuration(decision.latencyMs)}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Input Tokens:</span>{' '}
              <span className="font-semibold">{formatTokens(decision.tokensInput)}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Output Tokens:</span>{' '}
              <span className="font-semibold">{formatTokens(decision.tokensOutput)}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Cost:</span>{' '}
              <span className="font-semibold">{formatCost(decision.cost ? parseFloat(decision.cost) : null)}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Created:</span>{' '}
              <span className="text-xs">
                {new Date(decision.createdAt).toLocaleString()}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Input */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Input</CardTitle>
          <CardDescription>The input provided to the AI block</CardDescription>
        </CardHeader>
        <CardContent>
          <pre className="rounded-md bg-muted p-4 text-xs overflow-auto max-h-60">
            <code>{formatJson(decision.input)}</code>
          </pre>
        </CardContent>
      </Card>

      {/* Output */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Output</CardTitle>
          <CardDescription>The output generated by the AI block</CardDescription>
        </CardHeader>
        <CardContent>
          <pre className="rounded-md bg-muted p-4 text-xs overflow-auto max-h-60">
            <code>{formatJson(decision.output)}</code>
          </pre>
        </CardContent>
      </Card>

      {/* Reasoning */}
      {decision.reasoning && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Reasoning</CardTitle>
            <CardDescription>AI model&apos;s reasoning process</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-md bg-muted p-4 text-sm whitespace-pre-wrap">
              {decision.reasoning}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Feedback Section */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Feedback</CardTitle>
          <CardDescription>
            {decision.feedbackCorrect !== null
              ? 'Feedback has been submitted'
              : 'Provide feedback on this decision'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {decision.feedbackCorrect !== null && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Status:</span>
                <Badge variant={decision.feedbackCorrect ? 'default' : 'destructive'}>
                  {decision.feedbackCorrect ? 'Correct' : 'Incorrect'}
                </Badge>
              </div>
              {decision.feedbackNotes && (
                <div>
                  <span className="text-sm font-medium">Notes:</span>
                  <p className="text-sm text-muted-foreground mt-1">{decision.feedbackNotes}</p>
                </div>
              )}
              {Boolean(decision.feedbackCorrectedOutput) && (
                <div>
                  <span className="text-sm font-medium">Corrected Output:</span>
                  <pre className="rounded-md bg-muted p-3 text-xs overflow-auto max-h-40 mt-1">
                    <code>{formatJson(decision.feedbackCorrectedOutput)}</code>
                  </pre>
                </div>
              )}
              {decision.feedbackAt && (
                <p className="text-xs text-muted-foreground">
                  Submitted: {new Date(decision.feedbackAt).toLocaleString()}
                </p>
              )}
            </div>
          )}

          {decision.feedbackCorrect === null && (
            <>
              {showFeedbackForm && (
                <div className="space-y-3">
                  <div className="space-y-2">
                    <Label htmlFor="feedback-notes">Notes (optional)</Label>
                    <Textarea
                      id="feedback-notes"
                      placeholder="Add any notes about this decision..."
                      value={feedbackNotes}
                      onChange={(e) => setFeedbackNotes(e.target.value)}
                      rows={3}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="corrected-output">Corrected Output (optional, JSON)</Label>
                    <Textarea
                      id="corrected-output"
                      placeholder='{"key": "value"}'
                      value={correctedOutput}
                      onChange={(e) => setCorrectedOutput(e.target.value)}
                      rows={5}
                      className="font-mono text-xs"
                    />
                  </div>
                </div>
              )}

              <div className="flex items-center gap-2">
                <Button
                  variant="default"
                  className="gap-2"
                  onClick={() => handleFeedback(true)}
                  disabled={submitFeedbackMutation.isPending}
                >
                  <ThumbsUp className="h-4 w-4" />
                  {showFeedbackForm ? 'Submit as Correct' : 'Correct'}
                </Button>
                <Button
                  variant="destructive"
                  className="gap-2"
                  onClick={() => handleFeedback(false)}
                  disabled={submitFeedbackMutation.isPending}
                >
                  <ThumbsDown className="h-4 w-4" />
                  {showFeedbackForm ? 'Submit as Incorrect' : 'Incorrect'}
                </Button>
                {showFeedbackForm && (
                  <Button
                    variant="outline"
                    onClick={() => {
                      setShowFeedbackForm(false);
                      setFeedbackNotes(decision.feedbackNotes || '');
                      setCorrectedOutput(
                        decision.feedbackCorrectedOutput
                          ? JSON.stringify(decision.feedbackCorrectedOutput, null, 2)
                          : ''
                      );
                    }}
                  >
                    Cancel
                  </Button>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
