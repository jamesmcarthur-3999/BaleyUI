'use client';

import { useState } from 'react';
import { useForm, FormProvider } from 'react-hook-form';
import { trpc } from '@/lib/trpc/client';
import { Button } from '@/components/ui/button';
import { SlidePanel, SlidePanelFooter } from '@/components/ui/slide-panel';
import { useToast } from '@/components/ui/use-toast';
import { Loader2, Wifi, WifiOff } from 'lucide-react';
import { OpenAIForm } from '@/components/connections/OpenAIForm';
import { AnthropicForm } from '@/components/connections/AnthropicForm';
import { OllamaForm } from '@/components/connections/OllamaForm';
import { PostgresForm } from '@/components/connections/PostgresForm';
import { MySQLForm } from '@/components/connections/MySQLForm';
import { cn } from '@/lib/utils';
import type { ConnectionFormValues } from '@/components/connections/types';

interface ConnectionEditPanelProps {
  connectionId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const FORM_BY_TYPE: Record<string, React.ComponentType<{ form: ReturnType<typeof useForm<ConnectionFormValues>> }>> = {
  openai: OpenAIForm,
  anthropic: AnthropicForm,
  ollama: OllamaForm,
  postgres: PostgresForm,
  mysql: MySQLForm,
};

export function ConnectionEditPanel({ connectionId, open, onOpenChange }: ConnectionEditPanelProps) {
  const { toast } = useToast();
  const utils = trpc.useUtils();
  const [testResult, setTestResult] = useState<{ success: boolean; message?: string } | null>(null);

  const { data: connection, isLoading } = trpc.connections.get.useQuery(
    { id: connectionId! },
    { enabled: !!connectionId && open }
  );

  const form = useForm<ConnectionFormValues>({
    values: connection
      ? {
          name: connection.name,
          config: (connection.config ?? {}) as ConnectionFormValues['config'],
        }
      : undefined,
  });

  const updateMutation = trpc.connections.update.useMutation({
    onSuccess: () => {
      toast({ title: 'Connection Updated', description: 'Changes saved successfully.' });
      utils.connections.list.invalidate();
      onOpenChange(false);
    },
    onError: (error) => {
      toast({ title: 'Update Failed', description: error.message, variant: 'destructive' });
    },
  });

  const testMutation = trpc.connections.test.useMutation({
    onSuccess: (data) => {
      setTestResult({ success: data.success, message: data.message });
      if (data.success) {
        utils.connections.list.invalidate();
      }
    },
    onError: (error) => {
      setTestResult({ success: false, message: error.message });
    },
  });

  function handleSave(values: ConnectionFormValues) {
    if (!connectionId || !connection) return;
    updateMutation.mutate({
      id: connectionId,
      version: connection.version,
      name: values.name,
      config: values.config,
    });
  }

  function handleTest() {
    if (!connectionId) return;
    setTestResult(null);
    testMutation.mutate({ id: connectionId });
  }

  const FormComponent = connection ? FORM_BY_TYPE[connection.type] : null;

  return (
    <SlidePanel
      open={open}
      onOpenChange={onOpenChange}
      title="Edit Connection"
      description={connection ? `${connection.type} connection` : undefined}
      footer={
        <SlidePanelFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={form.handleSubmit(handleSave)}
            disabled={updateMutation.isPending}
          >
            {updateMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save Changes
          </Button>
        </SlidePanelFooter>
      }
    >
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : connection && FormComponent ? (
        <div className="space-y-6">
          <FormProvider {...form}>
            <form onSubmit={form.handleSubmit(handleSave)}>
              <FormComponent form={form} />
            </form>
          </FormProvider>

          {/* Test Connection */}
          <div className="space-y-3 pt-2 border-t">
            <Button
              type="button"
              variant="outline"
              onClick={handleTest}
              disabled={testMutation.isPending}
            >
              {testMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Wifi className="mr-2 h-4 w-4" />
              )}
              Test Connection
            </Button>

            {testResult && (
              <div
                className={cn(
                  'text-sm flex items-center gap-2 rounded-md px-3 py-2',
                  testResult.success
                    ? 'bg-green-50 text-green-700 dark:bg-green-950/30 dark:text-green-400'
                    : 'bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-400'
                )}
              >
                {testResult.success ? (
                  <Wifi className="h-4 w-4 shrink-0" />
                ) : (
                  <WifiOff className="h-4 w-4 shrink-0" />
                )}
                <span>{testResult.message ?? (testResult.success ? 'Connected' : 'Failed')}</span>
              </div>
            )}
          </div>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Connection not found.</p>
      )}
    </SlidePanel>
  );
}
