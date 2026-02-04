'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Breadcrumbs } from '@/components/ui/breadcrumbs';
import { useToast } from '@/components/ui/use-toast';
import { trpc } from '@/lib/trpc/client';
import { ROUTES } from '@/lib/routes';
import { Save, Building2 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

const workspaceSchema = z.object({
  name: z.string().min(1, 'Workspace name is required').max(100, 'Name must be 100 characters or less'),
});

type WorkspaceFormData = z.infer<typeof workspaceSchema>;

export default function WorkspaceSettingsPage() {
  const { toast } = useToast();
  const utils = trpc.useUtils();

  const { data: workspace, isLoading } = trpc.workspaces.get.useQuery();

  const form = useForm<WorkspaceFormData>({
    resolver: zodResolver(workspaceSchema),
    values: {
      name: workspace?.name ?? '',
    },
  });

  const updateMutation = trpc.workspaces.update.useMutation({
    onSuccess: (data) => {
      toast({
        title: 'Workspace Updated',
        description: 'Your workspace settings have been saved successfully.',
      });
      utils.workspaces.get.invalidate();
    },
    onError: (error) => {
      // Handle conflict error (optimistic locking)
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

  const isDirty = form.formState.isDirty;

  return (
    <div className="container py-10">
      <Breadcrumbs
        items={[
          { label: 'Settings', href: ROUTES.settings.root },
          { label: 'Workspace' },
        ]}
        className="mb-6"
      />

      <div className="mb-8">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-primary/10 p-2">
            <Building2 className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-3xl font-bold">Workspace Settings</h1>
            <p className="mt-1 text-muted-foreground">
              Manage your workspace name and settings
            </p>
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-8">
          <div className="text-muted-foreground">Loading workspace settings...</div>
        </div>
      ) : workspace ? (
        <div className="max-w-2xl space-y-6">
          {/* General Settings */}
          <Card>
            <CardHeader>
              <CardTitle>General</CardTitle>
              <CardDescription>
                Update your workspace name and basic information
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="name">Workspace Name</Label>
                  <Input
                    id="name"
                    placeholder="e.g., My Company, Personal Projects"
                    {...form.register('name')}
                  />
                  {form.formState.errors.name && (
                    <p className="text-sm text-destructive">{form.formState.errors.name.message}</p>
                  )}
                  <p className="text-sm text-muted-foreground">
                    The name of your workspace as it appears throughout the application.
                  </p>
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

          {/* Workspace Information */}
          <Card>
            <CardHeader>
              <CardTitle>Workspace Information</CardTitle>
              <CardDescription>
                Read-only information about your workspace
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="grid gap-2">
                  <Label className="text-muted-foreground">Workspace ID</Label>
                  <div className="flex items-center gap-2">
                    <code className="relative rounded bg-muted px-[0.5rem] py-[0.25rem] font-mono text-sm">
                      {workspace.id}
                    </code>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Use this ID when making API requests or configuring integrations.
                  </p>
                </div>

                <div className="grid gap-2">
                  <Label className="text-muted-foreground">Slug</Label>
                  <div className="flex items-center gap-2">
                    <code className="relative rounded bg-muted px-[0.5rem] py-[0.25rem] font-mono text-sm">
                      {workspace.slug}
                    </code>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    URL-friendly identifier for your workspace.
                  </p>
                </div>

                <div className="grid gap-2">
                  <Label className="text-muted-foreground">Created</Label>
                  <p className="text-sm">
                    {formatDistanceToNow(new Date(workspace.createdAt), { addSuffix: true })}
                  </p>
                </div>

                <div className="grid gap-2">
                  <Label className="text-muted-foreground">Last Updated</Label>
                  <p className="text-sm">
                    {formatDistanceToNow(new Date(workspace.updatedAt), { addSuffix: true })}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Building2 className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No Workspace Found</h3>
            <p className="text-sm text-muted-foreground text-center">
              Unable to load workspace settings.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
