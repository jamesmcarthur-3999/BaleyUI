'use client';

import { useState } from 'react';
import { trpc } from '@/lib/trpc/client';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { SlidePanel, SlidePanelFooter } from '@/components/ui/slide-panel';
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

import {
  Wrench,
  Plus,
  Cog,
  Calendar,
  Database,
  Shield,
  ShieldCheck,
  Pencil,
  Trash2,
  X,
} from 'lucide-react';

// ============================================================================
// BUILT-IN TOOLS DATA (static, matches BUILT_IN_TOOLS_METADATA)
// ============================================================================

interface BuiltInToolInfo {
  name: string;
  description: string;
  category: string;
  approvalRequired: boolean;
  dangerLevel: 'safe' | 'moderate' | 'dangerous';
}

const BUILT_IN_TOOLS: BuiltInToolInfo[] = [
  { name: 'web_search', description: 'Search the web for information using a search query', category: 'information', approvalRequired: false, dangerLevel: 'safe' },
  { name: 'fetch_url', description: 'Fetch content from a URL and return it as text, HTML, or JSON', category: 'information', approvalRequired: false, dangerLevel: 'safe' },
  { name: 'spawn_baleybot', description: 'Execute another BaleyBot and return its result', category: 'orchestration', approvalRequired: false, dangerLevel: 'safe' },
  { name: 'send_notification', description: 'Send a notification to the user', category: 'communication', approvalRequired: false, dangerLevel: 'safe' },
  { name: 'store_memory', description: 'Persist key-value data across BaleyBot executions', category: 'storage', approvalRequired: false, dangerLevel: 'safe' },
  { name: 'shared_storage', description: 'Shared cross-workspace storage for data exchange between BBs', category: 'storage', approvalRequired: false, dangerLevel: 'safe' },
  { name: 'schedule_task', description: 'Schedule a BaleyBot to run at a future time or on a recurring basis', category: 'scheduling', approvalRequired: true, dangerLevel: 'moderate' },
  { name: 'create_agent', description: 'Create an ephemeral agent that can use parent tools', category: 'advanced', approvalRequired: true, dangerLevel: 'moderate' },
  { name: 'create_tool', description: 'Create a custom tool at runtime from natural language', category: 'advanced', approvalRequired: true, dangerLevel: 'moderate' },
];

// ============================================================================
// HELPERS
// ============================================================================

