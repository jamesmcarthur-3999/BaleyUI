'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ActionPopover, type ActionItem } from '@/components/ui/action-popover';
import { InlineEdit } from '@/components/ui/inline-edit';
import { ROUTES } from '@/lib/routes';
import { trpc } from '@/lib/trpc/client';
import {
  Bot,
  Code,
  Play,
  MoreVertical,
  Copy,
  Trash2,
  Settings,
  BarChart2,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface BlockCardProps {
  block: {
    id: string;
    name: string;
    type: string;
    version: number;
    description?: string | null;
    createdAt: Date;
    updatedAt?: Date;
  };
  onDelete?: () => void;
}

export function BlockCard({ block, onDelete }: BlockCardProps) {
  const router = useRouter();
  const utils = trpc.useUtils();

  const updateMutation = trpc.blocks.update.useMutation({
    onSuccess: () => utils.blocks.list.invalidate(),
  });

  const deleteMutation = trpc.blocks.delete.useMutation({
    onSuccess: () => {
      utils.blocks.list.invalidate();
      onDelete?.();
    },
  });

  const duplicateMutation = trpc.blocks.duplicate.useMutation({
    onSuccess: () => utils.blocks.list.invalidate(),
  });

  const handleRename = async (newName: string) => {
    await updateMutation.mutateAsync({
      id: block.id,
      version: block.version,
      name: newName,
    });
  };

  const handleDelete = async () => {
    await deleteMutation.mutateAsync({ id: block.id });
  };

  const handleDuplicate = async () => {
    await duplicateMutation.mutateAsync({ id: block.id });
  };

  const actions: ActionItem[] = [
    {
      id: 'run',
      label: 'Run',
      icon: <Play className="h-4 w-4" />,
      shortcut: '⌘R',
      onSelect: () => router.push(ROUTES.blocks.test(block.id)),
    },
    {
      id: 'configure',
      label: 'Configure',
      icon: <Settings className="h-4 w-4" />,
      onSelect: () => router.push(ROUTES.blocks.detail(block.id)),
    },
    {
      id: 'duplicate',
      label: 'Duplicate',
      icon: <Copy className="h-4 w-4" />,
      shortcut: '⌘D',
      onSelect: handleDuplicate,
    },
    {
      id: 'analytics',
      label: 'View analytics',
      icon: <BarChart2 className="h-4 w-4" />,
      onSelect: () => router.push(ROUTES.blocks.patterns(block.id)),
    },
    {
      id: 'delete',
      label: 'Delete',
      icon: <Trash2 className="h-4 w-4" />,
      shortcut: '⌘⌫',
      destructive: true,
      onSelect: handleDelete,
    },
  ];

  const Icon = block.type === 'ai' ? Bot : Code;

  return (
    <Card variant="interactive" className="group relative">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div
              className={cn(
                'h-11 w-11 rounded-xl flex items-center justify-center shrink-0 transition-colors',
                block.type === 'ai'
                  ? 'bg-block-ai/10 group-hover:bg-block-ai/15'
                  : 'bg-block-function/10 group-hover:bg-block-function/15'
              )}
            >
              <Icon
                className={cn(
                  'h-5 w-5',
                  block.type === 'ai' ? 'text-block-ai' : 'text-block-function'
                )}
              />
            </div>
            <div className="min-w-0">
              <InlineEdit
                value={block.name}
                onSave={handleRename}
                textClassName="font-semibold"
              />
              <Badge variant="secondary" className="mt-1.5 text-xs">
                {block.type}
              </Badge>
            </div>
          </div>

          {/* Actions - show on hover */}
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity z-10">
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => router.push(ROUTES.blocks.test(block.id))}
            >
              <Play className="h-4 w-4" />
            </Button>
            <ActionPopover
              trigger={
                <Button variant="ghost" size="icon-sm">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              }
              actions={actions}
            />
          </div>
        </div>
      </CardHeader>

      {block.description && (
        <CardContent className="pt-0">
          <p className="text-sm text-muted-foreground line-clamp-2 leading-relaxed">
            {block.description}
          </p>
        </CardContent>
      )}

      {/* Click area for navigation */}
      <Link
        href={ROUTES.blocks.detail(block.id)}
        className="absolute inset-0 z-0"
        aria-label={`View ${block.name}`}
      />
    </Card>
  );
}

BlockCard.displayName = 'BlockCard';
