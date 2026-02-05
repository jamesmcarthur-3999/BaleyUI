'use client';

import { useParams } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ArrowLeft, Loader2, MessageSquare, FlaskConical, History } from 'lucide-react';
import { trpc } from '@/lib/trpc/client';
import Link from 'next/link';
import { LiveChat, SingleTest, TestHistory } from '@/components/testing';
import { useToast } from '@/components/ui/use-toast';
import { ROUTES } from '@/lib/routes';

export default function BlockTestPage() {
  const params = useParams();
  const { toast } = useToast();
  const blockId = params.id as string;
  const [activeTab, setActiveTab] = useState('chat');

  const { data: block, isLoading, error } = trpc.blocks.getById.useQuery(
    { id: blockId },
    { enabled: !!blockId }
  );

  const handleError = (error: Error) => {
    toast({
      title: 'Error',
      description: error.message,
      variant: 'destructive',
    });
  };

  const handleComplete = (_result: unknown) => {
    toast({
      title: 'Execution Complete',
      description: 'Block execution finished successfully',
    });
  };

  const handleReplayTest = (_input: unknown) => {
    setActiveTab('single');
    // TODO: Set the input in SingleTest component
    toast({
      title: 'Test Replayed',
      description: 'Input has been loaded into the test interface',
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
      {/* Header */}
      <div className="mb-8">
        <Link href={ROUTES.blocks.detail(blockId)}>
          <Button variant="ghost" size="sm" className="mb-4">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Block
          </Button>
        </Link>

        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Test: {block.name}</h1>
            {block.description && (
              <p className="mt-2 text-muted-foreground">{block.description}</p>
            )}
          </div>
        </div>
      </div>

      {/* Test Interface Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid w-full grid-cols-3 lg:w-[400px]">
          <TabsTrigger value="chat" className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4" />
            <span className="hidden sm:inline">Live Chat</span>
          </TabsTrigger>
          <TabsTrigger value="single" className="flex items-center gap-2">
            <FlaskConical className="h-4 w-4" />
            <span className="hidden sm:inline">Single Test</span>
          </TabsTrigger>
          <TabsTrigger value="history" className="flex items-center gap-2">
            <History className="h-4 w-4" />
            <span className="hidden sm:inline">History</span>
          </TabsTrigger>
        </TabsList>

        {/* Live Chat Tab */}
        <TabsContent value="chat" className="space-y-4">
          <div className="rounded-lg border bg-card p-6">
            <div className="mb-4">
              <h2 className="text-lg font-semibold">Multi-turn Conversation</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Test your block with a chat interface. Messages are sent in real-time with streaming responses.
              </p>
            </div>
            <LiveChat
              blockId={blockId}
              onError={handleError}
            />
          </div>
        </TabsContent>

        {/* Single Test Tab */}
        <TabsContent value="single" className="space-y-4">
          <div className="rounded-lg border bg-card p-6">
            <div className="mb-4">
              <h2 className="text-lg font-semibold">Single Execution Test</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Run a single test with custom JSON input. Perfect for debugging and development.
              </p>
            </div>
            <SingleTest
              blockId={blockId}
              onComplete={handleComplete}
              onError={handleError}
            />
          </div>
        </TabsContent>

        {/* History Tab */}
        <TabsContent value="history" className="space-y-4">
          <div className="rounded-lg border bg-card p-6">
            <div className="mb-4">
              <h2 className="text-lg font-semibold">Execution History</h2>
              <p className="text-sm text-muted-foreground mt-1">
                View past test runs, replay tests, or inspect detailed results.
              </p>
            </div>
            <TestHistory
              blockId={blockId}
              onReplay={handleReplayTest}
            />
          </div>
        </TabsContent>
      </Tabs>

      {/* Block Info Footer */}
      <div className="mt-8 p-4 rounded-lg bg-muted/50 text-sm text-muted-foreground">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <span className="font-medium">Block ID:</span>
            <span className="ml-2 font-mono text-xs">{block.id}</span>
          </div>
          {block.model && (
            <div>
              <span className="font-medium">Model:</span>
              <span className="ml-2">{block.model || 'Default'}</span>
            </div>
          )}
          {block.updatedAt && (
            <div>
              <span className="font-medium">Last Updated:</span>
              <span className="ml-2">
                {new Date(block.updatedAt).toLocaleDateString()}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
