'use client';

import { use, useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { ReactFlowProvider } from '@xyflow/react';
import { FlowCanvas } from '@/components/flow/FlowCanvas';
import { BlockPalette } from '@/components/flow/BlockPalette';
import { NodeConfigPanel } from '@/components/flow/NodeConfigPanel';
import { WebhookConfig } from '@/components/flows/WebhookConfig';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useFlowStore } from '@/stores/flow';
import { useToast } from '@/components/ui/use-toast';
import { trpc } from '@/lib/trpc/client';
import { ROUTES } from '@/lib/routes';
import {
  ArrowLeft,
  Save,
  Play,
  MoreVertical,
  Loader2,
  Settings,
  Webhook,
  Copy,
  Trash2,
  Power,
  PowerOff,
  Check,
} from 'lucide-react';
import { Breadcrumbs } from '@/components/ui/breadcrumbs';
import { SchemaForm } from '@/components/ui/schema-form';

export default function FlowEditorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const { toast } = useToast();
  const utils = trpc.useUtils();
  const { nodes, edges, selectedNodeId, lastSaved, setNodes, setEdges, setLastSaved, setAutoSaving } = useFlowStore();
  const [flowName, setFlowName] = useState('');
  const [flowVersion, setFlowVersion] = useState(1);
  const [flowEnabled, setFlowEnabled] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('blocks');
  const [showTestDialog, setShowTestDialog] = useState(false);
  const [testInput, setTestInput] = useState<Record<string, unknown>>({});
  const [isRunningTest, setIsRunningTest] = useState(false);
  const [lastSavedText, setLastSavedText] = useState<string | null>(null);
  const initialLoadRef = useRef(true);

  // Fetch flow data
  const { data: flow, isLoading: isLoadingFlow, error: flowError } = trpc.flows.getById.useQuery(
    { id },
    { enabled: !!id }
  );

  // Fetch blocks for palette
  const { data: blocks, isLoading: isLoadingBlocks } = trpc.blocks.list.useQuery();

  // Update mutation
  const updateFlow = trpc.flows.update.useMutation({
    onSuccess: (data) => {
      setFlowVersion(data.version);
      setLastSaved(new Date());
      setAutoSaving(false);
      toast({
        title: 'Flow Saved',
        description: 'Your changes have been saved',
      });
    },
    onError: (error) => {
      console.error('Failed to save flow:', error);
      setAutoSaving(false);
      toast({
        title: 'Save Failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Delete mutation
  const deleteFlow = trpc.flows.delete.useMutation({
    onSuccess: () => {
      toast({
        title: 'Flow Deleted',
        description: 'The flow has been deleted.',
      });
      router.push(ROUTES.flows.list);
    },
    onError: (error) => {
      toast({
        title: 'Delete Failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Duplicate mutation
  const duplicateFlow = trpc.flows.duplicate.useMutation({
    onSuccess: (newFlow) => {
      if (!newFlow) return;
      toast({
        title: 'Flow Duplicated',
        description: 'Opening the duplicated flow...',
      });
      router.push(ROUTES.flows.detail(newFlow.id));
    },
    onError: (error) => {
      toast({
        title: 'Duplicate Failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Load flow data into store when fetched
  useEffect(() => {
    if (flow && initialLoadRef.current) {
      setFlowName(flow.name);
      setFlowVersion(flow.version);
      setFlowEnabled(flow.enabled ?? false);
      setNodes(Array.isArray(flow.nodes) ? flow.nodes : []);
      setEdges(Array.isArray(flow.edges) ? flow.edges : []);
      initialLoadRef.current = false;
    }
  }, [flow, setNodes, setEdges]);

  // Reset initial load flag when id changes
  useEffect(() => {
    initialLoadRef.current = true;
  }, [id]);

  // Format last saved time
  const getLastSavedText = useCallback(() => {
    if (!lastSaved) return null;

    const now = new Date();
    const diffMs = now.getTime() - lastSaved.getTime();
    const diffMinutes = Math.floor(diffMs / 60000);

    if (diffMinutes < 1) {
      return 'just now';
    } else if (diffMinutes === 1) {
      return '1 minute ago';
    } else if (diffMinutes < 60) {
      return `${diffMinutes} minutes ago`;
    } else {
      const diffHours = Math.floor(diffMinutes / 60);
      if (diffHours === 1) {
        return '1 hour ago';
      }
      return `${diffHours} hours ago`;
    }
  }, [lastSaved]);

  // Update last saved text periodically
  useEffect(() => {
    const updateText = () => {
      setLastSavedText(getLastSavedText());
    };

    updateText();
    const interval = setInterval(updateText, 30000); // Update every 30 seconds

    return () => clearInterval(interval);
  }, [lastSaved, getLastSavedText]);

  const handleSave = useCallback(async () => {
    if (isSaving || !flow) return;

    setIsSaving(true);
    setAutoSaving(true);

    try {
      await updateFlow.mutateAsync({
        id,
        version: flowVersion,
        name: flowName,
        nodes,
        edges,
        enabled: flowEnabled,
      });
    } catch (error) {
      console.error('Failed to save flow:', error);
    } finally {
      setIsSaving(false);
    }
  }, [id, flowVersion, flowName, nodes, edges, flowEnabled, isSaving, flow, updateFlow, setAutoSaving]);

  const handleNameChange = (newName: string) => {
    setFlowName(newName);
  };

  const handleNameBlur = () => {
    setIsEditing(false);
    if (flowName !== flow?.name) {
      handleSave();
    }
  };

  const handleToggleEnabled = async () => {
    const newEnabled = !flowEnabled;
    setFlowEnabled(newEnabled);

    try {
      await updateFlow.mutateAsync({
        id,
        version: flowVersion,
        enabled: newEnabled,
      });
      toast({
        title: newEnabled ? 'Flow Enabled' : 'Flow Disabled',
        description: newEnabled
          ? 'The flow can now be triggered.'
          : 'The flow will not run until re-enabled.',
      });
    } catch (error) {
      setFlowEnabled(!newEnabled); // Revert on error
    }
  };

  const handleDelete = () => {
    if (confirm('Are you sure you want to delete this flow? This action cannot be undone.')) {
      deleteFlow.mutate({ id });
    }
  };

  const handleDuplicate = () => {
    duplicateFlow.mutate({ id });
  };

  const handleTestRun = async () => {
    setIsRunningTest(true);

    try {
      // Start execution via API
      const response = await fetch(`/api/flows/${id}/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input: testInput }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to start execution');
      }

      const data = await response.json();

      toast({
        title: 'Execution Started',
        description: 'Redirecting to execution view...',
      });

      setShowTestDialog(false);
      router.push(ROUTES.executions.detail(data.executionId));
    } catch (error) {
      toast({
        title: 'Test Failed',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setIsRunningTest(false);
    }
  };

  // Transform blocks for palette
  const paletteBlocks = (blocks || []).map((block) => ({
    id: block.id,
    name: block.name,
    type: block.type as 'ai' | 'function' | 'router' | 'parallel' | 'loop',
    description: block.description || undefined,
    model: block.model || undefined,
  }));

  // Loading state
  if (isLoadingFlow) {
    return (
      <div className="h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Error state
  if (flowError || !flow) {
    return (
      <div className="h-screen flex flex-col items-center justify-center gap-4">
        <h2 className="text-xl font-semibold">Flow not found</h2>
        <p className="text-muted-foreground">
          The flow you&apos;re looking for doesn&apos;t exist or you don&apos;t have access to it.
        </p>
        <Button onClick={() => router.push(ROUTES.flows.list)}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Flows
        </Button>
      </div>
    );
  }

  return (
    <ReactFlowProvider>
      <div className="h-screen flex flex-col">
        {/* Header */}
        <div className="border-b bg-background px-6 py-4">
          <Breadcrumbs
            items={[
              { label: 'Flows', href: ROUTES.flows.list },
              { label: flowName || flow?.name || 'Untitled Flow' }
            ]}
            className="mb-4"
          />
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => router.push(ROUTES.flows.list)}
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back
              </Button>

              {isEditing ? (
                <Input
                  value={flowName}
                  onChange={(e) => handleNameChange(e.target.value)}
                  onBlur={handleNameBlur}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleNameBlur();
                    if (e.key === 'Escape') {
                      setFlowName(flow.name);
                      setIsEditing(false);
                    }
                  }}
                  className="h-8 w-64"
                  autoFocus
                />
              ) : (
                <h1
                  className="text-xl font-semibold cursor-pointer hover:text-muted-foreground transition-colors"
                  onClick={() => setIsEditing(true)}
                >
                  {flowName || 'Untitled Flow'}
                </h1>
              )}

              <Badge variant={flowEnabled ? 'default' : 'secondary'}>
                {flowEnabled ? 'Enabled' : 'Disabled'}
              </Badge>

              {isSaving ? (
                <Badge variant="outline" className="text-xs gap-1">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Saving...
                </Badge>
              ) : lastSavedText && (
                <Badge variant="outline" className="text-xs gap-1">
                  <Check className="h-3 w-3 text-green-600" />
                  Last saved: {lastSavedText}
                </Badge>
              )}
            </div>

            <div className="flex items-center gap-2">
              <div className="text-sm text-muted-foreground">
                {nodes.length} node{nodes.length !== 1 ? 's' : ''}, {edges.length} edge
                {edges.length !== 1 ? 's' : ''}
              </div>

              <Button
                variant="outline"
                size="sm"
                onClick={handleSave}
                disabled={isSaving}
              >
                <Save className="h-4 w-4 mr-2" />
                Save
              </Button>

              <Button
                variant="default"
                size="sm"
                onClick={() => setShowTestDialog(true)}
                disabled={nodes.length === 0}
              >
                <Play className="h-4 w-4 mr-2" />
                Test Run
              </Button>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm">
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={handleToggleEnabled}>
                    {flowEnabled ? (
                      <>
                        <PowerOff className="h-4 w-4 mr-2" />
                        Disable Flow
                      </>
                    ) : (
                      <>
                        <Power className="h-4 w-4 mr-2" />
                        Enable Flow
                      </>
                    )}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleDuplicate}>
                    <Copy className="h-4 w-4 mr-2" />
                    Duplicate
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleDelete} className="text-destructive">
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 flex overflow-hidden">
          {/* Sidebar with Tabs */}
          <div className="w-80 border-r bg-muted/30 flex flex-col">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
              <TabsList className="grid w-full grid-cols-3 m-2">
                <TabsTrigger value="blocks">Blocks</TabsTrigger>
                <TabsTrigger value="triggers">Triggers</TabsTrigger>
                <TabsTrigger value="settings">Settings</TabsTrigger>
              </TabsList>

              <TabsContent value="blocks" className="flex-1 overflow-hidden m-0">
                {isLoadingBlocks ? (
                  <div className="flex items-center justify-center h-full">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : (
                  <BlockPalette blocks={paletteBlocks} className="border-0 h-full" />
                )}
              </TabsContent>

              <TabsContent value="triggers" className="flex-1 overflow-auto p-4 m-0">
                <WebhookConfig flowId={id} />
              </TabsContent>

              <TabsContent value="settings" className="flex-1 overflow-auto p-4 m-0 space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle>Flow Settings</CardTitle>
                    <CardDescription>Configure flow behavior</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label htmlFor="flow-enabled">Enabled</Label>
                        <p className="text-xs text-muted-foreground">
                          Allow this flow to be triggered
                        </p>
                      </div>
                      <Switch
                        id="flow-enabled"
                        checked={flowEnabled}
                        onCheckedChange={handleToggleEnabled}
                      />
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Flow Info</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">ID</span>
                      <span className="font-mono text-xs">{id}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Version</span>
                      <span>{flowVersion}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Created</span>
                      <span>{new Date(flow.createdAt).toLocaleDateString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Updated</span>
                      <span>{new Date(flow.updatedAt).toLocaleDateString()}</span>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>

          {/* Flow Canvas */}
          <div className="flex-1">
            <FlowCanvas flowId={id} onSave={handleSave} />
          </div>

          {/* Node Config Panel - shows when a node is selected */}
          {selectedNodeId && (
            <NodeConfigPanel onSave={handleSave} />
          )}
        </div>
      </div>

      {/* Test Run Dialog */}
      <Dialog open={showTestDialog} onOpenChange={setShowTestDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Test Run Flow</DialogTitle>
            <DialogDescription>
              Provide input data to test this flow as JSON.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 max-h-[400px] overflow-y-auto">
            <SchemaForm
              value={testInput}
              onChange={setTestInput}
              disabled={isRunningTest}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowTestDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleTestRun} disabled={isRunningTest}>
              {isRunningTest ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Starting...
                </>
              ) : (
                <>
                  <Play className="h-4 w-4 mr-2" />
                  Run Test
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ReactFlowProvider>
  );
}
