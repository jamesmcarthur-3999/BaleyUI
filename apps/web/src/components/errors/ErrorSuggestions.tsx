'use client';

import * as React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Lightbulb, CheckCircle2, ExternalLink, Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { ExecutionError } from '@/lib/execution/errors';
import Link from 'next/link';
import { ROUTES } from '@/lib/routes';

export interface ErrorSuggestionsProps {
  error: ExecutionError | Error;
  /**
   * Custom className
   */
  className?: string;
  /**
   * Show action buttons for common fixes
   */
  showActions?: boolean;
  /**
   * Callback when a suggestion action is clicked
   */
  onAction?: (action: string) => void;
}

/**
 * Display suggested remediation actions for errors
 */
export function ErrorSuggestions({
  error,
  className,
  showActions = true,
  onAction,
}: ErrorSuggestionsProps) {
  const isExecutionError = 'code' in error && 'getRemediationSuggestions' in error;
  const executionError = isExecutionError ? (error as ExecutionError) : null;

  const suggestions = executionError
    ? executionError.getRemediationSuggestions()
    : ['Please try again or contact support if the issue persists.'];

  const getActionButtons = () => {
    if (!executionError || !showActions) return null;

    const actions: React.ReactNode[] = [];

    switch (executionError.code) {
      case 'PROVIDER_AUTH_FAILED':
        actions.push(
          <Button
            key="settings"
            variant="outline"
            size="sm"
            onClick={() => onAction?.('update-connection')}
            asChild
          >
            <Link href={ROUTES.settings.connections}>
              <Settings className="h-4 w-4 mr-2" />
              Update Connection
            </Link>
          </Button>
        );
        break;

      case 'PROVIDER_RATE_LIMIT':
        actions.push(
          <Button
            key="docs"
            variant="outline"
            size="sm"
            onClick={() => onAction?.('view-docs')}
            asChild
          >
            <a
              href={getProviderDocsUrl(executionError.context.provider as string)}
              target="_blank"
              rel="noopener noreferrer"
            >
              <ExternalLink className="h-4 w-4 mr-2" />
              View Provider Docs
            </a>
          </Button>
        );
        break;

      case 'VALIDATION_FAILED':
      case 'SCHEMA_MISMATCH':
        if (executionError.context.nodeId) {
          actions.push(
            <Button
              key="edit-node"
              variant="outline"
              size="sm"
              onClick={() => onAction?.('edit-node')}
            >
              <Settings className="h-4 w-4 mr-2" />
              Edit Block Configuration
            </Button>
          );
        }
        break;
    }

    return actions.length > 0 ? (
      <div className="flex flex-wrap gap-2 mt-3">{actions}</div>
    ) : null;
  };

  if (suggestions.length === 0) {
    return null;
  }

  return (
    <Card className={cn('border-l-4 border-l-yellow-500', className)}>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Lightbulb className="h-5 w-5 text-yellow-500" />
          <CardTitle className="text-base">Suggestions</CardTitle>
        </div>
        <CardDescription>
          Here are some steps you can take to resolve this error
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Suggestion List */}
        <ul className="space-y-2">
          {suggestions.map((suggestion, index) => (
            <li key={index} className="flex items-start gap-2 text-sm">
              <CheckCircle2 className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
              <span>{suggestion}</span>
            </li>
          ))}
        </ul>

        {/* Action Buttons */}
        {getActionButtons()}

        {/* Additional Context Hints */}
        {executionError && renderContextHints(executionError)}
      </CardContent>
    </Card>
  );
}

/**
 * Render additional context-specific hints
 */
function renderContextHints(error: ExecutionError): React.ReactNode {
  const hints: React.ReactNode[] = [];

  // Provider-specific hints
  if (error.context.provider) {
    const provider = error.context.provider as string;

    if (error.code === 'PROVIDER_RATE_LIMIT') {
      hints.push(
        <Alert key="rate-limit" className="mt-3">
          <AlertDescription className="text-xs">
            Rate limits vary by provider and plan. Consider spacing out your requests or upgrading
            your {provider} plan for higher limits.
          </AlertDescription>
        </Alert>
      );
    }

    if (error.code === 'PROVIDER_UNAVAILABLE') {
      hints.push(
        <Alert key="unavailable" className="mt-3">
          <AlertDescription className="text-xs">
            Check{' '}
            <a
              href={getProviderStatusUrl(provider)}
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-primary"
            >
              {provider} status page
            </a>{' '}
            for ongoing incidents.
          </AlertDescription>
        </Alert>
      );
    }
  }

  // Retry hints
  if (error.isRetryable && error.context.attempt && error.context.maxAttempts) {
    const attemptsRemaining =
      (error.context.maxAttempts as number) - (error.context.attempt as number);

    if (attemptsRemaining > 0) {
      hints.push(
        <div key="retry-info" className="flex items-center gap-2 mt-3">
          <Badge variant="outline" className="text-xs">
            {attemptsRemaining} {attemptsRemaining === 1 ? 'retry' : 'retries'} remaining
          </Badge>
        </div>
      );
    }
  }

  return hints.length > 0 ? <>{hints}</> : null;
}

/**
 * Get provider documentation URL
 */
function getProviderDocsUrl(provider: string): string {
  const urls: Record<string, string> = {
    openai: 'https://platform.openai.com/docs/guides/rate-limits',
    anthropic: 'https://docs.anthropic.com/claude/reference/rate-limits',
    ollama: 'https://github.com/ollama/ollama/blob/main/docs/faq.md',
  };

  return urls[provider.toLowerCase()] || 'https://docs.baleyui.com';
}

/**
 * Get provider status page URL
 */
function getProviderStatusUrl(provider: string): string {
  const urls: Record<string, string> = {
    openai: 'https://status.openai.com',
    anthropic: 'https://status.anthropic.com',
    ollama: 'https://github.com/ollama/ollama/issues',
  };

  return urls[provider.toLowerCase()] || 'https://status.baleyui.com';
}
