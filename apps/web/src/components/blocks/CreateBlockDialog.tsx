'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
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
import { useToast } from '@/components/ui/use-toast';
import { trpc } from '@/lib/trpc/client';
import { Plus, Sparkles, Code, ChevronDown, Settings } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { ROUTES } from '@/lib/routes';

const blockSchema = z.object({
  goal: z.string().min(1, 'Please describe what this block should do'),
  type: z.enum(['ai', 'function']),
  name: z.string().optional(),
  connectionId: z.string().uuid().optional(),
  model: z.string().optional(),
});

type BlockFormData = z.infer<typeof blockSchema>;

interface CreateBlockDialogProps {
  variant?: 'button' | 'card';
}

// Generate a name from the goal
function generateNameFromGoal(goal: string): string {
  if (!goal) return '';
  // Take first few words, capitalize, limit length
  const words = goal.trim().split(/\s+/).slice(0, 4);
  const name = words
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
  return name.length > 50 ? name.slice(0, 47) + '...' : name;
}

export function CreateBlockDialog({ variant = 'button' }: CreateBlockDialogProps) {
  const [open, setOpen] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const { toast } = useToast();
  const utils = trpc.useUtils();
  const router = useRouter();

  const form = useForm<BlockFormData>({
    resolver: zodResolver(blockSchema),
    defaultValues: {
      goal: '',
      type: 'ai',
      name: '',
    },
  });

  const blockType = form.watch('type');
  const goal = form.watch('goal');

  // Fetch connections for AI blocks
  const { data: connections } = trpc.connections.list.useQuery(undefined, {
    enabled: blockType === 'ai',
  });

  // Find default connection
  const defaultConnection = connections?.find(c => c.isDefault) || connections?.[0];

  const createMutation = trpc.blocks.create.useMutation({
    onSuccess: (data) => {
      toast({
        title: 'Block Created',
        description: 'Opening editor...',
      });
      utils.blocks.list.invalidate();
      setOpen(false);
      form.reset();
      // Navigate to the block editor
      if (data?.id) {
        router.push(ROUTES.blocks.detail(data.id));
      }
    },
    onError: (error) => {
      toast({
        title: 'Failed to Create Block',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const onSubmit = (data: BlockFormData) => {
    // Auto-generate name if not provided
    const name = data.name?.trim() || generateNameFromGoal(data.goal);

    // Use default connection if not specified
    const connectionId = data.connectionId || defaultConnection?.id;

    // Use a sensible default model
    let model = data.model;
    if (!model && connectionId && connections) {
      const connection = connections.find(c => c.id === connectionId);
      if (connection) {
        model = connection.type === 'openai' ? 'gpt-4o-mini'
              : connection.type === 'anthropic' ? 'claude-3-5-sonnet-20241022'
              : connection.type === 'ollama' && Array.isArray(connection.availableModels)
                ? (connection.availableModels[0] as string)
                : undefined;
      }
    }

    createMutation.mutate({
      name,
      type: data.type,
      description: data.goal, // Use goal as description
      connectionId,
      model,
    });
  };

  const handleTypeChange = (type: 'ai' | 'function') => {
    form.setValue('type', type);
    if (type === 'function') {
      form.setValue('connectionId', undefined);
      form.setValue('model', undefined);
    }
  };

  const renderTrigger = () => {
    if (variant === 'card') {
      return (
        <button className="rounded-lg border-2 border-dashed bg-muted/50 p-6 text-center transition-colors hover:bg-muted hover:border-primary">
          <div className="flex flex-col items-center gap-2">
            <div className="rounded-full bg-primary/10 p-3">
              <Plus className="h-6 w-6 text-primary" />
            </div>
            <h3 className="font-semibold">Create New Block</h3>
            <p className="text-sm text-muted-foreground">
              Add an AI or Function block
            </p>
          </div>
        </button>
      );
    }

    return (
      <Button>
        <Plus className="mr-2 h-4 w-4" />
        Create Block
      </Button>
    );
  };

  const getAvailableModels = (): string[] => {
    const selectedConnectionId = form.watch('connectionId') || defaultConnection?.id;
    if (!selectedConnectionId || !connections) return [];

    const connection = connections.find((c) => c.id === selectedConnectionId);
    if (!connection) return [];

    switch (connection.type) {
      case 'openai':
        return ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo'];
      case 'anthropic':
        return [
          'claude-opus-4-5',
          'claude-sonnet-4',
          'claude-3-5-sonnet-20241022',
          'claude-3-opus-20240229',
        ];
      case 'ollama':
        return Array.isArray(connection.availableModels) ? (connection.availableModels as string[]) : [];
      default:
        return [];
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{renderTrigger()}</DialogTrigger>
      <DialogContent className="max-w-lg glass elevation-3 border-border/50">
        <DialogHeader>
          <DialogTitle>Create New Block</DialogTitle>
          <DialogDescription>
            Describe what you want this block to do.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            {/* Block Type Selection - Simplified */}
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => handleTypeChange('ai')}
                className={`flex items-center gap-3 rounded-xl border-2 p-4 transition-all ${
                  blockType === 'ai'
                    ? 'border-block-ai/50 bg-block-ai/10'
                    : 'border-border hover:border-block-ai/30 hover:bg-block-ai/5'
                }`}
              >
                <Sparkles className="h-5 w-5 text-block-ai" />
                <div className="text-left">
                  <span className="font-medium text-sm">AI Block</span>
                  <p className="text-xs text-muted-foreground">Use natural language</p>
                </div>
              </button>

              <button
                type="button"
                onClick={() => handleTypeChange('function')}
                className={`flex items-center gap-3 rounded-xl border-2 p-4 transition-all ${
                  blockType === 'function'
                    ? 'border-block-function/50 bg-block-function/10'
                    : 'border-border hover:border-block-function/30 hover:bg-block-function/5'
                }`}
              >
                <Code className="h-5 w-5 text-block-function" />
                <div className="text-left">
                  <span className="font-medium text-sm">Code Block</span>
                  <p className="text-xs text-muted-foreground">Write TypeScript</p>
                </div>
              </button>
            </div>

            {/* Main Input - What should it do? */}
            <FormField
              control={form.control}
              name="goal"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>What should this block do? <span className="text-destructive">*</span></FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder={
                        blockType === 'ai'
                          ? "e.g., Summarize customer reviews and identify key themes"
                          : "e.g., Format order data and calculate totals"
                      }
                      className="min-h-[80px] resize-none"
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    {blockType === 'ai'
                      ? "Describe the task in plain language. This becomes the AI's instructions."
                      : "Describe what your code should accomplish."}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Auto-generated name preview */}
            {goal && (
              <div className="text-sm text-muted-foreground">
                Name: <span className="font-medium text-foreground">{generateNameFromGoal(goal)}</span>
              </div>
            )}

            {/* Connection indicator for AI blocks */}
            {blockType === 'ai' && defaultConnection && !showAdvanced && (
              <div className="text-sm text-muted-foreground bg-muted/50 rounded-lg px-3 py-2">
                Using: <span className="font-medium text-foreground">{defaultConnection.name}</span>
                {' '}&middot;{' '}
                <span className="text-foreground">
                  {defaultConnection.type === 'openai' ? 'GPT-4o-mini'
                    : defaultConnection.type === 'anthropic' ? 'Claude 3.5 Sonnet'
                    : 'Default model'}
                </span>
              </div>
            )}

            {/* No connection warning */}
            {blockType === 'ai' && !defaultConnection && connections?.length === 0 && (
              <div className="text-sm text-amber-600 bg-amber-50 dark:bg-amber-950/30 rounded-lg px-3 py-2">
                No AI providers connected yet. You can add one after creating the block.
              </div>
            )}

            {/* Advanced Options - Collapsed by default */}
            <Collapsible open={showAdvanced} onOpenChange={setShowAdvanced}>
              <CollapsibleTrigger asChild>
                <Button type="button" variant="ghost" size="sm" className="w-full justify-start gap-2">
                  <Settings className="h-4 w-4" />
                  Advanced Options
                  <ChevronDown className={`h-4 w-4 ml-auto transition-transform ${showAdvanced ? 'rotate-180' : ''}`} />
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="space-y-4 pt-4">
                {/* Custom Name */}
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Custom Name (Optional)</FormLabel>
                      <FormControl>
                        <Input placeholder={generateNameFromGoal(goal) || "Auto-generated from description"} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Connection selector for AI blocks */}
                {blockType === 'ai' && connections && connections.length > 0 && (
                  <>
                    <FormField
                      control={form.control}
                      name="connectionId"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>AI Provider</FormLabel>
                          <Select
                            onValueChange={field.onChange}
                            value={field.value || defaultConnection?.id}
                          >
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select a provider" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {connections.map((connection) => (
                                <SelectItem key={connection.id} value={connection.id}>
                                  {connection.name} ({connection.type})
                                  {connection.isDefault && ' ⭐'}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="model"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Model</FormLabel>
                          <Select
                            onValueChange={field.onChange}
                            value={field.value}
                          >
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Auto-select best model" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {getAvailableModels().map((model: string) => (
                                <SelectItem key={model} value={model}>
                                  {model}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </>
                )}
              </CollapsibleContent>
            </Collapsible>

            <DialogFooter className="pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending ? 'Creating...' : 'Create & Edit'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
