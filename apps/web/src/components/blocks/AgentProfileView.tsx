/**
 * Agent Profile View
 *
 * A "character sheet" style view for single AI agents. Shows goal, tools,
 * constraints, output schema, and model selection in a clean, focused layout.
 * This is the default view for single agents (not compositions).
 */

'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  Bot,
  Target,
  Wrench,
  Shield,
  FileJson,
  Cpu,
  Play,
  Pencil,
  Plus,
  Check,
  X,
  Loader2,
  ChevronDown,
} from 'lucide-react';
import { trpc } from '@/lib/trpc/client';
import type { Block, Tool } from '@baleyui/db';

// ============================================================================
// TYPES
// ============================================================================

interface BlockWithTools extends Block {
  tools: Tool[];
}

interface AgentProfileViewProps {
  block: BlockWithTools;
  onRun?: () => void;
  onUpdate?: (changes: Partial<Block>) => Promise<void>;
  isUpdating?: boolean;
}

// ============================================================================
// COMPONENT
// ============================================================================

export function AgentProfileView({
  block,
  onRun,
  onUpdate,
  isUpdating = false,
}: AgentProfileViewProps) {
  const [isEditingGoal, setIsEditingGoal] = useState(false);
  const [goalDraft, setGoalDraft] = useState(block.goal || '');
  const [isEditingConstraints, setIsEditingConstraints] = useState(false);
  const [constraintsDraft, setConstraintsDraft] = useState(
    block.systemPrompt || ''
  );
  const [isSchemaOpen, setIsSchemaOpen] = useState(false);
  const [isModelOpen, setIsModelOpen] = useState(false);

  const { data: connections } = trpc.connections.list.useQuery();

  // Update drafts when block changes
  useEffect(() => {
    setGoalDraft(block.goal || '');
    setConstraintsDraft(block.systemPrompt || '');
  }, [block.goal, block.systemPrompt]);

  const handleSaveGoal = async () => {
    if (onUpdate) {
      await onUpdate({ goal: goalDraft });
    }
    setIsEditingGoal(false);
  };

  const handleSaveConstraints = async () => {
    if (onUpdate) {
      await onUpdate({ systemPrompt: constraintsDraft });
    }
    setIsEditingConstraints(false);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
            <Bot className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">{block.name}</h1>
            <p className="text-muted-foreground">
              {block.description || 'AI Agent'}
            </p>
          </div>
        </div>
        <Button onClick={onRun} disabled={isUpdating} size="lg">
          {isUpdating ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Play className="h-4 w-4 mr-2" />
          )}
          Run
        </Button>
      </div>

      {/* Goal Section */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Target className="h-5 w-5 text-primary" />
              <CardTitle>Goal</CardTitle>
            </div>
            {!isEditingGoal && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsEditingGoal(true)}
              >
                <Pencil className="h-4 w-4" />
              </Button>
            )}
          </div>
          <CardDescription>
            What this agent is trying to accomplish
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isEditingGoal ? (
            <div className="space-y-3">
              <Textarea
                value={goalDraft}
                onChange={(e) => setGoalDraft(e.target.value)}
                placeholder="Describe what this agent should accomplish..."
                rows={4}
              />
              <div className="flex gap-2">
                <Button size="sm" onClick={handleSaveGoal} disabled={isUpdating}>
                  <Check className="h-4 w-4 mr-1" />
                  Save
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setGoalDraft(block.goal || '');
                    setIsEditingGoal(false);
                  }}
                >
                  <X className="h-4 w-4 mr-1" />
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <p className="text-sm leading-relaxed">
              {block.goal || (
                <span className="text-muted-foreground italic">
                  No goal defined. Click edit to add one.
                </span>
              )}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Tools Section */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Wrench className="h-5 w-5 text-primary" />
              <CardTitle>Tools</CardTitle>
            </div>
            <Button variant="ghost" size="sm">
              <Plus className="h-4 w-4 mr-1" />
              Add Tool
            </Button>
          </div>
          <CardDescription>
            Capabilities available to this agent
          </CardDescription>
        </CardHeader>
        <CardContent>
          {block.tools && block.tools.length > 0 ? (
            <div className="space-y-2">
              {block.tools.map((tool) => (
                <div
                  key={tool.id}
                  className="flex items-center gap-3 p-3 rounded-lg border bg-muted/30"
                >
                  <div className="flex h-8 w-8 items-center justify-center rounded bg-primary/10">
                    <Wrench className="h-4 w-4 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm">{tool.name}</div>
                    <div className="text-xs text-muted-foreground truncate">
                      {tool.description || 'No description'}
                    </div>
                  </div>
                  <Badge variant="outline" className="text-xs">
                    {tool.isGenerated ? 'Generated' : 'Custom'}
                  </Badge>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-6 text-muted-foreground">
              <Wrench className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">No tools configured</p>
              <p className="text-xs mt-1">
                Add tools to extend this agent&apos;s capabilities
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Constraints Section */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-primary" />
              <CardTitle>Constraints</CardTitle>
            </div>
            {!isEditingConstraints && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsEditingConstraints(true)}
              >
                <Pencil className="h-4 w-4" />
              </Button>
            )}
          </div>
          <CardDescription>
            Rules and limitations for the agent
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isEditingConstraints ? (
            <div className="space-y-3">
              <Textarea
                value={constraintsDraft}
                onChange={(e) => setConstraintsDraft(e.target.value)}
                placeholder="Add constraints like: Max 1000 records, No PII access, Complete in 60s..."
                rows={4}
              />
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={handleSaveConstraints}
                  disabled={isUpdating}
                >
                  <Check className="h-4 w-4 mr-1" />
                  Save
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setConstraintsDraft(block.systemPrompt || '');
                    setIsEditingConstraints(false);
                  }}
                >
                  <X className="h-4 w-4 mr-1" />
                  Cancel
                </Button>
              </div>
            </div>
          ) : block.systemPrompt ? (
            <ul className="space-y-2">
              {block.systemPrompt.split('\n').filter(Boolean).map((constraint, i) => (
                <li key={i} className="flex items-start gap-2 text-sm">
                  <span className="text-muted-foreground">•</span>
                  <span>{constraint}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground italic">
              No constraints defined. Click edit to add some.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Output Schema Collapsible */}
      <Collapsible open={isSchemaOpen} onOpenChange={setIsSchemaOpen}>
        <Card>
          <CollapsibleTrigger asChild>
            <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FileJson className="h-5 w-5 text-primary" />
                  <CardTitle>Output Schema</CardTitle>
                </div>
                <ChevronDown
                  className={`h-4 w-4 transition-transform ${
                    isSchemaOpen ? 'rotate-180' : ''
                  }`}
                />
              </div>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent>
              <pre className="text-xs font-mono bg-muted p-4 rounded-lg overflow-x-auto">
                {JSON.stringify(block.outputSchema || {}, null, 2)}
              </pre>
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      {/* Model Configuration Collapsible */}
      <Collapsible open={isModelOpen} onOpenChange={setIsModelOpen}>
        <Card>
          <CollapsibleTrigger asChild>
            <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Cpu className="h-5 w-5 text-primary" />
                  <CardTitle>Model Configuration</CardTitle>
                  {block.model && (
                    <Badge variant="secondary" className="ml-2">
                      {block.model}
                    </Badge>
                  )}
                </div>
                <ChevronDown
                  className={`h-4 w-4 transition-transform ${
                    isModelOpen ? 'rotate-180' : ''
                  }`}
                />
              </div>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Connection</Label>
                  <Select
                    value={block.connectionId || ''}
                    onValueChange={(value) => onUpdate?.({ connectionId: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select connection" />
                    </SelectTrigger>
                    <SelectContent>
                      {connections?.map((conn) => (
                        <SelectItem key={conn.id} value={conn.id}>
                          {conn.name} ({conn.type})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Model</Label>
                  <Input
                    value={block.model || ''}
                    onChange={(e) => onUpdate?.({ model: e.target.value })}
                    placeholder="e.g., claude-3-5-sonnet"
                  />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Temperature</Label>
                  <Input
                    type="number"
                    min="0"
                    max="2"
                    step="0.1"
                    value={block.temperature || '0.7'}
                    onChange={(e) =>
                      onUpdate?.({ temperature: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label>Max Tokens</Label>
                  <Input
                    type="number"
                    min="1"
                    value={block.maxTokens || 1000}
                    onChange={(e) =>
                      onUpdate?.({ maxTokens: parseInt(e.target.value) })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label>Max Tool Iterations</Label>
                  <Input
                    type="number"
                    min="1"
                    max="100"
                    value={block.maxToolIterations || 25}
                    onChange={(e) =>
                      onUpdate?.({
                        maxToolIterations: parseInt(e.target.value),
                      })
                    }
                  />
                </div>
              </div>
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      {/* Quick Stats Footer */}
      <div className="flex items-center justify-between text-sm text-muted-foreground border-t pt-4">
        <div className="flex items-center gap-4">
          <span>
            Executions: <strong>{block.executionCount || 0}</strong>
          </span>
          {block.avgLatencyMs && (
            <span>
              Avg Latency: <strong>{block.avgLatencyMs}ms</strong>
            </span>
          )}
        </div>
        <div>
          Last executed:{' '}
          {block.lastExecutedAt
            ? new Date(block.lastExecutedAt).toLocaleDateString()
            : 'Never'}
        </div>
      </div>
    </div>
  );
}
