'use client';

import { useEffect } from 'react';
import { useParams } from 'next/navigation';
import { BlockEditor } from '@/components/blocks/BlockEditor';
import { AgentProfileView } from '@/components/blocks/AgentProfileView';
import { BehaviorTimeline } from '@/components/execution/BehaviorTimeline';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  ArrowLeft,
  Loader2,
  Sparkles,
  FlaskConical,
  Settings,
  User,
  GitBranch,
  Timer,
} from 'lucide-react';
import { trpc } from '@/lib/trpc/client';
import Link from 'next/link';
import { GenerateCodeDialog } from '@/components/codegen';
import { PatternAnalyzerPanel } from '@/components/patterns/PatternAnalyzerPanel';
import { ROUTES } from '@/lib/routes';
import { Breadcrumbs } from '@/components/ui/breadcrumbs';
import { useViewModeStore, type ViewMode } from '@/stores/view-mode';

export default function BlockEditorPage() {
  const params = useParams();
  const blockId = params.id as string;

  const { viewMode, setViewMode, getDefaultViewMode, isAutoSelected } =
    useViewModeStore();

  const { data: block, isLoading, error } = trpc.blocks.getById.useQuery(
    { id: blockId },
    { enabled: !!blockId }
  );

  const updateMutation = trpc.blocks.update.useMutation();

  // Fetch recent executions for timeline view
  const { data: executions } = trpc.flows.listExecutions.useQuery(
    { limit: 10 },
    { enabled: !!blockId }
  );

  // Set default view mode based on block type
  useEffect(() => {
    if (block && isAutoSelected) {
      const hasExecutions = executions && executions.length > 0;
      const defaultMode = getDefaultViewMode({
        blockType: block.type,
        hasNodes: false, // Single block, no nodes
        hasExecutions,
      });
      setViewMode(defaultMode, true);
    }
  }, [block, executions, isAutoSelected, getDefaultViewMode, setViewMode]);

  const handleViewModeChange = (mode: string) => {
    setViewMode(mode as ViewMode, false);
  };

  const handleBlockUpdate = async (
    changes: Record<string, unknown>
  ): Promise<void> => {
    if (!block) return;
    await updateMutation.mutateAsync({
      id: block.id,
      version: block.version,
      ...changes,
    });
  };

  if (isLoading) {
    return (
      <div className="container py-10">
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  if (error || !block) {
    return (
      <div className="container py-10">
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <h3 className="text-lg font-semibold">Block Not Found</h3>
          <p className="mt-1 text-sm text-muted-foreground max-w-sm">
            The block you&apos;re looking for doesn&apos;t exist or you
            don&apos;t have access to it.
          </p>
          <Link href={ROUTES.blocks.list}>
            <Button className="mt-4" variant="outline">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Blocks
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  // For AI blocks, show the new view system
  if (block.type === 'ai') {
    return (
      <div className="container py-10">
        <Breadcrumbs
          items={[
            { label: 'Blocks', href: ROUTES.blocks.list },
            { label: block.name },
          ]}
          className="mb-6"
        />

        {/* View Mode Selector */}
        <Tabs
          value={viewMode}
          onValueChange={handleViewModeChange}
          className="space-y-6"
        >
          <div className="flex items-center justify-between">
            <TabsList>
              <TabsTrigger value="profile" className="gap-2">
                <User className="h-4 w-4" />
                Profile
              </TabsTrigger>
              <TabsTrigger value="flow" className="gap-2">
                <GitBranch className="h-4 w-4" />
                Flow
              </TabsTrigger>
              <TabsTrigger value="timeline" className="gap-2">
                <Timer className="h-4 w-4" />
                Timeline
              </TabsTrigger>
            </TabsList>

            <div className="flex items-center gap-2">
              <GenerateCodeDialog
                blockId={block.id}
                blockName={block.name}
                outputSchema={block.outputSchema as Record<string, unknown> | undefined}
              />
            </div>
          </div>

          {/* Profile View - Character Sheet */}
          <TabsContent value="profile">
            <AgentProfileView
              block={block}
              onUpdate={handleBlockUpdate}
              isUpdating={updateMutation.isPending}
            />
          </TabsContent>

          {/* Flow View - For compositions */}
          <TabsContent value="flow">
            <div className="rounded-lg border p-8 text-center">
              <GitBranch className="mx-auto h-12 w-12 text-muted-foreground" />
              <h3 className="mt-4 text-lg font-semibold">Flow Canvas</h3>
              <p className="mt-2 text-muted-foreground">
                This agent is a single unit. Create a flow to compose multiple
                agents together.
              </p>
              <Link href={ROUTES.flows.list}>
                <Button className="mt-4" variant="outline">
                  Go to Flows
                </Button>
              </Link>
            </div>
          </TabsContent>

          {/* Timeline View - Execution History */}
          <TabsContent value="timeline">
            <BehaviorTimeline
              execution={null}
              blockExecutions={[]}
              isLoading={false}
            />
          </TabsContent>
        </Tabs>

        {/* Advanced Configuration Accordion */}
        <div className="mt-8">
          <Tabs defaultValue="patterns" className="space-y-4">
            <TabsList>
              <TabsTrigger value="patterns" className="gap-2">
                <Sparkles className="h-4 w-4" />
                Patterns
              </TabsTrigger>
              <TabsTrigger value="config" className="gap-2">
                <Settings className="h-4 w-4" />
                Advanced Config
              </TabsTrigger>
              <TabsTrigger value="test" className="gap-2">
                <FlaskConical className="h-4 w-4" />
                Test
              </TabsTrigger>
            </TabsList>

            <TabsContent value="patterns">
              <PatternAnalyzerPanel blockId={block.id} />
            </TabsContent>

            <TabsContent value="config">
              <BlockEditor block={block} />
            </TabsContent>

            <TabsContent value="test">
              <div className="rounded-lg border p-8 text-center">
                <FlaskConical className="mx-auto h-12 w-12 text-muted-foreground" />
                <h3 className="mt-4 text-lg font-semibold">Block Testing</h3>
                <p className="mt-2 text-muted-foreground">
                  Run test cases against this block to validate behavior.
                </p>
                <Link href={`/dashboard/blocks/${block.id}/test`}>
                  <Button className="mt-4">Open Test Runner</Button>
                </Link>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    );
  }

  // For non-AI blocks, show the original editor
  return (
    <div className="container py-10">
      <Breadcrumbs
        items={[
          { label: 'Blocks', href: ROUTES.blocks.list },
          { label: block.name },
        ]}
        className="mb-6"
      />

      <div className="mb-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">{block.name}</h1>
            {block.description && (
              <p className="mt-2 text-muted-foreground">{block.description}</p>
            )}
          </div>
        </div>
      </div>

      <Tabs defaultValue="config" className="space-y-6">
        <TabsList>
          <TabsTrigger value="config" className="gap-2">
            <Settings className="h-4 w-4" />
            Configuration
          </TabsTrigger>
        </TabsList>

        <TabsContent value="config">
          <BlockEditor block={block} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
