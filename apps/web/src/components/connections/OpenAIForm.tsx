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
import type { ConnectionFormValues } from './types';

interface OpenAIFormProps {
  form: UseFormReturn<ConnectionFormValues>;
}

export function OpenAIForm({ form }: OpenAIFormProps) {
  return (
    <div className="space-y-4">
      <FormField
        control={form.control}
        name="name"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Connection Name</FormLabel>
            <FormControl>
              <Input placeholder="My OpenAI Connection" {...field} />
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
                placeholder="sk-..."
                {...field}
                autoComplete="off"
              />
            </FormControl>
            <FormDescription>
              Your OpenAI API key. Get one from{' '}
              <a
                href="https://platform.openai.com/api-keys"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                platform.openai.com
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
                placeholder="https://api.openai.com/v1"
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

      <FormField
        control={form.control}
        name="config.organization"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Organization ID (Optional)</FormLabel>
            <FormControl>
              <Input placeholder="org-..." {...field} />
            </FormControl>
            <FormDescription>
              For users belonging to multiple organizations
            </FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />
    </div>
  );
}
