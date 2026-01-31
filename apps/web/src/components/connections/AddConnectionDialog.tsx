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
import { PROVIDERS, type ProviderType } from '@/lib/connections/providers';
import { OpenAIForm } from './OpenAIForm';
import { AnthropicForm } from './AnthropicForm';
import { OllamaForm } from './OllamaForm';
import { TestConnectionButton } from './TestConnectionButton';
import { Plus } from 'lucide-react';

const connectionSchema = z.object({
  name: z.string().min(1, 'Name is required').max(255),
  config: z.object({
    apiKey: z.string().optional(),
    baseUrl: z.string().optional(),
    organization: z.string().optional(),
  }),
});

type ConnectionFormData = z.infer<typeof connectionSchema>;

export function AddConnectionDialog() {
  const [open, setOpen] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState<ProviderType>('openai');
  const { toast } = useToast();
  const utils = trpc.useUtils();

  const form = useForm<ConnectionFormData>({
    resolver: zodResolver(connectionSchema),
    defaultValues: {
      name: '',
      config: {
        apiKey: '',
        baseUrl: PROVIDERS[selectedProvider].defaultBaseUrl,
        organization: '',
      },
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

  const handleProviderChange = (provider: ProviderType) => {
    setSelectedProvider(provider);
    form.reset({
      name: '',
      config: {
        apiKey: '',
        baseUrl: PROVIDERS[provider].defaultBaseUrl,
        organization: '',
      },
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
      default:
        return null;
    }
  };

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
          <DialogTitle>Add AI Provider Connection</DialogTitle>
          <DialogDescription>
            Connect to an AI provider to use in your blocks and flows.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Provider Selection */}
          <div className="space-y-2">
            <Label>Provider <span className="text-destructive">*</span></Label>
            <Select
              value={selectedProvider}
              onValueChange={(value) => handleProviderChange(value as ProviderType)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(PROVIDERS).map(([key, provider]) => (
                  <SelectItem key={key} value={key}>
                    <div className="flex flex-col items-start">
                      <span className="font-medium">{provider.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {provider.description}
                      </span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Provider-Specific Form */}
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              {renderProviderForm()}

              {/* Test Connection */}
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
