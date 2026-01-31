'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Save, X, AlertCircle } from 'lucide-react';
import { trpc } from '@/lib/trpc/client';
import { useToast } from '@/components/ui/use-toast';

export type FeedbackCategory = 'hallucination' | 'wrong_format' | 'missing_info' | 'perfect' | 'partial';

const FEEDBACK_CATEGORIES: { value: FeedbackCategory; label: string; description: string }[] = [
  {
    value: 'perfect',
    label: 'Perfect',
    description: 'Output is completely correct',
  },
  {
    value: 'partial',
    label: 'Partial',
    description: 'Output is mostly correct but has minor issues',
  },
  {
    value: 'hallucination',
    label: 'Hallucination',
    description: 'AI generated false or fabricated information',
  },
  {
    value: 'wrong_format',
    label: 'Wrong Format',
    description: 'Output format does not match expected schema',
  },
  {
    value: 'missing_info',
    label: 'Missing Info',
    description: 'Output is incomplete or missing required information',
  },
];

interface Decision {
  id: string;
  blockName: string;
  output: any;
  feedbackCorrect: boolean | null;
  feedbackCategory: string | null;
  feedbackNotes: string | null;
}

interface FeedbackFormProps {
  decision: Decision;
  onSuccess?: () => void;
  onCancel?: () => void;
}

/**
 * Enhanced feedback form with categorization options.
 * Allows users to provide detailed feedback on AI decisions.
 */
