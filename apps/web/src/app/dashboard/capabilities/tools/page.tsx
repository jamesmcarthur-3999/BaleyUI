'use client';

import { useState } from 'react';
import { trpc } from '@/lib/trpc/client';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
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

import { Wrench, Plus, X, Search, Plug } from 'lucide-react';
import { BuiltInToolCard, CustomToolCard, ConnectionToolCard, MCPToolCard } from '@/components/capabilities/ToolCard';
import type { BuiltInToolInfo, MCPToolInfo } from '@/components/capabilities/ToolCard';
import { ToolDetailPanel } from '@/components/capabilities/ToolDetailPanel';

// ============================================================================
// BUILT-IN TOOLS DATA (static, matches BUILT_IN_TOOLS_METADATA)
// ============================================================================

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
      <DialogContent>
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
// MAIN PAGE
// ============================================================================

export default function CapabilityToolsPage() {
  const { data: tools, isLoading } = trpc.tools.list.useQuery();
  const { data: connectionsList } = trpc.connections.list.useQuery();
  const { data: usageStats } = trpc.tools.getUsageStats.useQuery();
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
  const [searchQuery, setSearchQuery] = useState('');

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

  // Filter MCP connections and build MCP tool list
  const mcpConnections = connectionsList?.filter(
    (c) => c.type === 'mcp' && c.status === 'connected'
  ) ?? [];

  const mcpTools: MCPToolInfo[] = mcpConnections.flatMap((conn) => {
    const config = conn.config as Record<string, unknown> | null;
    const discoveredTools = (config?.discoveredTools ?? []) as string[];
    const toolPrefix = (config?.toolPrefix ?? '') as string;
    return discoveredTools.map((toolName) => ({
      name: toolName,
      connectionName: conn.name,
      connectionId: conn.id,
      toolPrefix,
    }));
  });

  // Search filter
  const query = searchQuery.toLowerCase();
  const filteredBuiltIn = BUILT_IN_TOOLS.filter(
    (t) => !query || t.name.includes(query) || t.description.toLowerCase().includes(query)
  );
  const filteredCustom = tools?.filter(
    (t) => !query || t.name.toLowerCase().includes(query) || t.description.toLowerCase().includes(query)
  );
  const filteredConnections = databaseConnections.filter(
    (c) => !query || c.name.toLowerCase().includes(query) || c.type.includes(query)
  );
  const filteredMCP = mcpTools.filter(
    (t) => !query || t.name.toLowerCase().includes(query) || t.connectionName.toLowerCase().includes(query)
  );

  // Count by category
  const customToolCount = filteredCustom?.length ?? 0;
  const builtInCount = filteredBuiltIn.length;
  const connectionToolCount = filteredConnections.length;
  const mcpToolCount = filteredMCP.length;

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
    <div className="flex flex-col gap-6">
      {/* Action bar */}
      <div className="flex items-center gap-4">
        <p className="text-sm text-muted-foreground shrink-0">
          Extend what your BaleyBots can do
        </p>
        <div className="relative flex-1 max-w-xs ml-auto">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search tools..."
            className="pl-9"
          />
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
            All ({builtInCount + customToolCount + connectionToolCount + mcpToolCount})
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
          {mcpToolCount > 0 && (
            <TabsTrigger value="mcp">
              MCP ({mcpToolCount})
            </TabsTrigger>
          )}
        </TabsList>

        {/* All tools tab */}
        <TabsContent value="all" className="mt-4 space-y-6">
          {/* Built-in tools section */}
          <div>
            <h2 className="text-lg font-semibold mb-3">Built-in Tools</h2>
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              {filteredBuiltIn.map((tool) => (
                <BuiltInToolCard key={tool.name} tool={tool} usedByCount={usageStats?.[tool.name]?.count} />
              ))}
            </div>
          </div>

          {/* Connection tools section */}
          {filteredConnections.length > 0 && (
            <div>
              <h2 className="text-lg font-semibold mb-3">Database Tools</h2>
              <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                {filteredConnections.map((conn) => (
                  <ConnectionToolCard key={conn.id} connection={conn} />
                ))}
              </div>
            </div>
          )}

          {/* MCP tools section */}
          {filteredMCP.length > 0 && (
            <div>
              <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
                <Plug className="h-5 w-5" />
                MCP Tools
              </h2>
              <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                {filteredMCP.map((tool) => (
                  <MCPToolCard key={`${tool.connectionId}-${tool.name}`} tool={tool} />
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
            ) : filteredCustom && filteredCustom.length > 0 ? (
              <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                {filteredCustom.map((tool) => (
                  <CustomToolCard
                    key={tool.id}
                    tool={tool}
                    onClick={() => setSelectedTool(tool)}
                    usedByCount={usageStats?.[tool.name]?.count}
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
              {filteredConnections.map((conn) => (
                <ConnectionToolCard key={conn.id} connection={conn} />
              ))}
            </div>
          </TabsContent>
        )}

        {/* MCP tools tab */}
        {mcpToolCount > 0 && (
          <TabsContent value="mcp" className="mt-4">
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              {filteredMCP.map((tool) => (
                <MCPToolCard key={`${tool.connectionId}-${tool.name}`} tool={tool} />
              ))}
            </div>
          </TabsContent>
        )}
      </Tabs>

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
        usageStats={selectedTool ? usageStats?.[selectedTool.name] : undefined}
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

