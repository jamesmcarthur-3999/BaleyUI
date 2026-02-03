'use client';

import { useState } from 'react';
import { trpc } from '@/lib/trpc/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/components/ui/use-toast';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Copy, Trash2, RefreshCw, Zap, CheckCircle2, XCircle, AlertCircle, ChevronDown, Code, BookOpen } from 'lucide-react';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';

interface WebhookConfigProps {
  flowId: string;
}

export function WebhookConfig({ flowId }: WebhookConfigProps) {
  const { toast } = useToast();
  const utils = trpc.useUtils();
  const [showRevokeDialog, setShowRevokeDialog] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [showDocs, setShowDocs] = useState(false);
  const [copiedCurl, setCopiedCurl] = useState(false);

  // Fetch current webhook config
  const { data: webhook, isLoading: isLoadingWebhook } = trpc.webhooks.getWebhook.useQuery({
    flowId,
  });

  // Fetch webhook logs
  const { data: logs, isLoading: isLoadingLogs } = trpc.webhooks.getWebhookLogs.useQuery({
    flowId,
    limit: 10,
  });

  // Generate webhook mutation
  const generateMutation = trpc.webhooks.generateWebhook.useMutation({
    onSuccess: (data) => {
      toast({
        title: 'Webhook Generated',
        description: 'Your webhook URL has been created successfully.',
      });
      utils.webhooks.getWebhook.invalidate({ flowId });
      utils.webhooks.getWebhookLogs.invalidate({ flowId });
    },
    onError: (error) => {
      toast({
        title: 'Failed to Generate Webhook',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Revoke webhook mutation
  const revokeMutation = trpc.webhooks.revokeWebhook.useMutation({
    onSuccess: () => {
      toast({
        title: 'Webhook Revoked',
        description: 'The webhook has been disabled.',
      });
      setShowRevokeDialog(false);
      utils.webhooks.getWebhook.invalidate({ flowId });
    },
    onError: (error) => {
      toast({
        title: 'Failed to Revoke Webhook',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Test webhook mutation
  const testMutation = trpc.webhooks.testWebhook.useMutation({
    onSuccess: (data) => {
      if (data.success) {
        toast({
          title: 'Test Successful',
          description: `Webhook test completed with status ${data.statusCode}`,
        });
      } else {
        toast({
          title: 'Test Failed',
          description: `Webhook returned status ${data.statusCode}`,
          variant: 'destructive',
        });
      }
      utils.webhooks.getWebhookLogs.invalidate({ flowId });
    },
    onError: (error) => {
      toast({
        title: 'Test Failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const handleCopyUrl = () => {
    if (webhook?.webhookUrl) {
      navigator.clipboard.writeText(webhook.webhookUrl);
      setCopiedUrl(true);
      toast({
        title: 'Copied',
        description: 'Webhook URL copied to clipboard',
      });
      setTimeout(() => setCopiedUrl(false), 2000);
    }
  };

  const handleGenerateWebhook = () => {
    generateMutation.mutate({ flowId });
  };

  const handleRevokeWebhook = () => {
    revokeMutation.mutate({ flowId });
  };

  const handleTestWebhook = () => {
    testMutation.mutate({ flowId });
  };

  const handleCopyCurl = () => {
    if (webhook?.webhookUrl) {
      const curlCommand = `curl -X POST "${webhook.webhookUrl}" \\
  -H "Content-Type: application/json" \\
  -d '{"message": "Hello from curl!"}'`;
      navigator.clipboard.writeText(curlCommand);
      setCopiedCurl(true);
      toast({
        title: 'Copied',
        description: 'curl command copied to clipboard',
      });
      setTimeout(() => setCopiedCurl(false), 2000);
    }
  };

  if (isLoadingWebhook) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Webhook Trigger</CardTitle>
          <CardDescription>Loading webhook configuration...</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Webhook Trigger</CardTitle>
          <CardDescription>
            Allow external systems to trigger this flow via HTTP POST requests
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {webhook ? (
            <>
              {/* Webhook URL */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Webhook URL</label>
                <div className="flex gap-2">
                  <Input
                    value={webhook.webhookUrl}
                    readOnly
                    className="font-mono text-xs"
                  />
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={handleCopyUrl}
                    disabled={copiedUrl}
                    aria-label={copiedUrl ? 'Copied' : 'Copy webhook URL'}
                  >
                    {copiedUrl ? (
                      <CheckCircle2 className="h-4 w-4 text-green-500" aria-hidden="true" />
                    ) : (
                      <Copy className="h-4 w-4" aria-hidden="true" />
                    )}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Created {webhook.createdAt ? new Date(webhook.createdAt).toLocaleString() : 'recently'}
                </p>
              </div>

              {/* Actions */}
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={handleTestWebhook}
                  disabled={testMutation.isPending}
                >
                  <Zap className="mr-2 h-4 w-4" />
                  Test Webhook
                </Button>
                <Button
                  variant="outline"
                  onClick={handleGenerateWebhook}
                  disabled={generateMutation.isPending}
                >
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Regenerate
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setShowRevokeDialog(true)}
                  disabled={revokeMutation.isPending}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Revoke
                </Button>
              </div>

              {/* Documentation */}
              <Collapsible open={showDocs} onOpenChange={setShowDocs}>
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" size="sm" className="w-full justify-start gap-2">
                    <BookOpen className="h-4 w-4" />
                    Usage Documentation
                    <ChevronDown className={`h-4 w-4 ml-auto transition-transform ${showDocs ? 'rotate-180' : ''}`} />
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="space-y-4 pt-4">
                  {/* Quick Start */}
                  <div className="space-y-2">
                    <h4 className="text-sm font-medium flex items-center gap-2">
                      <Code className="h-4 w-4" />
                      Quick Start (curl)
                    </h4>
                    <div className="relative">
                      <pre className="bg-muted p-3 rounded-md text-xs font-mono overflow-x-auto">
                        {`curl -X POST "${webhook.webhookUrl}" \\
  -H "Content-Type: application/json" \\
  -d '{"message": "Hello!"}'`}
                      </pre>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="absolute top-2 right-2 h-6 w-6"
                        onClick={handleCopyCurl}
                        aria-label={copiedCurl ? 'Copied' : 'Copy curl command'}
                      >
                        {copiedCurl ? (
                          <CheckCircle2 className="h-3 w-3 text-green-500" aria-hidden="true" />
                        ) : (
                          <Copy className="h-3 w-3" aria-hidden="true" />
                        )}
                      </Button>
                    </div>
                  </div>

                  {/* Request Format */}
                  <div className="space-y-2">
                    <h4 className="text-sm font-medium">Request Format</h4>
                    <div className="text-xs space-y-1 text-muted-foreground">
                      <p><strong>Method:</strong> POST</p>
                      <p><strong>Content-Type:</strong> application/json</p>
                      <p><strong>Body:</strong> Any valid JSON object</p>
                    </div>
                  </div>

                  {/* Response */}
                  <div className="space-y-2">
                    <h4 className="text-sm font-medium">Response</h4>
                    <pre className="bg-muted p-3 rounded-md text-xs font-mono overflow-x-auto">
{`{
  "success": true,
  "executionId": "uuid-here",
  "message": "Flow execution started"
}`}
                    </pre>
                  </div>

                  {/* Examples */}
                  <div className="space-y-2">
                    <h4 className="text-sm font-medium">Integration Examples</h4>
                    <div className="space-y-3">
                      {/* JavaScript */}
                      <div>
                        <Badge variant="secondary" className="mb-1">JavaScript</Badge>
                        <pre className="bg-muted p-3 rounded-md text-xs font-mono overflow-x-auto">
{`await fetch("${webhook.webhookUrl}", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ data: "your data" })
});`}
                        </pre>
                      </div>

                      {/* Python */}
                      <div>
                        <Badge variant="secondary" className="mb-1">Python</Badge>
                        <pre className="bg-muted p-3 rounded-md text-xs font-mono overflow-x-auto">
{`import requests
requests.post(
    "${webhook.webhookUrl}",
    json={"data": "your data"}
)`}
                        </pre>
                      </div>
                    </div>
                  </div>
                </CollapsibleContent>
              </Collapsible>
            </>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                No webhook has been configured for this flow yet.
              </p>
              <Button onClick={handleGenerateWebhook} disabled={generateMutation.isPending}>
                Generate Webhook URL
              </Button>
            </div>
          )}

          {/* Recent Invocations */}
          {webhook && (
            <>
              <Separator />
              <div className="space-y-3">
                <h3 className="text-sm font-medium">Recent Invocations</h3>
                {isLoadingLogs ? (
                  <p className="text-sm text-muted-foreground">Loading logs...</p>
                ) : logs && logs.length > 0 ? (
                  <div className="space-y-2">
                    {logs.map((log) => (
                      <div
                        key={log.id}
                        className="flex items-center justify-between rounded-lg border p-3 text-sm"
                      >
                        <div className="flex items-center gap-3">
                          {log.status === 'success' ? (
                            <CheckCircle2 className="h-4 w-4 text-green-500" />
                          ) : log.status === 'invalid_secret' ? (
                            <AlertCircle className="h-4 w-4 text-yellow-500" />
                          ) : (
                            <XCircle className="h-4 w-4 text-red-500" />
                          )}
                          <div>
                            <div className="flex items-center gap-2">
                              <Badge
                                variant={
                                  log.status === 'success'
                                    ? 'default'
                                    : log.status === 'invalid_secret'
                                    ? 'secondary'
                                    : 'destructive'
                                }
                              >
                                {log.statusCode}
                              </Badge>
                              <span className="text-xs text-muted-foreground">
                                {new Date(log.createdAt).toLocaleString()}
                              </span>
                            </div>
                            {log.ipAddress && (
                              <p className="text-xs text-muted-foreground">
                                From {log.ipAddress}
                              </p>
                            )}
                            {log.error && (
                              <p className="text-xs text-red-500">{log.error}</p>
                            )}
                          </div>
                        </div>
                        {log.executionId && (
                          <Badge variant="outline">
                            {log.execution?.status || 'pending'}
                          </Badge>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No invocations yet</p>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Revoke Confirmation Dialog */}
      <AlertDialog open={showRevokeDialog} onOpenChange={setShowRevokeDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke Webhook?</AlertDialogTitle>
            <AlertDialogDescription>
              This will disable the webhook. Any requests to the current webhook URL will be
              rejected. You can generate a new webhook URL at any time.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleRevokeWebhook}>Revoke</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