export function FeedbackForm({ decision, onSuccess, onCancel }: FeedbackFormProps) {
  const [category, setCategory] = useState<FeedbackCategory | undefined>(
    decision.feedbackCategory as FeedbackCategory | undefined
  );
  const [notes, setNotes] = useState(decision.feedbackNotes || '');
  const [correctedOutput, setCorrectedOutput] = useState('');
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
      onSuccess?.();
    },
    onError: (error) => {
      toast({
        title: 'Failed to Submit Feedback',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const handleSubmit = () => {
    if (!category) {
      toast({
        title: 'Category Required',
        description: 'Please select a feedback category',
        variant: 'destructive',
      });
      return;
    }

    let parsedOutput = undefined;
    if (correctedOutput.trim()) {
      try {
        parsedOutput = JSON.parse(correctedOutput);
      } catch (e) {
        toast({
          title: 'Invalid JSON',
          description: 'Corrected output must be valid JSON',
          variant: 'destructive',
        });
        return;
      }
    }

    const isCorrect = category === 'perfect' || category === 'partial';

    submitFeedbackMutation.mutate({
      id: decision.id,
      correct: isCorrect,
      category,
      notes: notes.trim() || undefined,
      correctedOutput: parsedOutput,
    });
  };

  const getCategoryBadgeVariant = (cat: FeedbackCategory) => {
    switch (cat) {
      case 'perfect':
        return 'default';
      case 'partial':
        return 'secondary';
      case 'hallucination':
      case 'wrong_format':
      case 'missing_info':
        return 'destructive';
      default:
        return 'outline';
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Provide Feedback</CardTitle>
        <CardDescription>
          Help improve AI decisions by categorizing and providing notes
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Category Selection */}
        <div className="space-y-2">
          <Label htmlFor="category">Category *</Label>
          <Select value={category} onValueChange={(value) => setCategory(value as FeedbackCategory)}>
            <SelectTrigger id="category">
              <SelectValue placeholder="Select a category" />
            </SelectTrigger>
            <SelectContent>
              {FEEDBACK_CATEGORIES.map((cat) => (
                <SelectItem key={cat.value} value={cat.value}>
                  <div className="flex items-center gap-2">
                    <span>{cat.label}</span>
                    <span className="text-xs text-muted-foreground">- {cat.description}</span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {category && (
            <div className="flex items-center gap-2 mt-2">
              <span className="text-sm text-muted-foreground">Selected:</span>
              <Badge variant={getCategoryBadgeVariant(category)}>
                {FEEDBACK_CATEGORIES.find((c) => c.value === category)?.label}
              </Badge>
            </div>
          )}
        </div>

        {/* Notes */}
        <div className="space-y-2">
          <Label htmlFor="notes">Notes (optional)</Label>
          <Textarea
            id="notes"
            placeholder="Add any additional notes or context about this decision..."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
          />
        </div>

        {/* Corrected Output */}
        {category && category !== 'perfect' && (
          <div className="space-y-2">
            <Label htmlFor="corrected-output">Corrected Output (optional, JSON)</Label>
            <Textarea
              id="corrected-output"
              placeholder='{"corrected": "output"}'
              value={correctedOutput}
              onChange={(e) => setCorrectedOutput(e.target.value)}
              rows={5}
              className="font-mono text-xs"
            />
            <p className="text-xs text-muted-foreground">
              Provide the correct output if the AI decision was incorrect
            </p>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-2 pt-2">
          <Button
            onClick={handleSubmit}
            disabled={submitFeedbackMutation.isPending || !category}
            className="gap-2"
          >
            <Save className="h-4 w-4" />
            Submit Feedback
          </Button>
          {onCancel && (
            <Button
              variant="outline"
              onClick={onCancel}
              disabled={submitFeedbackMutation.isPending}
            >
              Cancel
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

interface BatchFeedbackFormProps {
  decisions: Decision[];
  onSuccess?: () => void;
  onCancel?: () => void;
}

/**
 * Batch feedback form for providing feedback on multiple decisions at once.
 */
export function BatchFeedbackForm({ decisions, onSuccess, onCancel }: BatchFeedbackFormProps) {
  const [selectedDecisions, setSelectedDecisions] = useState<Set<string>>(new Set());
  const [category, setCategory] = useState<FeedbackCategory | undefined>();
  const [notes, setNotes] = useState('');
  const { toast } = useToast();
  const utils = trpc.useUtils();

  const submitFeedbackMutation = trpc.decisions.submitFeedback.useMutation();

  const handleToggleDecision = (decisionId: string) => {
    const newSelected = new Set(selectedDecisions);
    if (newSelected.has(decisionId)) {
      newSelected.delete(decisionId);
    } else {
      newSelected.add(decisionId);
    }
    setSelectedDecisions(newSelected);
  };

  const handleSelectAll = () => {
    if (selectedDecisions.size === decisions.length) {
      setSelectedDecisions(new Set());
    } else {
      setSelectedDecisions(new Set(decisions.map((d) => d.id)));
    }
  };

  const handleBatchSubmit = async () => {
    if (selectedDecisions.size === 0) {
      toast({
        title: 'No Decisions Selected',
        description: 'Please select at least one decision to provide feedback',
        variant: 'destructive',
      });
      return;
    }

    if (!category) {
      toast({
        title: 'Category Required',
        description: 'Please select a feedback category',
        variant: 'destructive',
      });
      return;
    }

    const isCorrect = category === 'perfect' || category === 'partial';

    try {
      // Submit feedback for all selected decisions
      await Promise.all(
        Array.from(selectedDecisions).map((decisionId) =>
          submitFeedbackMutation.mutateAsync({
            id: decisionId,
            correct: isCorrect,
            category,
            notes: notes.trim() || undefined,
          })
        )
      );

      toast({
        title: 'Batch Feedback Submitted',
        description: `Feedback submitted for ${selectedDecisions.size} decision(s)`,
      });

      // Invalidate queries
      utils.decisions.list.invalidate();
      utils.decisions.getStats.invalidate();

      onSuccess?.();
    } catch (error: any) {
      toast({
        title: 'Failed to Submit Batch Feedback',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Batch Feedback</CardTitle>
        <CardDescription>
          Provide feedback for multiple decisions at once ({selectedDecisions.size} selected)
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Decision Selection */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>Select Decisions</Label>
            <Button variant="ghost" size="sm" onClick={handleSelectAll}>
              {selectedDecisions.size === decisions.length ? 'Deselect All' : 'Select All'}
            </Button>
          </div>
          <div className="border rounded-md p-3 max-h-60 overflow-y-auto space-y-2">
            {decisions.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                No decisions available
              </p>
            ) : (
              decisions.map((decision) => (
                <div key={decision.id} className="flex items-center gap-3">
                  <Checkbox
                    checked={selectedDecisions.has(decision.id)}
                    onCheckedChange={() => handleToggleDecision(decision.id)}
                  />
                  <div className="flex-1 text-sm">
                    <span className="font-medium">{decision.blockName}</span>
                    {decision.feedbackCorrect !== null && (
                      <Badge variant="outline" className="ml-2 text-xs">
                        Already reviewed
                      </Badge>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Category Selection */}
        <div className="space-y-2">
          <Label htmlFor="batch-category">Category *</Label>
          <Select value={category} onValueChange={(value) => setCategory(value as FeedbackCategory)}>
            <SelectTrigger id="batch-category">
              <SelectValue placeholder="Select a category" />
            </SelectTrigger>
            <SelectContent>
              {FEEDBACK_CATEGORIES.map((cat) => (
                <SelectItem key={cat.value} value={cat.value}>
                  <div className="flex items-center gap-2">
                    <span>{cat.label}</span>
                    <span className="text-xs text-muted-foreground">- {cat.description}</span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Notes */}
        <div className="space-y-2">
          <Label htmlFor="batch-notes">Notes (optional)</Label>
          <Textarea
            id="batch-notes"
            placeholder="Add notes that apply to all selected decisions..."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
          />
        </div>

        {/* Warning for already reviewed */}
        {decisions.some((d) => selectedDecisions.has(d.id) && d.feedbackCorrect !== null) && (
          <div className="flex items-start gap-2 p-3 bg-yellow-50 dark:bg-yellow-900/10 border border-yellow-200 dark:border-yellow-800 rounded-md">
            <AlertCircle className="h-4 w-4 text-yellow-600 dark:text-yellow-500 mt-0.5" />
            <p className="text-sm text-yellow-800 dark:text-yellow-200">
              Some selected decisions already have feedback. Submitting will overwrite the existing
              feedback.
            </p>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-2 pt-2">
          <Button
            onClick={handleBatchSubmit}
            disabled={submitFeedbackMutation.isPending || selectedDecisions.size === 0 || !category}
            className="gap-2"
          >
            <Save className="h-4 w-4" />
            Submit Feedback for {selectedDecisions.size} Decision(s)
          </Button>
          {onCancel && (
            <Button
              variant="outline"
              onClick={onCancel}
              disabled={submitFeedbackMutation.isPending}
            >
              Cancel
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
