'use client';

import { useState } from 'react';
import Link from 'next/link';
import { BlocksList } from '@/components/blocks/BlocksList';
import { CreateBlockDialog } from '@/components/blocks/CreateBlockDialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import { trpc } from '@/lib/trpc/client';
import { Search, Filter, Boxes, Sparkles, Code2, Activity, AlertTriangle, ArrowRight } from 'lucide-react';
import { ROUTES } from '@/lib/routes';

export default function BlocksPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const { toast } = useToast();
  const utils = trpc.useUtils();

  // Fetch blocks
  const { data: blocks, isLoading } = trpc.blocks.list.useQuery();

  // Delete mutation
  const deleteMutation = trpc.blocks.delete.useMutation({
    onSuccess: () => {
      toast({
        title: 'Block Deleted',
        description: 'The block has been deleted successfully.',
      });
      utils.blocks.list.invalidate();
    },
    onError: (error) => {
      toast({
        title: 'Failed to Delete Block',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Duplicate mutation (create a copy)
  const duplicateMutation = trpc.blocks.duplicate.useMutation({
    onSuccess: () => {
      toast({
        title: 'Block Duplicated',
        description: 'The block has been duplicated successfully.',
      });
      utils.blocks.list.invalidate();
    },
    onError: (error) => {
      toast({
        title: 'Failed to Duplicate Block',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const handleDelete = (id: string) => {
    if (confirm('Are you sure you want to delete this block?')) {
      deleteMutation.mutate({ id });
    }
  };

  const handleDuplicate = (id: string) => {
    duplicateMutation.mutate({ id });
  };

  // Filter blocks based on search and type
  const filteredBlocks = blocks?.filter((block) => {
    const matchesSearch =
      searchQuery === '' ||
      block.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      block.description?.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesType = typeFilter === 'all' || block.type === typeFilter;

    return matchesSearch && matchesType;
  });

  return (
    <div className="container py-10">
      <div className="flex flex-col gap-8">
        {/* Deprecation Notice */}
        <Alert className="border-yellow-200 bg-yellow-50 dark:border-yellow-800 dark:bg-yellow-950/20">
          <AlertTriangle className="h-4 w-4 text-yellow-600" />
          <AlertTitle className="text-yellow-800 dark:text-yellow-200">
            Legacy Feature
          </AlertTitle>
          <AlertDescription className="text-yellow-700 dark:text-yellow-300">
            Blocks are being replaced by BaleyBots - a more powerful, task-focused approach.
            <Link
              href={ROUTES.dashboard}
              className="inline-flex items-center gap-1 ml-2 font-medium underline hover:no-underline"
            >
              Try BaleyBots
              <ArrowRight className="h-3 w-3" />
            </Link>
          </AlertDescription>
        </Alert>

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Blocks</h1>
            <p className="text-muted-foreground">
              Create and manage reusable AI and function blocks
            </p>
          </div>
          <CreateBlockDialog />
        </div>

        {/* Search and Filters */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search blocks..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Filter by type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="ai">AI Blocks</SelectItem>
                <SelectItem value="function">Function Blocks</SelectItem>
                <SelectItem value="router">Router Blocks</SelectItem>
                <SelectItem value="parallel">Parallel Blocks</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Stats */}
        {blocks && blocks.length > 0 && (
          <div className="grid gap-4 md:grid-cols-4">
            <Card>
              <CardContent className="flex items-center gap-3 p-4">
                <div className="rounded-lg bg-primary/10 p-2">
                  <Boxes className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <div className="text-2xl font-bold">{blocks.length}</div>
                  <div className="text-xs text-muted-foreground">Total Blocks</div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="flex items-center gap-3 p-4">
                <div className="rounded-lg bg-purple-500/10 p-2">
                  <Sparkles className="h-4 w-4 text-purple-500" />
                </div>
                <div>
                  <div className="text-2xl font-bold">
                    {blocks.filter((b) => b.type === 'ai').length}
                  </div>
                  <div className="text-xs text-muted-foreground">AI Blocks</div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="flex items-center gap-3 p-4">
                <div className="rounded-lg bg-blue-500/10 p-2">
                  <Code2 className="h-4 w-4 text-blue-500" />
                </div>
                <div>
                  <div className="text-2xl font-bold">
                    {blocks.filter((b) => b.type === 'function').length}
                  </div>
                  <div className="text-xs text-muted-foreground">Function Blocks</div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="flex items-center gap-3 p-4">
                <div className="rounded-lg bg-green-500/10 p-2">
                  <Activity className="h-4 w-4 text-green-500" />
                </div>
                <div>
                  <div className="text-2xl font-bold">
                    {blocks.reduce((sum, b) => sum + (b.executionCount || 0), 0)}
                  </div>
                  <div className="text-xs text-muted-foreground">Total Executions</div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Blocks List */}
        <BlocksList
          blocks={filteredBlocks || []}
          isLoading={isLoading}
          onDelete={handleDelete}
          onDuplicate={handleDuplicate}
        />
      </div>
    </div>
  );
}
