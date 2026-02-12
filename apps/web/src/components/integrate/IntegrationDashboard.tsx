'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Webhook,
  Clock,
  Link2,
  Code2,
  Copy,
  Check,
  Rocket,
  Pause,
  Play,
  RotateCcw,
  Eye,
  EyeOff,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  CheckCircle2,
  Circle,
  Loader2,
  XCircle,
  ExternalLink,
  Settings,
} from 'lucide-react';
import { IntegrationKitCard } from './IntegrationKitCard';
import { cn } from '@/lib/utils';
import type { TriggerConfig } from '@/lib/baleybot/types';
import type { ReadinessState } from '@/lib/baleybot/readiness';

// ============================================================================
// TYPES
// ============================================================================

interface WebhookExecution {
  id: string;
  status: string;
  durationMs: number | null;
  createdAt: Date | string;
}

interface IntegrationDashboardProps {
  baleybotId: string;
  workspaceId: string;
  triggerConfig?: TriggerConfig;
  webhookInfo?: { url: string; secret: string } | null;
  lifecycleStage: string;
  readiness: ReadinessState;
  onGoLive: () => void;
  onPause: () => void;
  onRevertToDraft: () => void;
  isLaunchBusy?: boolean;
  onTestWebhook?: () => Promise<{ success: boolean; statusCode: number; responseTimeMs: number } | null>;
  webhookExecutions?: WebhookExecution[];
  apiKeyDisplay?: string;
  className?: string;
}

// ============================================================================
// COMPONENT
// ============================================================================

