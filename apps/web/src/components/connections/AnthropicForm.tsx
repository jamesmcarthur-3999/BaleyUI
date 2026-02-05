'use client';

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

interface AnthropicFormProps {
  form: UseFormReturn<ConnectionFormValues>;
}

export function AnthropicForm({ form }: AnthropicFormProps) {
  return (
    <div className="space-y-4">
      <FormField
        control={form.control}
        name="name"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Connection Name</FormLabel>
            <FormControl>
              <Input placeholder="My Anthropic Connection" {...field} />
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
        name="config.apiKey"
        render={({ field }) => (
          <FormItem>
            <FormLabel>API Key</FormLabel>
            <FormControl>
              <Input
                type="password"
                placeholder="sk-ant-..."
                {...field}
                autoComplete="off"
              />
            </FormControl>
            <FormDescription>
              Your Anthropic API key. Get one from{' '}
              <a
                href="https://console.anthropic.com/settings/keys"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                console.anthropic.com
              </a>
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
            <FormLabel>Base URL (Optional)</FormLabel>
            <FormControl>
              <Input
                type="url"
                placeholder="https://api.anthropic.com/v1"
                {...field}
              />
            </FormControl>
            <FormDescription>
              Custom API endpoint (leave blank for default)
            </FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />
    </div>
  );
}
