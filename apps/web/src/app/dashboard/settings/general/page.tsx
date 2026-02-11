'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
import { trpc } from '@/lib/trpc/client';
import { Save, Copy, Check } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { useState } from 'react';

const workspaceSchema = z.object({
  name: z.string().min(1, 'Workspace name is required').max(100, 'Name must be 100 characters or less'),
});

type WorkspaceFormData = z.infer<typeof workspaceSchema>;

export default function GeneralSettingsPage() {
  const { toast } = useToast();
  const utils = trpc.useUtils();
  const [copiedId, setCopiedId] = useState(false);

  const { data: workspace, isLoading } = trpc.workspaces.get.useQuery();

  const form = useForm<WorkspaceFormData>({
    resolver: zodResolver(workspaceSchema),
    values: {
      name: workspace?.name ?? '',
    },
  });

  const updateMutation = trpc.workspaces.update.useMutation({
    onSuccess: () => {
      toast({
        title: 'Workspace Updated',
        description: 'Your workspace settings have been saved successfully.',
      });
      utils.workspaces.get.invalidate();
    },
    onError: (error) => {
      if (error.data?.code === 'CONFLICT') {
        toast({
          title: 'Update Conflict',
          description: 'The workspace was modified by another user. Please refresh and try again.',
          variant: 'destructive',
        });
        utils.workspaces.get.invalidate();
      } else {
        toast({
          title: 'Failed to Update Workspace',
          description: error.message,
          variant: 'destructive',
        });
      }
    },
  });

  const onSubmit = (data: WorkspaceFormData) => {
    if (!workspace?.version) return;
    updateMutation.mutate({
      name: data.name,
      version: workspace.version,
    });
  };

  const copyId = async () => {
    if (!workspace?.id) return;
    await navigator.clipboard.writeText(workspace.id);
    setCopiedId(true);
    setTimeout(() => setCopiedId(false), 2000);
  };

  const isDirty = form.formState.isDirty;

  if (isLoading) {
    return (
      <div className="flex justify-center py-8">
        <div className="text-muted-foreground">Loading workspace settings...</div>
      </div>
    );
  }

  if (!workspace) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <h3 className="text-lg font-semibold mb-2">No Workspace Found</h3>
          <p className="text-sm text-muted-foreground text-center">
            Unable to load workspace settings.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="max-w-2xl space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Workspace Name</CardTitle>
          <CardDescription>
            The name of your workspace as it appears throughout the application.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                placeholder="e.g., My Company, Personal Projects"
                {...form.register('name')}
              />
              {form.formState.errors.name && (
                <p className="text-sm text-destructive">{form.formState.errors.name.message}</p>
              )}
            </div>

            <div className="flex justify-end">
              <Button
                type="submit"
                disabled={updateMutation.isPending || !isDirty}
              >
                <Save className="mr-2 h-4 w-4" />
                {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Workspace Information</CardTitle>
          <CardDescription>
            Read-only details about your workspace
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="grid gap-1.5">
              <Label className="text-muted-foreground text-xs uppercase tracking-wide">Workspace ID</Label>
              <div className="flex items-center gap-2">
                <code className="relative rounded bg-muted px-2 py-1 font-mono text-sm">
                  {workspace.id}
                </code>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={copyId}>
                  {copiedId ? (
                    <Check className="h-3.5 w-3.5 text-green-500" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" />
                  )}
                </Button>
              </div>
            </div>

            <div className="grid gap-1.5">
              <Label className="text-muted-foreground text-xs uppercase tracking-wide">Slug</Label>
              <code className="relative rounded bg-muted px-2 py-1 font-mono text-sm w-fit">
                {workspace.slug}
              </code>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-1.5">
                <Label className="text-muted-foreground text-xs uppercase tracking-wide">Created</Label>
                <p className="text-sm">
                  {formatDistanceToNow(new Date(workspace.createdAt), { addSuffix: true })}
                </p>
              </div>
              <div className="grid gap-1.5">
                <Label className="text-muted-foreground text-xs uppercase tracking-wide">Last Updated</Label>
                <p className="text-sm">
                  {formatDistanceToNow(new Date(workspace.updatedAt), { addSuffix: true })}
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
