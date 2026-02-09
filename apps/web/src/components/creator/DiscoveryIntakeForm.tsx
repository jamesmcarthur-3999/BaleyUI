'use client';

import { useMemo, useState } from 'react';
import { AlertCircle, ArrowRight, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { CreatorMessage } from '@/lib/baleybot/creator-types';
import {
  CREATOR_REDACTED_VALUE,
  isSensitiveDiscoveryField,
  sanitizeCreatorText,
} from '@/lib/baleybot/creator-sanitization';
import { cn } from '@/lib/utils';

interface DiscoveryFormQuestion {
  id: string;
  label: string;
  description: string;
  requiredNow?: boolean;
}

interface DiscoveryIntakeFormProps {
  questions: DiscoveryFormQuestion[];
  onSubmit: (message: string | DiscoveryIntakeSubmission) => void;
  disabled?: boolean;
  className?: string;
}

type DiscoveryIntakeSummary = NonNullable<
  NonNullable<CreatorMessage['metadata']>['discoveryIntake']
>;

export interface DiscoveryIntakeSubmission {
  kind: 'discovery_intake';
  modelMessage: string;
  displayMessage: string;
  summary: DiscoveryIntakeSummary;
}

function getInputType(question: DiscoveryFormQuestion): 'text' | 'password' {
  return isSensitiveDiscoveryField(question.label, question.description)
    ? 'password'
    : 'text';
}

function truncate(value: string, maxLength = 120): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 1)}...`;
}

function buildDiscoverySubmission(params: {
  questions: DiscoveryFormQuestion[];
  answers: Record<string, string>;
  additionalContext: string;
}): DiscoveryIntakeSubmission {
  const modelLines: string[] = ['Discovery answers:'];
  const displayLines: string[] = ['Discovery intake submitted.'];
  const answerSummaries: DiscoveryIntakeSummary['answers'] = [];

  for (const question of params.questions) {
    const rawValue = params.answers[question.id]?.trim();
    if (!rawValue) continue;

    const value = sanitizeCreatorText(rawValue);
    const isSensitive = isSensitiveDiscoveryField(question.label, question.description);

    answerSummaries.push({
      id: question.id,
      label: question.label,
      valuePreview: isSensitive ? 'Provided securely' : truncate(value),
      requiredNow: question.requiredNow !== false,
      isSensitive,
    });

    modelLines.push(
      isSensitive
        ? `${question.label}: ${CREATOR_REDACTED_VALUE} (provided via secure field)`
        : `${question.label}: ${value}`
    );
  }

  const extra = params.additionalContext.trim();
  let sanitizedContext: string | undefined;
  if (extra) {
    sanitizedContext = sanitizeCreatorText(extra);
    modelLines.push(`Additional Context: ${sanitizedContext}`);
  }

  modelLines.push(
    'Continue with these details. For unanswered fields, use safe defaults and only ask follow-ups if generation is blocked.'
  );

  const requiredTotal = params.questions.filter((question) => question.requiredNow !== false).length;
  const requiredProvided = answerSummaries.filter((answer) => answer.requiredNow).length;
  const optionalProvided = answerSummaries.filter((answer) => !answer.requiredNow).length;

  displayLines.push(`Required details: ${requiredProvided}/${requiredTotal} provided.`);

  return {
    kind: 'discovery_intake',
    modelMessage: modelLines.join('\n'),
    displayMessage: displayLines.join('\n'),
    summary: {
      requiredTotal,
      requiredProvided,
      optionalProvided,
      answers: answerSummaries,
      additionalContext: sanitizedContext,
      modelMessage: modelLines.join('\n'),
    },
  };
}

export function DiscoveryIntakeForm({
  questions,
  onSubmit,
  disabled = false,
  className,
}: DiscoveryIntakeFormProps) {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [additionalContext, setAdditionalContext] = useState('');
  const [showAllQuestions, setShowAllQuestions] = useState(false);
  const [showOptional, setShowOptional] = useState(false);

  const requiredQuestions = useMemo(
    () => questions.filter((question) => question.requiredNow !== false),
    [questions]
  );
  const optionalQuestions = useMemo(
    () => questions.filter((question) => question.requiredNow === false),
    [questions]
  );

  const allVisibleQuestions = showOptional
    ? questions
    : requiredQuestions.length > 0
      ? requiredQuestions
      : questions;
  const answeredQuestionIds = useMemo(
    () =>
      new Set(
        questions
          .filter((question) => Boolean(answers[question.id]?.trim()))
          .map((question) => question.id)
      ),
    [answers, questions]
  );
  const unansweredRequiredQuestions = useMemo(
    () => requiredQuestions.filter((question) => !answeredQuestionIds.has(question.id)),
    [answeredQuestionIds, requiredQuestions]
  );
  const unansweredOptionalQuestions = useMemo(
    () => optionalQuestions.filter((question) => !answeredQuestionIds.has(question.id)),
    [answeredQuestionIds, optionalQuestions]
  );
  const guidedQuestion =
    unansweredRequiredQuestions[0] ??
    (showOptional ? unansweredOptionalQuestions[0] : null);

  const visibleQuestions = showAllQuestions
    ? allVisibleQuestions
    : guidedQuestion
      ? [guidedQuestion]
      : [];

  const requiredTotal = requiredQuestions.length;
  const requiredProvided = requiredQuestions.filter((question) =>
    Boolean(answers[question.id]?.trim())
  ).length;
  const providedCount = questions.filter((question) =>
    Boolean(answers[question.id]?.trim())
  ).length;

  const canSubmit =
    !disabled && (providedCount > 0 || additionalContext.trim().length > 0 || requiredTotal === 0);

  const handleSubmit = () => {
    if (!canSubmit) return;
    onSubmit(
      buildDiscoverySubmission({
        questions,
        answers,
        additionalContext,
      })
    );
  };

  const handleContinueWithDefaults = () => {
    if (disabled) return;
    onSubmit(
      buildDiscoverySubmission({
        questions,
        answers,
        additionalContext:
          additionalContext.trim() ||
          'Continue with best-practice defaults for missing details. Ask a follow-up only if generation cannot proceed.',
      })
    );
  };

  return (
    <div className={cn('rounded-lg border border-border/60 bg-background/60 p-3 space-y-3', className)}>
      <div className="space-y-1">
        <p className="text-sm font-medium flex items-center gap-1.5">
          <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
          Discovery Details
        </p>
        <p className="text-xs text-muted-foreground">
          We will guide this one question at a time. Skip anything unknown and continue with safe defaults.
        </p>
        <p className="text-[11px] text-muted-foreground">
          Your answers directly shape the generated BAL and visual design.
        </p>
      </div>

      {requiredTotal > 0 && (
        <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-2.5 py-2">
          <p className="text-[11px] text-amber-700 dark:text-amber-300">
            Required details: {requiredProvided}/{requiredTotal}
          </p>
        </div>
      )}

      {(questions.length > 1 || optionalQuestions.length > 0) && (
        <div className="flex items-center justify-between rounded-md border border-border/50 bg-muted/20 px-2.5 py-2">
          <p className="text-[11px] text-muted-foreground">
            {showAllQuestions
              ? 'Showing all discovery prompts'
              : 'Focused mode: showing only the next best prompt'}
          </p>
          <div className="flex items-center gap-2">
            {optionalQuestions.length > 0 && (
              <button
                type="button"
                disabled={disabled}
                onClick={() => setShowOptional((prev) => !prev)}
                className="text-[11px] rounded-full border border-border/60 bg-background/80 px-2 py-1 text-muted-foreground hover:text-foreground hover:bg-background transition-colors disabled:opacity-60"
              >
                {showOptional ? 'Hide optional' : `Show optional (${optionalQuestions.length})`}
              </button>
            )}
            {questions.length > 1 && (
              <button
                type="button"
                disabled={disabled}
                onClick={() => setShowAllQuestions((prev) => !prev)}
                className="text-[11px] rounded-full border border-border/60 bg-background/80 px-2 py-1 text-muted-foreground hover:text-foreground hover:bg-background transition-colors disabled:opacity-60"
              >
                {showAllQuestions ? 'Guided mode' : 'Show all'}
              </button>
            )}
          </div>
        </div>
      )}

      <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
        {!showAllQuestions && guidedQuestion && (
          <div className="rounded-md border border-primary/25 bg-primary/5 px-2.5 py-2">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Next question</p>
            <p className="text-xs font-medium mt-1">{guidedQuestion.label}</p>
          </div>
        )}

        {visibleQuestions.map((question) => {
          const inputType = getInputType(question);
          const value = answers[question.id] ?? '';
          const isRequired = question.requiredNow !== false;

          return (
            <label key={question.id} className="block space-y-1">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-medium">{question.label}</span>
                <span
                  className={cn(
                    'text-[10px] px-1 py-0.5 rounded-full border',
                    isRequired
                      ? 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400'
                      : 'border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-400'
                  )}
                >
                  {isRequired ? 'required' : 'optional'}
                </span>
              </div>

              <p className="text-[11px] text-muted-foreground">{question.description}</p>

              <input
                type={inputType}
                value={value}
                onChange={(event) =>
                  setAnswers((previous) => ({
                    ...previous,
                    [question.id]: event.target.value,
                  }))
                }
                disabled={disabled}
                placeholder={
                  inputType === 'password'
                    ? 'Enter secret value (redacted before submit)'
                    : 'Answer in plain language'
                }
                className="w-full h-9 rounded-md border border-border/60 bg-background px-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
              />

              {isRequired && !value.trim() && (
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() =>
                    setAnswers((previous) => ({
                      ...previous,
                      [question.id]: 'Not sure yet. Please choose a safe default and continue.',
                    }))
                  }
                  className="text-[11px] rounded-full border border-border/60 bg-background/80 px-2 py-1 text-muted-foreground hover:text-foreground hover:bg-background transition-colors disabled:opacity-60"
                >
                  Not sure, use default guidance
                </button>
              )}
            </label>
          );
        })}

        {!showAllQuestions && !guidedQuestion && (
          <div className="rounded-md border border-green-500/25 bg-green-500/5 px-2.5 py-2">
            <p className="text-xs text-green-700 dark:text-green-300">
              Required discovery details are complete. You can submit now, or expand to add extra context.
            </p>
          </div>
        )}
      </div>

      <label className="block space-y-1">
        <span className="text-xs font-medium">Additional context (optional)</span>
        <textarea
          value={additionalContext}
          onChange={(event) => setAdditionalContext(event.target.value)}
          disabled={disabled}
          rows={2}
          placeholder="Anything else the creator should consider..."
          className="w-full rounded-md border border-border/60 bg-background px-2.5 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/20"
        />
      </label>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          onClick={handleSubmit}
          disabled={!canSubmit}
          className="gap-1.5"
        >
          <ArrowRight className="h-3.5 w-3.5" />
          Submit Details
        </Button>

        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={handleContinueWithDefaults}
          disabled={disabled}
          className="gap-1.5"
        >
          <Sparkles className="h-3.5 w-3.5" />
          Continue With Defaults
        </Button>
      </div>
    </div>
  );
}
