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
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useState } from 'react';

interface PostgresFormProps {
  form: UseFormReturn<any>;
}

export function PostgresForm({ form }: PostgresFormProps) {
  const [inputMode, setInputMode] = useState<'fields' | 'url'>('fields');

  return (
    <div className="space-y-4">
      <FormField
        control={form.control}
        name="name"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Connection Name</FormLabel>
            <FormControl>
              <Input placeholder="My PostgreSQL Database" {...field} />
            </FormControl>
            <FormDescription>
              A friendly name to identify this connection
            </FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />

      <Tabs value={inputMode} onValueChange={(v) => setInputMode(v as 'fields' | 'url')}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="fields">Individual Fields</TabsTrigger>
          <TabsTrigger value="url">Connection URL</TabsTrigger>
        </TabsList>

        <TabsContent value="fields" className="space-y-4 mt-4">
          <div className="grid grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="config.host"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Host</FormLabel>
                  <FormControl>
                    <Input placeholder="localhost" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="config.port"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Port</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      placeholder="5432"
                      {...field}
                      onChange={(e) => field.onChange(parseInt(e.target.value) || 5432)}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <FormField
            control={form.control}
            name="config.database"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Database</FormLabel>
                <FormControl>
                  <Input placeholder="mydb" {...field} />
                </FormControl>
                <FormDescription>
                  Name of the database to connect to
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="config.username"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Username</FormLabel>
                <FormControl>
                  <Input placeholder="postgres" {...field} autoComplete="off" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="config.password"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Password</FormLabel>
                <FormControl>
                  <Input
                    type="password"
                    placeholder="••••••••"
                    {...field}
                    autoComplete="new-password"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </TabsContent>

        <TabsContent value="url" className="space-y-4 mt-4">
          <FormField
            control={form.control}
            name="config.connectionUrl"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Connection URL</FormLabel>
                <FormControl>
                  <Input
                    type="password"
                    placeholder="postgresql://user:password@host:5432/database"
                    {...field}
                    autoComplete="off"
                  />
                </FormControl>
                <FormDescription>
                  Full PostgreSQL connection URL. Credentials will be encrypted.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </TabsContent>
      </Tabs>

      <FormField
        control={form.control}
        name="config.ssl"
        render={({ field }) => (
          <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
            <div className="space-y-0.5">
              <FormLabel className="text-base">SSL Connection</FormLabel>
              <FormDescription>
                Enable SSL/TLS encryption for the connection
              </FormDescription>
            </div>
            <FormControl>
              <Switch
                checked={field.value}
                onCheckedChange={field.onChange}
              />
            </FormControl>
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name="config.schema"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Schema (Optional)</FormLabel>
            <FormControl>
              <Input placeholder="public" {...field} />
            </FormControl>
            <FormDescription>
              Default schema to use (defaults to &quot;public&quot;)
            </FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />
    </div>
  );
}
