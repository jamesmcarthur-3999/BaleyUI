'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Slider } from '@/components/ui/slider';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ModelSelector } from './ModelSelector';
import { ToolSelector } from './ToolSelector';
import { trpc } from '@/lib/trpc/client';
import { Loader2 } from 'lucide-react';

interface AIBlockEditorProps {
  block: Record<string, unknown>;
  onChange: (data: Record<string, unknown>) => void;
}

export function AIBlockEditor({ block, onChange }: AIBlockEditorProps) {
  const [connectionId, setConnectionId] = useState<string | null>((block.connectionId as string) || null);
  const [model, setModel] = useState<string | null>((block.model as string) || null);
  const [goal, setGoal] = useState((block.goal as string) || '');
  const [systemPrompt, setSystemPrompt] = useState((block.systemPrompt as string) || '');
  const [temperature, setTemperature] = useState(
    block.temperature ? parseFloat(String(block.temperature)) : 0.7
  );
  const [maxTokens, setMaxTokens] = useState((block.maxTokens as number) || 1000);
  const [maxToolIterations, setMaxToolIterations] = useState((block.maxToolIterations as number) || 25);
  const [selectedToolIds, setSelectedToolIds] = useState<string[]>((block.toolIds as string[]) || []);
  const [inputSchema, setInputSchema] = useState(
    JSON.stringify(block.inputSchema || {}, null, 2)
  );
  const [outputSchema, setOutputSchema] = useState(
    JSON.stringify(block.outputSchema || {}, null, 2)
  );

  const { data: connections, isLoading: connectionsLoading } = trpc.connections.list.useQuery();

  // Fetch tools from the block (they're already included via getById)
  const tools = (Array.isArray(block.tools) ? block.tools : []) as Array<{
    id: string;
    name: string;
    description?: string | null;
    type?: string;
  }>;

  useEffect(() => {
    try {
      onChange({
        connectionId,
        model,
        goal,
        systemPrompt,
        temperature,
        maxTokens,
        maxToolIterations,
        toolIds: selectedToolIds,
        inputSchema: inputSchema ? JSON.parse(inputSchema) : {},
        outputSchema: outputSchema ? JSON.parse(outputSchema) : {},
      });
    } catch (error) {
      // Invalid JSON, don't update
      console.error('Invalid JSON schema:', error);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    connectionId,
    model,
    goal,
    systemPrompt,
    temperature,
    maxTokens,
    maxToolIterations,
    selectedToolIds,
    inputSchema,
    outputSchema,
  ]);

  return (
    <div className="space-y-6">
      {/* Connection and Model */}
      <Card>
        <CardHeader>
          <CardTitle>AI Configuration</CardTitle>
          <CardDescription>Configure the AI provider and model settings</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="connection">Connection</Label>
            {connectionsLoading ? (
              <div className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="text-sm text-muted-foreground">Loading connections...</span>
              </div>
            ) : (
              <Select
                value={connectionId || ''}
                onValueChange={(value) => {
                  setConnectionId(value);
                  setModel(null); // Reset model when connection changes
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a connection" />
                </SelectTrigger>
                <SelectContent>
                  {connections?.map((connection) => (
                    <SelectItem key={connection.id} value={connection.id}>
                      {connection.name} ({connection.type})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="model">Model</Label>
            <ModelSelector
              connectionId={connectionId}
              value={model}
              onChange={setModel}
            />
          </div>
        </CardContent>
      </Card>

      {/* Prompts */}
      <Card>
        <CardHeader>
          <CardTitle>Prompts</CardTitle>
          <CardDescription>Define the goal and system prompt for the AI</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="goal">Goal</Label>
            <Textarea
              id="goal"
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              placeholder="What should this block accomplish?"
              rows={4}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="systemPrompt">System Prompt</Label>
            <Textarea
              id="systemPrompt"
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              placeholder="System instructions for the AI (optional)"
              rows={6}
            />
          </div>
        </CardContent>
      </Card>

      {/* Model Parameters */}
      <Card>
        <CardHeader>
          <CardTitle>Model Parameters</CardTitle>
          <CardDescription>Fine-tune the model&apos;s behavior</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="temperature">Temperature</Label>
              <span className="text-sm text-muted-foreground">{temperature.toFixed(2)}</span>
            </div>
            <Slider
              id="temperature"
              min={0}
              max={2}
              step={0.01}
              value={[temperature]}
              onValueChange={(value) => setTemperature(value[0] ?? 0.7)}
            />
            <p className="text-xs text-muted-foreground">
              Lower values make output more focused and deterministic. Higher values increase randomness.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="maxTokens">Max Tokens</Label>
            <Input
              id="maxTokens"
              type="number"
              value={maxTokens}
              onChange={(e) => setMaxTokens(parseInt(e.target.value) || 0)}
              min={1}
              max={100000}
            />
            <p className="text-xs text-muted-foreground">
              Maximum number of tokens to generate in the response.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="maxToolIterations">Max Tool Iterations</Label>
            <Input
              id="maxToolIterations"
              type="number"
              value={maxToolIterations}
              onChange={(e) => setMaxToolIterations(parseInt(e.target.value) || 0)}
              min={1}
              max={100}
            />
            <p className="text-xs text-muted-foreground">
              Maximum number of tool call iterations before stopping.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Tools */}
      <ToolSelector
        tools={tools}
        selectedToolIds={selectedToolIds}
        onChange={setSelectedToolIds}
      />

      {/* Schemas */}
      <Card>
        <CardHeader>
          <CardTitle>Schemas</CardTitle>
          <CardDescription>Define input and output schemas (JSON)</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="inputSchema">Input Schema</Label>
            <Textarea
              id="inputSchema"
              value={inputSchema}
              onChange={(e) => setInputSchema(e.target.value)}
              placeholder='{"type": "object", "properties": {...}}'
              rows={8}
              className="font-mono text-xs"
            />
            <p className="text-xs text-muted-foreground">
              JSON schema defining the expected input format.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="outputSchema">Output Schema</Label>
            <Textarea
              id="outputSchema"
              value={outputSchema}
              onChange={(e) => setOutputSchema(e.target.value)}
              placeholder='{"type": "object", "properties": {...}}'
              rows={8}
              className="font-mono text-xs"
            />
            <p className="text-xs text-muted-foreground">
              JSON schema defining the expected output format.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
