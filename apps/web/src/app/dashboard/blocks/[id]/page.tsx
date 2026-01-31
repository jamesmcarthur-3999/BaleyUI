'use client';

import { useParams, useRouter } from 'next/navigation';
import { BlockEditor } from '@/components/blocks/BlockEditor';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ArrowLeft, Loader2, Sparkles, FlaskConical, Settings } from 'lucide-react';
import { trpc } from '@/lib/trpc/client';
import Link from 'next/link';
import { GenerateCodeDialog } from '@/components/codegen';
import { PatternAnalyzerPanel } from '@/components/patterns/PatternAnalyzerPanel';
import { ROUTES } from '@/lib/routes';
import { Breadcrumbs } from '@/components/ui/breadcrumbs';

export default function BlockEditorPage() {
  const params = useParams();
  const router = useRouter();
  const blockId = params.id as string;

  const { data: block, isLoading, error } = trpc.blocks.getById.useQuery(
    { id: blockId },
    { enabled: !!blockId }
  );

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
            The block you&apos;re looking for doesn&apos;t exist or you don&apos;t have access to it.
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

  return (
    <div className="container py-10">
      <Breadcrumbs
        items={[
          { label: 'Blocks', href: ROUTES.blocks.list },
          { label: block.name }
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
          {block.type === 'ai' && (
            <GenerateCodeDialog
              blockId={block.id}
              blockName={block.name}
              outputSchema={block.outputSchema as object | undefined}
            />
          )}
        </div>
      </div>

      <Tabs defaultValue="config" className="space-y-6">
        <TabsList>
          <TabsTrigger value="config" className="gap-2">
            <Settings className="h-4 w-4" />
            Configuration
          </TabsTrigger>
          {block.type === 'ai' && (
            <>
              <TabsTrigger value="patterns" className="gap-2">
                <Sparkles className="h-4 w-4" />
                Patterns
              </TabsTrigger>
              <TabsTrigger value="test" className="gap-2">
                <FlaskConical className="h-4 w-4" />
                Test
              </TabsTrigger>
            </>
          )}
        </TabsList>

        <TabsContent value="config">
          <BlockEditor block={block} />
        </TabsContent>

        {block.type === 'ai' && (
          <>
            <TabsContent value="patterns">
              <PatternAnalyzerPanel blockId={block.id} />
            </TabsContent>

            <TabsContent value="test">
              <div className="rounded-lg border p-8 text-center">
                <FlaskConical className="mx-auto h-12 w-12 text-muted-foreground" />
                <h3 className="mt-4 text-lg font-semibold">Block Testing</h3>
                <p className="mt-2 text-muted-foreground">
                  Run test cases against this block to validate behavior.
                </p>
                <Link href={`/dashboard/blocks/${block.id}/test`}>
                  <Button className="mt-4">
                    Open Test Runner
                  </Button>
                </Link>
              </div>
            </TabsContent>
          </>
        )}
      </Tabs>
    </div>
  );
}
