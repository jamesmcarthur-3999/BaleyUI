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
import { Form } from '@/components/ui/form';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import { trpc } from '@/lib/trpc/client';
import { PROVIDERS, type ProviderType, isAIProvider } from '@/lib/connections/providers';
import { OpenAIForm } from './OpenAIForm';
import { AnthropicForm } from './AnthropicForm';
import { OllamaForm } from './OllamaForm';
import { PostgresForm } from './PostgresForm';
import { MySQLForm } from './MySQLForm';
import { TestConnectionButton } from './TestConnectionButton';
import { Plus, Database, Bot } from 'lucide-react';

const connectionSchema = z.object({
  name: z.string().min(1, 'Name is required').max(255),
  config: z.object({
    // AI provider fields
    apiKey: z.string().optional(),
    baseUrl: z.string().optional(),
    organization: z.string().optional(),
    // Database fields
    host: z.string().optional(),
    port: z.number().optional(),
    database: z.string().optional(),
    username: z.string().optional(),
    password: z.string().optional(),
    connectionUrl: z.string().optional(),
    ssl: z.boolean().optional(),
    schema: z.string().optional(),
  }),
});

type ConnectionFormData = z.infer<typeof connectionSchema>;
type ConnectionCategory = 'ai' | 'database';

const AI_PROVIDERS: ProviderType[] = ['openai', 'anthropic', 'ollama'];
const DATABASE_PROVIDERS: ProviderType[] = ['postgres', 'mysql'];

export function AddConnectionDialog() {
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<ConnectionCategory>('ai');
  const [selectedProvider, setSelectedProvider] = useState<ProviderType>('openai');
  const { toast } = useToast();
  const utils = trpc.useUtils();

  const getDefaultConfig = (provider: ProviderType) => {
    if (isAIProvider(provider)) {
      return {
        apiKey: '',
        baseUrl: PROVIDERS[provider].defaultBaseUrl,
        organization: '',
      };
    }
    // Database provider defaults
    return {
      host: 'localhost',
      port: provider === 'postgres' ? 5432 : 3306,
      database: '',
      username: provider === 'postgres' ? 'postgres' : 'root',
      password: '',
      ssl: false,
      schema: provider === 'postgres' ? 'public' : undefined,
    };
  };

  const form = useForm<ConnectionFormData>({
    resolver: zodResolver(connectionSchema),
    defaultValues: {
      name: '',
      config: getDefaultConfig(selectedProvider),
    },
  });

  const createMutation = trpc.connections.create.useMutation({
    onSuccess: () => {
      toast({
        title: 'Connection Created',
        description: 'Your connection has been saved successfully.',
      });
      utils.connections.list.invalidate();
      setOpen(false);
      form.reset();
    },
    onError: (error) => {
      toast({
        title: 'Failed to Create Connection',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const onSubmit = (data: ConnectionFormData) => {
    createMutation.mutate({
      type: selectedProvider,
      name: data.name,
      config: data.config,
    });
  };

  const handleCategoryChange = (newCategory: ConnectionCategory) => {
    setCategory(newCategory);
    const defaultProvider = newCategory === 'ai' ? 'openai' : 'postgres';
    setSelectedProvider(defaultProvider);
    form.reset({
      name: '',
      config: getDefaultConfig(defaultProvider),
    });
  };

  const handleProviderChange = (provider: ProviderType) => {
    setSelectedProvider(provider);
    form.reset({
      name: '',
      config: getDefaultConfig(provider),
    });
  };

  const renderProviderForm = () => {
    switch (selectedProvider) {
      case 'openai':
        return <OpenAIForm form={form} />;
      case 'anthropic':
        return <AnthropicForm form={form} />;
      case 'ollama':
        return <OllamaForm form={form} />;
      case 'postgres':
        return <PostgresForm form={form} />;
      case 'mysql':
        return <MySQLForm form={form} />;
      default:
        return null;
    }
  };

  const availableProviders = category === 'ai' ? AI_PROVIDERS : DATABASE_PROVIDERS;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          Add Connection
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add Connection</DialogTitle>
          <DialogDescription>
            Connect to an AI provider or database to use in your BaleyBots.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Category Selection */}
          <div className="flex gap-2">
            <Button
              type="button"
              variant={category === 'ai' ? 'default' : 'outline'}
              className="flex-1"
              onClick={() => handleCategoryChange('ai')}
            >
              <Bot className="mr-2 h-4 w-4" />
              AI Provider
            </Button>
            <Button
              type="button"
              variant={category === 'database' ? 'default' : 'outline'}
              className="flex-1"
              onClick={() => handleCategoryChange('database')}
            >
              <Database className="mr-2 h-4 w-4" />
              Database
            </Button>
          </div>

          {/* Provider Selection */}
          <div className="space-y-2">
            <Label>
              {category === 'ai' ? 'AI Provider' : 'Database Type'}{' '}
              <span className="text-destructive">*</span>
            </Label>
            <Select
              value={selectedProvider}
              onValueChange={(value) => handleProviderChange(value as ProviderType)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {availableProviders.map((key) => {
                  const provider = PROVIDERS[key];
                  return (
                    <SelectItem key={key} value={key}>
                      <div className="flex flex-col items-start">
                        <span className="font-medium">{provider.name}</span>
                        <span className="text-xs text-muted-foreground">
                          {provider.description}
                        </span>
                      </div>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>

          {/* Provider-Specific Form */}
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              {renderProviderForm()}

              {/* Test Connection - works for all provider types */}
              <div className="border-t pt-4">
                <TestConnectionButton
                  type={selectedProvider}
                  config={form.watch('config')}
                />
              </div>

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setOpen(false)}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={createMutation.isPending}>
                  {createMutation.isPending ? 'Creating...' : 'Create Connection'}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </div>
      </DialogContent>
    </Dialog>
  );
}