function formatDate(date: Date | string): string {
  return new Date(date).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function getCategoryColor(category: string): string {
  switch (category) {
    case 'information': return 'bg-blue-500/10 text-blue-700 dark:text-blue-400';
    case 'orchestration': return 'bg-purple-500/10 text-purple-700 dark:text-purple-400';
    case 'communication': return 'bg-green-500/10 text-green-700 dark:text-green-400';
    case 'storage': return 'bg-amber-500/10 text-amber-700 dark:text-amber-400';
    case 'scheduling': return 'bg-orange-500/10 text-orange-700 dark:text-orange-400';
    case 'advanced': return 'bg-red-500/10 text-red-700 dark:text-red-400';
    case 'database': return 'bg-teal-500/10 text-teal-700 dark:text-teal-400';
    default: return 'bg-gray-500/10 text-gray-700 dark:text-gray-400';
  }
}

// ============================================================================
// PARAMETER TYPES
// ============================================================================

interface ToolParameter {
  id: string;
  name: string;
  type: 'string' | 'number' | 'boolean';
  description: string;
  required: boolean;
}

function buildJsonSchema(params: ToolParameter[]): Record<string, unknown> {
  const properties: Record<string, unknown> = {};
  const required: string[] = [];

  for (const param of params) {
    properties[param.name] = {
      type: param.type,
      description: param.description,
    };
    if (param.required) {
      required.push(param.name);
    }
  }

  return {
    type: 'object',
    properties,
    ...(required.length > 0 ? { required } : {}),
  };
}

function parseJsonSchemaToParams(schema: Record<string, unknown>): ToolParameter[] {
  const properties = (schema.properties || {}) as Record<string, Record<string, unknown>>;
  const required = (schema.required || []) as string[];
  const params: ToolParameter[] = [];

  for (const [name, def] of Object.entries(properties)) {
    params.push({
      id: crypto.randomUUID(),
      name,
      type: (def.type as 'string' | 'number' | 'boolean') || 'string',
      description: (def.description as string) || '',
      required: required.includes(name),
    });
  }

  return params;
}

// ============================================================================
// SCHEMA BUILDER COMPONENT
// ============================================================================

function SchemaBuilder({
  parameters,
  onChange,
}: {
  parameters: ToolParameter[];
  onChange: (params: ToolParameter[]) => void;
}) {
  function addParameter() {
    onChange([
      ...parameters,
      {
        id: crypto.randomUUID(),
        name: '',
        type: 'string',
        description: '',
        required: false,
      },
    ]);
  }

  function removeParameter(id: string) {
    onChange(parameters.filter((p) => p.id !== id));
  }

  function updateParameter(id: string, field: keyof ToolParameter, value: unknown) {
    onChange(
      parameters.map((p) => (p.id === id ? { ...p, [field]: value } : p))
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-medium">Input Parameters</Label>
        <Button type="button" variant="outline" size="sm" onClick={addParameter}>
          <Plus className="h-3 w-3 mr-1" />
          Add
        </Button>
      </div>
      {parameters.length === 0 ? (
        <p className="text-sm text-muted-foreground py-2">
          No parameters defined. Click &ldquo;Add&rdquo; to add input parameters.
        </p>
      ) : (
        <div className="space-y-2">
          {parameters.map((param) => (
            <div key={param.id} className="flex items-start gap-2 rounded-md border p-3">
              <div className="grid gap-2 flex-1">
                <div className="flex gap-2">
                  <Input
                    placeholder="param_name"
                    value={param.name}
                    onChange={(e) => updateParameter(param.id, 'name', e.target.value)}
                    className="font-mono text-sm h-8"
                  />
                  <Select
                    value={param.type}
                    onValueChange={(v) => updateParameter(param.id, 'type', v)}
                  >
                    <SelectTrigger className="w-28 h-8">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="string">string</SelectItem>
                      <SelectItem value="number">number</SelectItem>
                      <SelectItem value="boolean">boolean</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Input
                  placeholder="Description of this parameter"
                  value={param.description}
                  onChange={(e) => updateParameter(param.id, 'description', e.target.value)}
                  className="text-sm h-8"
                />
                <div className="flex items-center gap-2">
                  <Switch
                    checked={param.required}
                    onCheckedChange={(v) => updateParameter(param.id, 'required', v)}
                    id={`required-${param.id}`}
                  />
                  <Label htmlFor={`required-${param.id}`} className="text-xs text-muted-foreground">
                    Required
                  </Label>
                </div>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => removeParameter(param.id)}
                className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// CREATE/EDIT TOOL DIALOG
// ============================================================================

function ToolDialog({
  open,
  onOpenChange,
  editTool,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editTool?: {
    id: string;
    name: string;
    description: string;
    code: string;
    inputSchema: Record<string, unknown>;
    version: number;
  } | null;
}) {
  const utils = trpc.useUtils();
  const isEditing = !!editTool;

  const [name, setName] = useState(editTool?.name ?? '');
  const [description, setDescription] = useState(editTool?.description ?? '');
  const [implementation, setImplementation] = useState(editTool?.code ?? '');
  const [parameters, setParameters] = useState<ToolParameter[]>(
    editTool ? parseJsonSchemaToParams(editTool.inputSchema) : []
  );

  const createTool = trpc.tools.create.useMutation({
    onSuccess: () => {
      utils.tools.list.invalidate();
      onOpenChange(false);
      resetForm();
    },
  });

  const updateTool = trpc.tools.update.useMutation({
    onSuccess: () => {
      utils.tools.list.invalidate();
      onOpenChange(false);
      resetForm();
    },
  });

  function resetForm() {
    setName('');
    setDescription('');
    setImplementation('');
    setParameters([]);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const inputSchema = buildJsonSchema(parameters);

    if (isEditing && editTool) {
      updateTool.mutate({
        id: editTool.id,
        version: editTool.version,
        name,
        description,
        code: implementation,
        inputSchema,
      });
    } else {
      createTool.mutate({
        name,
        description,
        inputSchema,
        code: implementation,
      });
    }
  }

  const isPending = createTool.isPending || updateTool.isPending;
  const error = createTool.error || updateTool.error;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{isEditing ? 'Edit Tool' : 'Create Tool'}</DialogTitle>
            <DialogDescription>
              {isEditing
                ? 'Update your custom tool configuration.'
                : 'Define a custom tool for your BaleyBots. The implementation can be natural language instructions or code that the AI will interpret.'}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="tool-name">Name</Label>
              <Input
                id="tool-name"
                placeholder="my_tool"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="font-mono"
                required
              />
              <p className="text-xs text-muted-foreground">
                Lowercase with underscores. This is how BaleyBots reference the tool.
              </p>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="tool-description">Description</Label>
              <Textarea
                id="tool-description"
                placeholder="Describe what this tool does..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                required
              />
            </div>

            <SchemaBuilder parameters={parameters} onChange={setParameters} />

            <div className="grid gap-2">
              <Label htmlFor="tool-implementation">Implementation</Label>
              <Textarea
                id="tool-implementation"
                placeholder="Describe what this tool should do when called, or write code that the AI will interpret..."
                className="font-mono text-sm min-h-[120px]"
                value={implementation}
                onChange={(e) => setImplementation(e.target.value)}
                required
              />
              <p className="text-xs text-muted-foreground">
                Natural language instructions or pseudocode. The AI interprets this when the tool is called.
              </p>
            </div>

            {error && (
              <p className="text-sm text-destructive">
                {error.message}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? (isEditing ? 'Saving...' : 'Creating...') : (isEditing ? 'Save Changes' : 'Create Tool')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// TOOL DETAIL PANEL
// ============================================================================

function ToolDetailPanel({
  tool,
  open,
  onClose,
  onEdit,
  onDelete,
}: {
  tool: {
    id: string;
    name: string;
    description: string;
    code: string;
    inputSchema: unknown;
    isGenerated: boolean | null;
    createdAt: Date;
    version: number;
  } | null;
  open: boolean;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const schema = ((tool?.inputSchema) || {}) as Record<string, unknown>;
  const properties = (schema.properties || {}) as Record<string, Record<string, unknown>>;
  const required = (schema.required || []) as string[];
  const hasParams = Object.keys(properties).length > 0;

  return (
    <SlidePanel
      open={open}
      onOpenChange={(isOpen) => { if (!isOpen) onClose(); }}
      title={tool?.name ?? ''}
      description={tool?.isGenerated ? 'Auto-generated tool' : 'Custom workspace tool'}
      footer={
        <SlidePanelFooter>
          <Button variant="outline" size="sm" onClick={onEdit}>
            <Pencil className="h-4 w-4 mr-1.5" />
            Edit
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={onDelete}
            className="text-destructive hover:text-destructive"
          >
            <Trash2 className="h-4 w-4 mr-1.5" />
            Delete
          </Button>
        </SlidePanelFooter>
      }
    >
      {tool && (
      <div className="space-y-6">
            {/* Description */}
            <div>
              <h3 className="text-sm font-medium text-muted-foreground mb-1">Description</h3>
              <p className="text-sm">{tool.description}</p>
            </div>

            {/* Parameters */}
            <div>
              <h3 className="text-sm font-medium text-muted-foreground mb-2">Input Parameters</h3>
              {hasParams ? (
                <div className="space-y-2">
                  {Object.entries(properties).map(([name, def]) => (
                    <div key={name} className="flex items-start gap-2 rounded-md border p-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <code className="text-sm font-mono font-semibold">{name}</code>
                          <Badge variant="outline" className="text-xs">
                            {def.type as string}
                          </Badge>
                          {required.includes(name) && (
                            <Badge variant="destructive" className="text-xs">required</Badge>
                          )}
                        </div>
                        {typeof def.description === 'string' && (
                          <p className="text-xs text-muted-foreground mt-1">
                            {def.description}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No parameters defined.</p>
              )}
            </div>

            {/* Implementation */}
            <div>
              <h3 className="text-sm font-medium text-muted-foreground mb-2">Implementation</h3>
              <pre className="rounded-md bg-muted p-4 text-sm font-mono overflow-x-auto whitespace-pre-wrap">
                {tool.code}
              </pre>
            </div>

            {/* Metadata */}
            <div className="text-xs text-muted-foreground space-y-1">
              <p>Created: {formatDate(tool.createdAt)}</p>
              <p>Version: {tool.version}</p>
            </div>

            {/* Usage hint */}
            <div className="rounded-md border border-dashed p-3">
              <p className="text-xs text-muted-foreground">
                <strong>Usage in BAL:</strong> Add <code className="font-mono">&quot;{tool.name}&quot;</code> to your BaleyBot&apos;s <code className="font-mono">&quot;tools&quot;</code> array.
              </p>
            </div>
      </div>
      )}
    </SlidePanel>
  );
}

// ============================================================================
// MAIN PAGE
// ============================================================================

export default function ToolsPage() {
  const { data: tools, isLoading } = trpc.tools.list.useQuery();
  const { data: connectionsList } = trpc.connections.list.useQuery();
  const utils = trpc.useUtils();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editTool, setEditTool] = useState<{
    id: string;
    name: string;
    description: string;
    code: string;
    inputSchema: Record<string, unknown>;
    version: number;
  } | null>(null);
  const [selectedTool, setSelectedTool] = useState<typeof tools extends (infer T)[] | undefined ? T | null : null>(null);
  const [deleteToolId, setDeleteToolId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('all');

  const deleteTool = trpc.tools.delete.useMutation({
    onSuccess: () => {
      utils.tools.list.invalidate();
      setDeleteToolId(null);
      setSelectedTool(null);
    },
  });

  // Filter connection tools (active database connections)
  const databaseConnections = connectionsList?.filter(
    (c) => (c.type === 'postgres' || c.type === 'mysql') && c.status === 'connected'
  ) ?? [];

  // Count by category
  const customToolCount = tools?.length ?? 0;
  const builtInCount = BUILT_IN_TOOLS.length;
  const connectionToolCount = databaseConnections.length;

  function handleEditTool(tool: NonNullable<typeof selectedTool>) {
    setEditTool({
      id: tool.id,
      name: tool.name,
      description: tool.description,
      code: tool.code,
      inputSchema: (tool.inputSchema || {}) as Record<string, unknown>,
      version: tool.version,
    });
    setDialogOpen(true);
    setSelectedTool(null);
  }

  function handleDeleteTool(toolId: string) {
    setDeleteToolId(toolId);
    setSelectedTool(null);
  }

  return (
    <div className="container py-10">
      <div className="flex flex-col gap-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Tools</h1>
            <p className="text-muted-foreground">
              Manage tools available to your BaleyBots
            </p>
          </div>
          <Button onClick={() => { setEditTool(null); setDialogOpen(true); }}>
            <Plus className="h-4 w-4 mr-2" />
            Create Tool
          </Button>
        </div>

        {/* Tab navigation */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="all">
              All ({builtInCount + customToolCount + connectionToolCount})
            </TabsTrigger>
            <TabsTrigger value="built-in">
              Built-in ({builtInCount})
            </TabsTrigger>
            <TabsTrigger value="custom">
              Custom ({customToolCount})
            </TabsTrigger>
            {connectionToolCount > 0 && (
              <TabsTrigger value="connection">
                Database ({connectionToolCount})
              </TabsTrigger>
            )}
          </TabsList>

          {/* All tools tab */}
          <TabsContent value="all" className="mt-4 space-y-6">
            {/* Built-in tools section */}
            <div>
              <h2 className="text-lg font-semibold mb-3">Built-in Tools</h2>
              <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                {BUILT_IN_TOOLS.map((tool) => (
                  <BuiltInToolCard key={tool.name} tool={tool} />
                ))}
              </div>
            </div>

            {/* Connection tools section */}
            {databaseConnections.length > 0 && (
              <div>
                <h2 className="text-lg font-semibold mb-3">Database Tools</h2>
                <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                  {databaseConnections.map((conn) => (
                    <ConnectionToolCard key={conn.id} connection={conn} />
                  ))}
                </div>
              </div>
            )}

            {/* Custom tools section */}
            <div>
              <h2 className="text-lg font-semibold mb-3">Custom Tools</h2>
              {isLoading ? (
                <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                  {[1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-36" />
                  ))}
                </div>
              ) : tools && tools.length > 0 ? (
                <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                  {tools.map((tool) => (
                    <CustomToolCard
                      key={tool.id}
                      tool={tool}
                      onClick={() => setSelectedTool(tool)}
                    />
                  ))}
                </div>
              ) : (
                <EmptyState
                  icon={Wrench}
                  title="No custom tools"
                  description="Create tools to extend what your BaleyBots can do."
                />
              )}
            </div>
          </TabsContent>

          {/* Built-in tools tab */}
          <TabsContent value="built-in" className="mt-4">
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              {BUILT_IN_TOOLS.map((tool) => (
                <BuiltInToolCard key={tool.name} tool={tool} />
              ))}
            </div>
          </TabsContent>

          {/* Custom tools tab */}
          <TabsContent value="custom" className="mt-4">
            {isLoading ? (
              <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                {[1, 2, 3, 4, 5, 6].map((i) => (
                  <Skeleton key={i} className="h-36" />
                ))}
              </div>
            ) : tools && tools.length > 0 ? (
              <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                {tools.map((tool) => (
                  <CustomToolCard
                    key={tool.id}
                    tool={tool}
                    onClick={() => setSelectedTool(tool)}
                  />
                ))}
              </div>
            ) : (
              <EmptyState
                icon={Wrench}
                title="No custom tools"
                description="Create tools to extend what your BaleyBots can do."
              />
            )}
          </TabsContent>

          {/* Connection tools tab */}
          {connectionToolCount > 0 && (
            <TabsContent value="connection" className="mt-4">
              <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                {databaseConnections.map((conn) => (
                  <ConnectionToolCard key={conn.id} connection={conn} />
                ))}
              </div>
            </TabsContent>
          )}
        </Tabs>
      </div>

      {/* Create/Edit Dialog */}
      <ToolDialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) setEditTool(null);
        }}
        editTool={editTool}
      />

      {/* Detail Panel */}
      <ToolDetailPanel
        tool={selectedTool}
        open={!!selectedTool}
        onClose={() => setSelectedTool(null)}
        onEdit={() => selectedTool && handleEditTool(selectedTool)}
        onDelete={() => selectedTool && handleDeleteTool(selectedTool.id)}
      />

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteToolId} onOpenChange={() => setDeleteToolId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Tool</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this tool? BaleyBots that reference it will no longer have access to it. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteToolId && deleteTool.mutate({ id: deleteToolId })}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteTool.isPending ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ============================================================================
// CARD COMPONENTS
// ============================================================================

function BuiltInToolCard({ tool }: { tool: BuiltInToolInfo }) {
  return (
    <Card className="relative">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Wrench className="h-4 w-4 text-muted-foreground shrink-0" />
            <CardTitle className="truncate text-sm font-mono">
              {tool.name}
            </CardTitle>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {tool.approvalRequired ? (
              <Badge variant="outline" className="text-xs gap-1">
                <Shield className="h-3 w-3" />
                Approval
              </Badge>
            ) : (
              <Badge variant="secondary" className="text-xs gap-1">
                <ShieldCheck className="h-3 w-3" />
                Auto
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="pb-3">
        <p className="text-xs text-muted-foreground line-clamp-2 mb-2">
          {tool.description}
        </p>
        <Badge variant="outline" className={`text-xs ${getCategoryColor(tool.category)}`}>
          {tool.category}
        </Badge>
      </CardContent>
    </Card>
  );
}

function ConnectionToolCard({ connection }: { connection: { id: string; type: string; name: string; status: string | null } }) {
  const toolName = `query_${connection.name.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;

  return (
    <Card className="relative">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Database className="h-4 w-4 text-teal-600 shrink-0" />
            <CardTitle className="truncate text-sm font-mono">
              {toolName}
            </CardTitle>
          </div>
          <Badge variant="secondary" className="text-xs shrink-0">
            {connection.type === 'postgres' ? 'PostgreSQL' : 'MySQL'}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="pb-3">
        <p className="text-xs text-muted-foreground line-clamp-2 mb-2">
          Query the &quot;{connection.name}&quot; database using natural language. The AI translates your request to SQL.
        </p>
        <Badge variant="outline" className={`text-xs ${getCategoryColor('database')}`}>
          database
        </Badge>
      </CardContent>
    </Card>
  );
}

function CustomToolCard({
  tool,
  onClick,
}: {
  tool: {
    id: string;
    name: string;
    description: string;
    isGenerated: boolean | null;
    createdAt: Date;
  };
  onClick: () => void;
}) {
  return (
    <Card
      variant="interactive"
      className="cursor-pointer transition-colors hover:border-primary/50"
      onClick={onClick}
    >
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Cog className="h-4 w-4 text-muted-foreground shrink-0" />
            <CardTitle className="truncate text-sm font-mono">
              {tool.name}
            </CardTitle>
          </div>
          {tool.isGenerated && (
            <Badge variant="secondary" className="shrink-0 text-xs">
              Generated
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="pb-3">
        <p className="text-xs text-muted-foreground line-clamp-2 mb-2">
          {tool.description}
        </p>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Calendar className="h-3 w-3" />
          <span>{formatDate(tool.createdAt)}</span>
        </div>
      </CardContent>
    </Card>
  );
}
