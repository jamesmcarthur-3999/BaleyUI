'use client';

import { useState, useEffect } from 'react';
import { UseFormReturn } from 'react-hook-form';
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, RefreshCw, CheckCircle2, XCircle } from 'lucide-react';
import { listOllamaModels, formatBytes } from '@/lib/connections/ollama';
import type { OllamaModel } from '@/lib/connections/providers';

interface ConnectionFormValues {
  name: string;
  config: {
    apiKey?: string;
    baseUrl?: string;
    organization?: string;
    host?: string;
    port?: number;
    database?: string;
    username?: string;
    password?: string;
    connectionUrl?: string;
    ssl?: boolean;
    schema?: string;
  };
}

interface OllamaFormProps {
  form: UseFormReturn<ConnectionFormValues>;
}

export function OllamaForm({ form }: OllamaFormProps) {
  const [models, setModels] = useState<OllamaModel[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const baseUrl = form.watch('config.baseUrl') || 'http://localhost:11434';

  const fetchModels = async () => {
    setLoading(true);
    setError(null);

    try {
      const fetchedModels = await listOllamaModels(baseUrl);
      setModels(fetchedModels);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch models');
      setModels([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (baseUrl) {
      fetchModels();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-4">
      <FormField
        control={form.control}
        name="name"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Connection Name</FormLabel>
            <FormControl>
              <Input placeholder="My Ollama Connection" {...field} />
            </FormControl>
            <FormDescription>
              A friendly name to identify this connection
            </FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name="config.baseUrl"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Base URL</FormLabel>
            <FormControl>
              <Input
                type="url"
                placeholder="http://localhost:11434"
                {...field}
              />
            </FormControl>
            <FormDescription>
              Your local Ollama server URL. Install Ollama from{' '}
              <a
                href="https://ollama.ai"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                ollama.ai
              </a>
            </FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />

      {/* Available Models Section */}
      <div className="rounded-lg border p-4">
        <div className="mb-3 flex items-center justify-between">
          <h4 className="text-sm font-medium">Available Models</h4>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={fetchModels}
            disabled={loading}
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
          </Button>
        </div>

        {loading && (
          <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Loading models...
          </div>
        )}

        {error && (
          <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            <XCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
            <div>
              <p className="font-medium">Failed to connect</p>
              <p className="mt-1 text-xs">{error}</p>
            </div>
          </div>
        )}

        {!loading && !error && models.length === 0 && (
          <div className="py-8 text-center text-sm text-muted-foreground">
            No models found. Pull a model using <code className="text-xs">ollama pull</code>
          </div>
        )}

        {!loading && !error && models.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm text-green-600">
              <CheckCircle2 className="h-4 w-4" />
              <span>Found {models.length} local model{models.length !== 1 ? 's' : ''}</span>
            </div>
            <div className="max-h-48 space-y-2 overflow-y-auto">
              {models.map((model) => (
                <div
                  key={model.digest}
                  className="flex items-center justify-between rounded-md border p-2 text-sm"
                >
                  <div>
                    <p className="font-medium">{model.name}</p>
                    {model.details?.parameter_size && (
                      <p className="text-xs text-muted-foreground">
                        {model.details.parameter_size}
                      </p>
                    )}
                  </div>
                  <Badge variant="outline">{formatBytes(model.size)}</Badge>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
