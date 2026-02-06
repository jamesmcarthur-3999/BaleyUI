'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { trpc } from '@/lib/trpc/client';
import { ROUTES } from '@/lib/routes';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/components/ui/use-toast';
import { BalCodeEditor } from '@/components/baleybot/BalCodeEditor';
import { VisualEditor } from '@/components/visual-editor/VisualEditor';
import {
  ArrowLeft,
  Bot,
  Pencil,
  Save,
  RotateCcw,
  Loader2,
} from 'lucide-react';

type ViewMode = 'code' | 'visual';

export default function AdminBaleybotDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { toast } = useToast();
  const utils = trpc.useUtils();

  const { data: bb, isLoading } = trpc.admin.getInternalBaleybot.useQuery(
    { id: params.id },
    { enabled: !!params.id }
  );

  const [activeTab, setActiveTab] = useState<ViewMode>('code');
  const [balCode, setBalCode] = useState<string | null>(null);
  const [name, setName] = useState<string | null>(null);
  const [description, setDescription] = useState<string | null>(null);

  // Track dirty state
  const currentBalCode = balCode ?? bb?.balCode ?? '';
  const currentName = name ?? bb?.name ?? '';
  const currentDescription = description ?? bb?.description ?? '';
  const isDirty =
    (balCode !== null && balCode !== bb?.balCode) ||
    (name !== null && name !== bb?.name) ||
    (description !== null && description !== (bb?.description ?? ''));

  const updateMutation = trpc.admin.updateInternalBaleybot.useMutation({
    onSuccess: () => {
      toast({ title: 'Saved', description: 'Internal BaleyBot updated successfully.' });
      // Reset local state
      setBalCode(null);
      setName(null);
      setDescription(null);
      utils.admin.getInternalBaleybot.invalidate({ id: params.id });
      utils.admin.listInternalBaleybots.invalidate();
    },
    onError: (error) => {
      toast({
        title: 'Save failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const resetMutation = trpc.admin.resetToDefault.useMutation({
    onSuccess: () => {
      toast({ title: 'Reset', description: 'BaleyBot reset to default definition.' });
      setBalCode(null);
      setName(null);
      setDescription(null);
      utils.admin.getInternalBaleybot.invalidate({ id: params.id });
      utils.admin.listInternalBaleybots.invalidate();
    },
    onError: (error) => {
      toast({
        title: 'Reset failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const handleSave = () => {
    if (!bb) return;
    updateMutation.mutate({
      id: bb.id,
      version: bb.version,
      ...(name !== null && { name }),
      ...(description !== null && { description }),
      ...(balCode !== null && { balCode }),
    });
  };

  const handleReset = () => {
    if (!bb) return;
    resetMutation.mutate({ id: bb.id, version: bb.version });
  };

  if (isLoading) {
    return (
      <div className="container py-10">
        <Skeleton className="h-10 w-64 mb-6" />
        <Skeleton className="h-[500px] w-full rounded-2xl" />
      </div>
    );
  }

  if (!bb) {
    return (
      <div className="container py-10 text-center">
        <Bot className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
        <h2 className="text-xl font-semibold mb-2">BaleyBot Not Found</h2>
        <Button variant="outline" onClick={() => router.push(ROUTES.admin.baleybots)}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Admin
        </Button>
      </div>
    );
  }

  return (
    <div className="container py-10">
      <div className="flex flex-col gap-6">
        {/* Back link */}
        <Button
          variant="ghost"
          size="sm"
          className="w-fit"
          onClick={() => router.push(ROUTES.admin.baleybots)}
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Internal BaleyBots
        </Button>

        {/* Header */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500/10 to-primary/10 text-3xl shrink-0">
              {bb.icon || '🤖'}
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Input
                  value={currentName}
                  onChange={(e) => setName(e.target.value)}
                  className="text-xl font-bold border-none p-0 h-auto shadow-none focus-visible:ring-0 bg-transparent"
                />
                <Badge variant="secondary" className="bg-violet-500/10 text-violet-600 border-violet-500/20 shrink-0">
                  <Bot className="h-3 w-3 mr-1" />
                  Internal
                </Badge>
                {bb.adminEdited ? (
                  <Badge variant="outline" className="text-amber-600 border-amber-500/30 shrink-0">
                    <Pencil className="h-3 w-3 mr-1" />
                    Customized
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-emerald-600 border-emerald-500/30 shrink-0">
                    Default
                  </Badge>
                )}
              </div>
              <Textarea
                value={currentDescription}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Add a description..."
                className="border-none p-0 shadow-none focus-visible:ring-0 bg-transparent text-sm text-muted-foreground resize-none min-h-0"
                rows={1}
              />
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2">
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!bb.adminEdited || resetMutation.isPending}
                >
                  <RotateCcw className="h-4 w-4 mr-2" />
                  Reset to Default
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Reset to Default?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will replace the current BAL code, description, and icon with the original
                    code-defined defaults. Any customizations will be lost.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleReset}>
                    Reset
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>

            <Button
              size="sm"
              disabled={!isDirty || updateMutation.isPending}
              onClick={handleSave}
            >
              {updateMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Save className="h-4 w-4 mr-2" />
              )}
              Save Changes
            </Button>
          </div>
        </div>

        {/* Editor Tabs */}
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as ViewMode)}>
          <TabsList>
            <TabsTrigger value="code">Code</TabsTrigger>
            <TabsTrigger value="visual">Visual</TabsTrigger>
          </TabsList>

          <TabsContent value="code" className="mt-4">
            <BalCodeEditor
              value={currentBalCode}
              onChange={(v) => setBalCode(v)}
              height={500}
            />
          </TabsContent>

          <TabsContent value="visual" className="mt-4">
            <VisualEditor
              balCode={currentBalCode}
              onChange={(v) => setBalCode(v)}
            />
          </TabsContent>
        </Tabs>

        {/* Recent Executions */}
        {bb.executions && bb.executions.length > 0 && (
          <div>
            <h3 className="text-lg font-semibold mb-3">Recent Executions</h3>
            <div className="space-y-2">
              {bb.executions.map((exec) => (
                <div
                  key={exec.id}
                  className="flex items-center justify-between rounded-lg border p-3 text-sm"
                >
                  <div className="flex items-center gap-3">
                    <Badge
                      variant={exec.status === 'completed' ? 'default' : exec.status === 'failed' ? 'destructive' : 'secondary'}
                    >
                      {exec.status}
                    </Badge>
                    <span className="text-muted-foreground">
                      {exec.triggeredBy || 'manual'}
                    </span>
                  </div>
                  <div className="flex items-center gap-4 text-muted-foreground">
                    {exec.durationMs !== null && (
                      <span>{exec.durationMs}ms</span>
                    )}
                    <span>
                      {new Date(exec.createdAt).toLocaleString()}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
