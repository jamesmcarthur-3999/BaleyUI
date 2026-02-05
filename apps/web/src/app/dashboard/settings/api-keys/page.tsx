'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
import { trpc } from '@/lib/trpc/client';
import { ROUTES } from '@/lib/routes';
import { Breadcrumbs } from '@/components/ui/breadcrumbs';
import { Plus, Copy, Trash2, Key, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

const createKeySchema = z.object({
  name: z.string().min(1, 'Name is required').max(255),
  permissions: z.array(z.enum(['read', 'execute', 'admin'])).min(1, 'Select at least one permission'),
});

type CreateKeyFormData = z.infer<typeof createKeySchema>;

const PERMISSION_DESCRIPTIONS = {
  read: 'View blocks, flows, and executions',
  execute: 'Execute blocks and flows',
  admin: 'Full access including creating and deleting resources',
} as const;

export default function ApiKeysPage() {
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [newlyCreatedKey, setNewlyCreatedKey] = useState<{
    name: string;
    apiKey: string;
    keyDisplay: string;
  } | null>(null);
  const [keyToCopy, setKeyToCopy] = useState<string>('');
  const [revokeKeyId, setRevokeKeyId] = useState<string | null>(null);
  const { toast } = useToast();
  const utils = trpc.useUtils();

  const { data: apiKeys, isLoading } = trpc.apiKeys.list.useQuery();

  const form = useForm<CreateKeyFormData>({
    resolver: zodResolver(createKeySchema),
    defaultValues: {
      name: '',
      permissions: [],
    },
  });

  const createMutation = trpc.apiKeys.create.useMutation({
    onSuccess: (data) => {
      setNewlyCreatedKey({
        name: data.name,
        apiKey: data.apiKey,
        keyDisplay: data.keyDisplay,
      });
      utils.apiKeys.list.invalidate();
      setCreateDialogOpen(false);
      form.reset();
    },
    onError: (error) => {
      toast({
        title: 'Failed to Create API Key',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const revokeMutation = trpc.apiKeys.revoke.useMutation({
    onSuccess: (data) => {
      toast({
        title: 'API Key Revoked',
        description: `The API key "${data.name}" has been revoked.`,
      });
      utils.apiKeys.list.invalidate();
      setRevokeKeyId(null);
    },
    onError: (error) => {
      toast({
        title: 'Failed to Revoke API Key',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const onSubmit = (data: CreateKeyFormData) => {
    createMutation.mutate({
      name: data.name,
      permissions: data.permissions,
    });
  };

  const handleCopy = async (key: string) => {
    try {
      await navigator.clipboard.writeText(key);
      setKeyToCopy(key);
      toast({
        title: 'Copied to Clipboard',
        description: 'API key has been copied to your clipboard.',
      });
      setTimeout(() => setKeyToCopy(''), 2000);
    } catch {
      toast({
        title: 'Failed to Copy',
        description: 'Could not copy to clipboard.',
        variant: 'destructive',
      });
    }
  };

  const handleRevoke = (id: string) => {
    revokeMutation.mutate({ id });
  };

  const handlePermissionChange = (permission: 'read' | 'execute' | 'admin', checked: boolean) => {
    const currentPermissions = form.watch('permissions');
    if (checked) {
      form.setValue('permissions', [...currentPermissions, permission]);
    } else {
      form.setValue('permissions', currentPermissions.filter((p) => p !== permission));
    }
  };

  return (
    <div className="container py-10">
      <Breadcrumbs
        items={[
          { label: 'Settings', href: ROUTES.settings.root },
          { label: 'API Keys' },
        ]}
        className="mb-6"
      />

      <div className="mb-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">API Keys</h1>
            <p className="mt-2 text-muted-foreground">
              Manage API keys for programmatic access to your workspace
            </p>
          </div>
          <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                Create API Key
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Create API Key</DialogTitle>
                <DialogDescription>
                  Create a new API key for programmatic access. The key will only be shown once.
                </DialogDescription>
              </DialogHeader>

              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="name">Name</Label>
                  <Input
                    id="name"
                    placeholder="e.g., Production Server, CI/CD Pipeline"
                    {...form.register('name')}
                  />
                  {form.formState.errors.name && (
                    <p className="text-sm text-destructive">{form.formState.errors.name.message}</p>
                  )}
                </div>

                <div className="space-y-3">
                  <Label>Permissions</Label>
                  <div className="space-y-3">
                    {(['read', 'execute', 'admin'] as const).map((permission) => (
                      <div key={permission} className="flex items-start space-x-3">
                        <Checkbox
                          id={permission}
                          checked={form.watch('permissions').includes(permission)}
                          onCheckedChange={(checked) =>
                            handlePermissionChange(permission, checked as boolean)
                          }
                        />
                        <div className="grid gap-1.5 leading-none">
                          <label
                            htmlFor={permission}
                            className="text-sm font-medium capitalize leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                          >
                            {permission}
                          </label>
                          <p className="text-sm text-muted-foreground">
                            {PERMISSION_DESCRIPTIONS[permission]}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                  {form.formState.errors.permissions && (
                    <p className="text-sm text-destructive">
                      {form.formState.errors.permissions.message}
                    </p>
                  )}
                </div>

                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setCreateDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={createMutation.isPending}>
                    {createMutation.isPending ? 'Creating...' : 'Create Key'}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="space-y-6">
        {/* Info Card */}
        <div className="rounded-lg border bg-muted/50 p-4">
          <p className="text-sm text-muted-foreground">
            API keys allow programmatic access to your workspace. Keep your keys secure and never share them publicly.
            Keys are hashed before being stored in the database.
          </p>
        </div>

        {/* New Key Display Dialog */}
        <Dialog open={!!newlyCreatedKey} onOpenChange={(open) => !open && setNewlyCreatedKey(null)}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-green-500" />
                <DialogTitle>API Key Created</DialogTitle>
              </div>
              <DialogDescription>
                Make sure to copy your API key now. You won&apos;t be able to see it again!
              </DialogDescription>
            </DialogHeader>

            {newlyCreatedKey && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Key Name</Label>
                  <Input value={newlyCreatedKey.name} readOnly />
                </div>

                <div className="space-y-2">
                  <Label>API Key</Label>
                  <div className="flex gap-2">
                    <Input
                      value={newlyCreatedKey.apiKey}
                      readOnly
                      className="font-mono text-sm"
                    />
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => handleCopy(newlyCreatedKey.apiKey)}
                      aria-label={keyToCopy === newlyCreatedKey.apiKey ? 'Copied' : 'Copy API key'}
                    >
                      {keyToCopy === newlyCreatedKey.apiKey ? (
                        <CheckCircle2 className="h-4 w-4 text-green-500" aria-hidden="true" />
                      ) : (
                        <Copy className="h-4 w-4" aria-hidden="true" />
                      )}
                    </Button>
                  </div>
                </div>

                <div className="rounded-lg border border-amber-500/50 bg-amber-500/10 p-4">
                  <div className="flex gap-3">
                    <AlertTriangle className="h-5 w-5 text-amber-500 flex-shrink-0" />
                    <div className="space-y-1">
                      <p className="text-sm font-medium text-amber-900 dark:text-amber-100">
                        Important: Save this key now
                      </p>
                      <p className="text-sm text-amber-800 dark:text-amber-200">
                        This is the only time you&apos;ll see the full API key. Store it securely.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            <DialogFooter>
              <Button onClick={() => setNewlyCreatedKey(null)}>Done</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Revoke Confirmation Dialog */}
        <AlertDialog open={!!revokeKeyId} onOpenChange={(open) => !open && setRevokeKeyId(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Revoke API Key</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to revoke this API key? This action cannot be undone.
                Any applications using this key will lose access immediately.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => revokeKeyId && handleRevoke(revokeKeyId)}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Revoke Key
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* API Keys List */}
        {isLoading ? (
          <div className="flex justify-center py-8">
            <div className="text-muted-foreground">Loading API keys...</div>
          </div>
        ) : apiKeys && apiKeys.length > 0 ? (
          <div className="space-y-4">
            {apiKeys.map((key) => (
              <Card key={key.id}>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-2">
                        <Key className="h-4 w-4 text-muted-foreground" />
                        <CardTitle className="text-lg">{key.name}</CardTitle>
                      </div>
                      <CardDescription className="font-mono text-xs">
                        {key.keyDisplay}
                      </CardDescription>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setRevokeKeyId(key.id)}
                      className="text-destructive hover:text-destructive hover:bg-destructive/10"
                      aria-label={`Revoke API key ${key.name}`}
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-3 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Permissions</span>
                      <div className="flex gap-2">
                        {(key.permissions as string[]).map((permission) => (
                          <span
                            key={permission}
                            className="inline-flex items-center rounded-md bg-primary/10 px-2 py-1 text-xs font-medium text-primary"
                          >
                            {permission}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Last Used</span>
                      <span>
                        {key.lastUsedAt
                          ? formatDistanceToNow(new Date(key.lastUsedAt), { addSuffix: true })
                          : 'Never'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Created</span>
                      <span>
                        {formatDistanceToNow(new Date(key.createdAt), { addSuffix: true })}
                      </span>
                    </div>
                    {key.expiresAt && (
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Expires</span>
                        <span className="text-destructive">
                          {formatDistanceToNow(new Date(key.expiresAt), { addSuffix: true })}
                        </span>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Key className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">No API Keys</h3>
              <p className="text-sm text-muted-foreground text-center mb-4">
                You haven&apos;t created any API keys yet. Create one to get started with programmatic access.
              </p>
              <Button onClick={() => setCreateDialogOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Create Your First API Key
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
