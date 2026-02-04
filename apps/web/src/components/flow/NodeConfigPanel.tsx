'use client';

import { useEffect, useState } from 'react';
import { useFlowStore } from '@/stores/flow';
import { trpc } from '@/lib/trpc/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  X,
  Sparkles,
  Code,
  GitBranch,
  Workflow,
  RotateCw,
  Play,
  Flag,
  ExternalLink,
  Trash2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import Link from 'next/link';

interface NodeConfigPanelProps {
  onSave?: () => void;
  onClose?: () => void;
  className?: string;
}

export function NodeConfigPanel({ onSave, onClose, className }: NodeConfigPanelProps) {
  const { nodes, selectedNodeId, selectNode, updateNode, deleteNode } = useFlowStore();

  const selectedNode = nodes.find((n) => n.id === selectedNodeId);

  // Local state for editing
  const [name, setName] = useState('');
  const [model, setModel] = useState('');
  const [routes, setRoutes] = useState<string[]>([]);
  const [branches, setBranches] = useState(2);
  const [maxIterations, setMaxIterations] = useState(10);

  // Fetch block details if node references a block
  const blockId = selectedNode?.data?.blockId as string | undefined;
  const { data: block } = trpc.blocks.getById.useQuery(
    { id: blockId! },
    { enabled: !!blockId }
  );

  // Fetch connections for model selector
  const { data: connections } = trpc.connections.list.useQuery();

  // Sync local state with selected node
  useEffect(() => {
    if (selectedNode) {
      setName((selectedNode.data?.name as string) || '');
      setModel((selectedNode.data?.model as string) || '');
      setRoutes((selectedNode.data?.routes as string[]) || []);
      setBranches((selectedNode.data?.branches as number) || 2);
      setMaxIterations((selectedNode.data?.maxIterations as number) || 10);
    }
  }, [selectedNode]);

  const handleSave = () => {
    if (!selectedNodeId) return;

    const updates: Record<string, unknown> = { name };

    if (selectedNode?.type === 'aiBlock' || selectedNode?.type === 'functionBlock') {
      updates.model = model;
    }
    if (selectedNode?.type === 'router') {
      updates.routes = routes;
    }
    if (selectedNode?.type === 'parallel') {
      updates.branches = branches;
    }
    if (selectedNode?.type === 'loop') {
      updates.maxIterations = maxIterations;
    }

    updateNode(selectedNodeId, updates);
    onSave?.();
  };

  const handleDelete = () => {
    if (!selectedNodeId) return;
    if (confirm('Are you sure you want to remove this node from the flow?')) {
      deleteNode(selectedNodeId);
      onSave?.();
    }
  };

  const handleClose = () => {
    selectNode(null);
    onClose?.();
  };

  const handleAddRoute = () => {
    setRoutes([...routes, `route_${routes.length + 1}`]);
  };

  const handleRemoveRoute = (index: number) => {
    setRoutes(routes.filter((_, i) => i !== index));
  };

  const handleRouteChange = (index: number, value: string) => {
    const newRoutes = [...routes];
    newRoutes[index] = value;
    setRoutes(newRoutes);
  };

  // Auto-save on blur
  const handleBlur = () => {
    handleSave();
  };

  if (!selectedNode) {
    return null;
  }

  const nodeType = selectedNode.type;
  const nodeIcon = {
    aiBlock: <Sparkles className="h-4 w-4" />,
    functionBlock: <Code className="h-4 w-4" />,
    router: <GitBranch className="h-4 w-4" />,
    parallel: <Workflow className="h-4 w-4" />,
    loop: <RotateCw className="h-4 w-4" />,
    source: <Play className="h-4 w-4" />,
    sink: <Flag className="h-4 w-4" />,
  }[nodeType || 'aiBlock'];

  const nodeLabel = {
    aiBlock: 'AI Block',
    functionBlock: 'Function Block',
    router: 'Router',
    parallel: 'Parallel',
    loop: 'Loop',
    source: 'Trigger',
    sink: 'Output',
  }[nodeType || 'aiBlock'];

  const nodeColor = {
    aiBlock: 'text-[hsl(var(--color-block-ai))]',
    functionBlock: 'text-[hsl(var(--color-block-function))]',
    router: 'text-[hsl(var(--color-block-router))]',
    parallel: 'text-[hsl(var(--color-block-parallel))]',
    loop: 'text-primary',
    source: 'text-green-500',
    sink: 'text-red-500',
  }[nodeType || 'aiBlock'];

  return (
    <div className={cn('w-80 border-l bg-background flex flex-col', className)}>
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b">
        <div className="flex items-center gap-2">
          <span className={nodeColor}>{nodeIcon}</span>
          <span className="font-medium">{nodeLabel}</span>
        </div>
        <Button variant="ghost" size="icon" onClick={handleClose} aria-label="Close panel">
          <X className="h-4 w-4" aria-hidden="true" />
        </Button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-4 space-y-4">
        {/* Name */}
        <div className="space-y-2">
          <Label htmlFor="node-name">Name</Label>
          <Input
            id="node-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={handleBlur}
            placeholder="Enter node name"
          />
        </div>

        {/* AI Block specific config */}
        {nodeType === 'aiBlock' && (
          <>
            <Separator />
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Model</Label>
                <Input
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  onBlur={handleBlur}
                  placeholder="e.g., gpt-4o-mini"
                />
              </div>

              {blockId && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Linked Block</CardTitle>
                    <CardDescription className="text-xs">
                      This node uses a pre-configured block
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">{block?.name || 'Loading...'}</span>
                      <Link href={`/dashboard/blocks/${blockId}`}>
                        <Button variant="ghost" size="sm">
                          <ExternalLink className="h-3 w-3 mr-1" />
                          Edit
                        </Button>
                      </Link>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          </>
        )}

        {/* Function Block specific config */}
        {nodeType === 'functionBlock' && (
          <>
            <Separator />
            <div className="space-y-4">
              {blockId && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Linked Block</CardTitle>
                    <CardDescription className="text-xs">
                      This node uses a pre-configured function
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">{block?.name || 'Loading...'}</span>
                      <Link href={`/dashboard/blocks/${blockId}`}>
                        <Button variant="ghost" size="sm">
                          <ExternalLink className="h-3 w-3 mr-1" />
                          Edit Code
                        </Button>
                      </Link>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          </>
        )}

        {/* Router specific config */}
        {nodeType === 'router' && (
          <>
            <Separator />
            <div className="space-y-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Routes</Label>
                  <Button variant="outline" size="sm" onClick={handleAddRoute}>
                    + Add Route
                  </Button>
                </div>
                <div className="space-y-2">
                  {routes.map((route, index) => (
                    <div key={index} className="flex items-center gap-2">
                      <Input
                        value={route}
                        onChange={(e) => handleRouteChange(index, e.target.value)}
                        onBlur={handleBlur}
                        placeholder={`Route ${index + 1}`}
                        className="flex-1"
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleRemoveRoute(index)}
                        disabled={routes.length <= 1}
                        aria-label={`Remove route ${index + 1}`}
                      >
                        <X className="h-4 w-4" aria-hidden="true" />
                      </Button>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  Define the possible routes. The router will direct input to one of these based on conditions.
                </p>
              </div>
            </div>
          </>
        )}

        {/* Parallel specific config */}
        {nodeType === 'parallel' && (
          <>
            <Separator />
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="branches">Number of Branches</Label>
                <Input
                  id="branches"
                  type="number"
                  min={2}
                  max={10}
                  value={branches}
                  onChange={(e) => setBranches(parseInt(e.target.value) || 2)}
                  onBlur={handleBlur}
                />
                <p className="text-xs text-muted-foreground">
                  How many parallel paths to create. All branches run simultaneously.
                </p>
              </div>
            </div>
          </>
        )}

        {/* Loop specific config */}
        {nodeType === 'loop' && (
          <>
            <Separator />
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="maxIterations">Max Iterations</Label>
                <Input
                  id="maxIterations"
                  type="number"
                  min={1}
                  max={100}
                  value={maxIterations}
                  onChange={(e) => setMaxIterations(parseInt(e.target.value) || 10)}
                  onBlur={handleBlur}
                />
                <p className="text-xs text-muted-foreground">
                  Maximum number of times to repeat. Loop exits when condition is met or max is reached.
                </p>
              </div>
            </div>
          </>
        )}

        {/* Source/Trigger specific config */}
        {nodeType === 'source' && (
          <>
            <Separator />
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Trigger Configuration</CardTitle>
                <CardDescription className="text-xs">
                  Configure how this workflow starts
                </CardDescription>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                Use the Triggers tab in the sidebar to configure webhooks and other trigger types.
              </CardContent>
            </Card>
          </>
        )}

        {/* Sink/Output specific config */}
        {nodeType === 'sink' && (
          <>
            <Separator />
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Output Configuration</CardTitle>
                <CardDescription className="text-xs">
                  This marks the end of the workflow
                </CardDescription>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                The workflow output will be the data that reaches this node.
              </CardContent>
            </Card>
          </>
        )}
      </div>

      {/* Footer */}
      <div className="p-4 border-t space-y-2">
        <Button variant="outline" className="w-full" onClick={handleSave}>
          Save Changes
        </Button>
        <Button
          variant="ghost"
          className="w-full text-destructive hover:text-destructive"
          onClick={handleDelete}
        >
          <Trash2 className="h-4 w-4 mr-2" />
          Remove from Flow
        </Button>
      </div>
    </div>
  );
}