export function IntegrationDashboard({
  baleybotId,
  workspaceId,
  triggerConfig,
  webhookInfo,
  lifecycleStage,
  readiness,
  onGoLive,
  onPause,
  onRevertToDraft,
  isLaunchBusy,
  onTestWebhook,
  webhookExecutions,
  apiKeyDisplay,
  className,
}: IntegrationDashboardProps) {
  const [showResources, setShowResources] = useState(true);
  const [showSecret, setShowSecret] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [showDeliveries, setShowDeliveries] = useState(false);

  // Webhook test state
  const [isTestingWebhook, setIsTestingWebhook] = useState(false);
  const [webhookTestResult, setWebhookTestResult] = useState<{
    success: boolean;
    statusCode: number;
    responseTimeMs: number;
  } | null>(null);

  const isLive = lifecycleStage === 'live';
  const isPaused = lifecycleStage === 'paused';
  const hasWebhook = !!webhookInfo || triggerConfig?.type === 'webhook';
  const hasSchedule = triggerConfig?.type === 'schedule';
  const hasChain = triggerConfig?.type === 'other_bb';

  const webhookUrl = webhookInfo?.url ?? (hasWebhook
    ? `${typeof window !== 'undefined' ? window.location.origin : ''}/api/webhooks/baleybots/${workspaceId}/${baleybotId}`
    : null);

  const apiEndpoint = `${typeof window !== 'undefined' ? window.location.origin : ''}/api/baleybots/${baleybotId}/execute-stream`;

  const copyToClipboard = async (text: string, field: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const handleTestWebhook = async () => {
    if (!onTestWebhook || isTestingWebhook) return;
    setIsTestingWebhook(true);
    setWebhookTestResult(null);
    try {
      const result = await onTestWebhook();
      setWebhookTestResult(result);
    } catch {
      setWebhookTestResult({ success: false, statusCode: 0, responseTimeMs: 0 });
    } finally {
      setIsTestingWebhook(false);
    }
  };

  return (
    <div className={cn('h-full overflow-y-auto space-y-4 p-4', className)}>
      {/* Lifecycle Status */}
      <div className="rounded-[1.1rem] border border-border/60 bg-card/70 shadow-sm p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold">Lifecycle</h3>
          <LifecycleBadge stage={lifecycleStage} />
        </div>

        {/* Readiness summary */}
        <div className="grid grid-cols-2 gap-2 mb-4">
          {Object.entries(readiness).map(([key, status]) => (
            <div key={key} className="flex items-center gap-2 text-xs">
              {status === 'complete' ? (
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
              ) : status === 'in-progress' ? (
                <Circle className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400 fill-amber-500/30" />
              ) : (
                <Circle className="h-3.5 w-3.5 text-muted-foreground/40" />
              )}
              <span className={cn(
                'capitalize',
                status === 'complete' ? 'text-foreground' : 'text-muted-foreground',
              )}>
                {key}
              </span>
            </div>
          ))}
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2">
          {isLive ? (
            <>
              <Button
                size="sm"
                variant="destructive"
                onClick={onPause}
                disabled={isLaunchBusy}
              >
                <Pause className="h-3.5 w-3.5 mr-1.5" />
                Pause
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={onRevertToDraft}
                disabled={isLaunchBusy}
              >
                <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
                Revert to Draft
              </Button>
            </>
          ) : isPaused ? (
            <>
              <Button
                size="sm"
                onClick={onGoLive}
                disabled={isLaunchBusy}
              >
                <Play className="h-3.5 w-3.5 mr-1.5" />
                Resume
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={onRevertToDraft}
                disabled={isLaunchBusy}
              >
                <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
                Revert to Draft
              </Button>
            </>
          ) : (
            <Button
              size="sm"
              onClick={onGoLive}
              disabled={isLaunchBusy}
            >
              <Rocket className="h-3.5 w-3.5 mr-1.5" />
              Go Live
            </Button>
          )}
        </div>
      </div>

      {/* Active Integrations */}
      <div className="rounded-xl border border-border/60 bg-card/70 shadow-sm p-4">
        <h3 className="text-sm font-semibold mb-3">Active Integrations</h3>

        {!hasWebhook && !hasSchedule && !hasChain ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <div className="rounded-2xl bg-muted/30 p-4 mb-3">
              <Rocket className="h-8 w-8 text-muted-foreground/50" />
            </div>
            <p className="text-sm font-medium text-foreground/80">No integrations yet</p>
            <p className="text-xs text-muted-foreground mt-1 max-w-[280px]">
              Ask the AI assistant to set up a webhook, schedule, or chain trigger
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {/* Webhook card */}
            {hasWebhook && webhookUrl && (
              <IntegrationCard
                icon={Webhook}
                title="Webhook"
                status={webhookInfo ? 'active' : 'configured'}
              >
                <div className="space-y-2">
                  <CopyableField
                    label="URL"
                    value={webhookUrl}
                    fieldId="webhook-url"
                    copiedField={copiedField}
                    onCopy={copyToClipboard}
                  />
                  {webhookInfo?.secret && (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground w-14 shrink-0">Secret</span>
                      <code className="text-xs bg-muted/30 px-2 py-1 rounded flex-1 truncate font-mono">
                        {showSecret ? webhookInfo.secret : '\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022'}
                      </code>
                      <button
                        onClick={() => setShowSecret(!showSecret)}
                        className="text-muted-foreground hover:text-foreground"
                      >
                        {showSecret ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                      </button>
                      <button
                        onClick={() => copyToClipboard(webhookInfo.secret, 'webhook-secret')}
                        className="text-muted-foreground hover:text-foreground"
                      >
                        {copiedField === 'webhook-secret'
                          ? <Check className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                          : <Copy className="h-3.5 w-3.5" />
                        }
                      </button>
                    </div>
                  )}

                  {/* Test webhook button */}
                  {onTestWebhook && (
                    <div className="pt-1">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs"
                        onClick={handleTestWebhook}
                        disabled={isTestingWebhook}
                      >
                        {isTestingWebhook ? (
                          <>
                            <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                            Testing...
                          </>
                        ) : (
                          <>
                            <Play className="h-3 w-3 mr-1" />
                            Test Webhook
                          </>
                        )}
                      </Button>
                      {webhookTestResult && (
                        <div className={cn(
                          'mt-2 rounded-md px-2.5 py-1.5 text-xs flex items-center gap-2',
                          webhookTestResult.success
                            ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                            : 'bg-destructive/10 text-destructive',
                        )}>
                          {webhookTestResult.success ? (
                            <CheckCircle2 className="h-3.5 w-3.5" />
                          ) : (
                            <XCircle className="h-3.5 w-3.5" />
                          )}
                          <span>
                            {webhookTestResult.success ? 'Success' : 'Failed'}
                            {webhookTestResult.statusCode > 0 && ` (${webhookTestResult.statusCode})`}
                            {webhookTestResult.responseTimeMs > 0 && ` \u2014 ${webhookTestResult.responseTimeMs}ms`}
                          </span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Recent deliveries */}
                  {webhookExecutions && webhookExecutions.length > 0 && (
                    <div className="pt-1">
                      <button
                        onClick={() => setShowDeliveries(!showDeliveries)}
                        className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
                      >
                        Recent Deliveries ({webhookExecutions.length})
                        {showDeliveries ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                      </button>
                      {showDeliveries && (
                        <div className="mt-1.5 space-y-1">
                          {webhookExecutions.slice(0, 5).map((exec) => (
                            <div key={exec.id} className="flex items-center gap-2 text-xs">
                              {exec.status === 'completed' || exec.status === 'success' ? (
                                <CheckCircle2 className="h-3 w-3 text-emerald-600 dark:text-emerald-400 shrink-0" />
                              ) : exec.status === 'error' || exec.status === 'failed' ? (
                                <XCircle className="h-3 w-3 text-destructive shrink-0" />
                              ) : (
                                <Circle className="h-3 w-3 text-muted-foreground shrink-0" />
                              )}
                              <span className="text-muted-foreground flex-1">
                                {new Date(exec.createdAt).toLocaleString(undefined, {
                                  month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
                                })}
                              </span>
                              {exec.durationMs != null && (
                                <span className="text-muted-foreground/60">{(exec.durationMs / 1000).toFixed(1)}s</span>
                              )}
                              <a
                                href={`/dashboard/activity/${exec.id}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-muted-foreground hover:text-foreground"
                              >
                                <ExternalLink className="h-3 w-3" />
                              </a>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </IntegrationCard>
            )}

            {/* Schedule card */}
            {hasSchedule && triggerConfig && (
              <IntegrationCard
                icon={Clock}
                title="Schedule"
                status="configured"
              >
                <div className="text-xs text-muted-foreground">
                  <span className="font-mono bg-muted/30 px-1.5 py-0.5 rounded">
                    {triggerConfig.schedule ?? 'custom schedule'}
                  </span>
                </div>
              </IntegrationCard>
            )}

            {/* Chain card */}
            {hasChain && (
              <IntegrationCard
                icon={Link2}
                title="BB Chain"
                status="configured"
              >
                <div className="text-xs text-muted-foreground">
                  Triggered by another BaleyBot
                </div>
              </IntegrationCard>
            )}
          </div>
        )}
      </div>

      {/* API Access */}
      <div className="rounded-xl border border-border/60 bg-card/70 shadow-sm p-4">
        <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
          <Code2 className="h-4 w-4" />
          API Access
        </h3>
        <CopyableField
          label="Endpoint"
          value={apiEndpoint}
          fieldId="api-endpoint"
          copiedField={copiedField}
          onCopy={copyToClipboard}
        />
        {apiKeyDisplay && (
          <div className="mt-2 flex items-center gap-2 text-xs">
            <span className="text-muted-foreground">Using key:</span>
            <code className="bg-muted/30 px-1.5 py-0.5 rounded font-mono text-muted-foreground">{apiKeyDisplay}</code>
            <a href="/dashboard/settings" className="text-primary hover:underline flex items-center gap-0.5">
              <Settings className="h-3 w-3" />
              Manage
            </a>
          </div>
        )}
      </div>

      {/* Code Snippets */}
      <div className="rounded-xl border border-border/60 bg-card/70 shadow-sm">
        <button
          onClick={() => setShowResources(!showResources)}
          className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold hover:bg-muted/20 transition-colors"
        >
          <span>Code Snippets</span>
          {showResources ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
        {showResources && (
          <div className="border-t border-border/30 p-4 space-y-3">
            {hasWebhook && webhookUrl && (
              <IntegrationKitCard
                type="webhook"
                title="cURL \u2014 Webhook"
                description="Send a POST request to trigger this bot"
                code={`curl -X POST '${webhookUrl}' \\\n  -H 'Content-Type: application/json' \\\n  ${webhookInfo?.secret ? `-H 'X-Webhook-Secret: ${webhookInfo.secret}' \\\n  ` : ''}-d '{"message": "Hello"}'`}
              />
            )}
            <IntegrationKitCard
              type="api"
              title="JavaScript \u2014 Execute"
              description="Execute the bot via the streaming API"
              code={`const response = await fetch(\n  '${apiEndpoint}',\n  {\n    method: 'POST',\n    headers: {\n      'Content-Type': 'application/json',\n      'Authorization': 'Bearer YOUR_API_KEY',\n    },\n    body: JSON.stringify({ input: 'Hello' }),\n  }\n);\n\nconst reader = response.body.getReader();\nconst decoder = new TextDecoder();\n\nwhile (true) {\n  const { done, value } = await reader.read();\n  if (done) break;\n  const chunk = decoder.decode(value);\n  // Parse SSE events from chunk\n  console.log(chunk);\n}`}
            />
            <IntegrationKitCard
              type="api"
              title="Python \u2014 Execute"
              description="Execute the bot via the streaming API"
              code={`import requests\n\nresponse = requests.post(\n    '${apiEndpoint}',\n    headers={\n        'Content-Type': 'application/json',\n        'Authorization': 'Bearer YOUR_API_KEY',\n    },\n    json={'input': 'Hello'},\n    stream=True,\n)\n\nfor line in response.iter_lines():\n    if line:\n        print(line.decode('utf-8'))`}
            />
          </div>
        )}
      </div>

      {/* Warning for non-live bots */}
      {!isLive && !isPaused && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3">
          <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
          <p className="text-xs text-muted-foreground">
            This bot is in <strong>{lifecycleStage}</strong> mode. Webhooks and scheduled triggers will only execute when the bot is live.
          </p>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

function LifecycleBadge({ stage }: { stage: string }) {
  const styles: Record<string, string> = {
    draft: 'bg-muted text-muted-foreground',
    verified: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
    launch_prepared: 'bg-purple-500/10 text-purple-600 dark:text-purple-400',
    live: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
    paused: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  };
  return (
    <span className={cn('text-xs font-medium px-2 py-0.5 rounded-full', styles[stage] ?? styles.draft)}>
      {stage.replace('_', ' ')}
    </span>
  );
}

function IntegrationCard({
  icon: Icon,
  title,
  status,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  status: 'active' | 'configured' | 'error';
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border/40 bg-muted/20 p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">{title}</span>
        </div>
        <span className={cn(
          'text-[10px] font-medium px-1.5 py-0.5 rounded-full',
          status === 'active' ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' :
          status === 'error' ? 'bg-destructive/10 text-destructive' :
          'bg-muted text-muted-foreground',
        )}>
          {status}
        </span>
      </div>
      {children}
    </div>
  );
}

function CopyableField({
  label,
  value,
  fieldId,
  copiedField,
  onCopy,
}: {
  label: string;
  value: string;
  fieldId: string;
  copiedField: string | null;
  onCopy: (text: string, field: string) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-muted-foreground w-14 shrink-0">{label}</span>
      <code className="text-xs bg-muted/30 px-2 py-1 rounded flex-1 truncate font-mono">
        {value}
      </code>
      <button
        onClick={() => onCopy(value, fieldId)}
        className="text-muted-foreground hover:text-foreground shrink-0"
      >
        {copiedField === fieldId
          ? <Check className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
          : <Copy className="h-3.5 w-3.5" />
        }
      </button>
    </div>
  );
}
