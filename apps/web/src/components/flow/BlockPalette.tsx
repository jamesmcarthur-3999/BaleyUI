'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { Search, Sparkles, Code2, GitBranch, Workflow, RotateCw, Play, Flag } from 'lucide-react';
import { useState } from 'react';

interface Block {
  id: string;
  name: string;
  type: 'ai' | 'function' | 'router' | 'parallel' | 'loop';
  description?: string;
  model?: string;
}

interface BlockPaletteProps {
  blocks: Block[];
  className?: string;
}

const patternBlocks = [
  {
    id: 'source',
    type: 'source' as const,
    name: 'Start',
    description: 'Entry point for the flow',
  },
  {
    id: 'sink',
    type: 'sink' as const,
    name: 'End',
    description: 'Output destination',
  },
];

const blockTypeConfig = {
  ai: {
    icon: Sparkles,
    color: 'hsl(var(--color-block-ai))',
    variant: 'ai' as const,
  },
  function: {
    icon: Code2,
    color: 'hsl(var(--color-block-function))',
    variant: 'function' as const,
  },
  router: {
    icon: GitBranch,
    color: 'hsl(var(--color-block-router))',
    variant: 'router' as const,
  },
  parallel: {
    icon: Workflow,
    color: 'hsl(var(--color-block-parallel))',
    variant: 'parallel' as const,
  },
  loop: {
    icon: RotateCw,
    color: 'hsl(var(--primary))',
    variant: 'default' as const,
  },
  source: {
    icon: Play,
    color: 'hsl(var(--color-success))',
    variant: 'connected' as const,
  },
  sink: {
    icon: Flag,
    color: 'hsl(var(--destructive))',
    variant: 'destructive' as const,
  },
};

export function BlockPalette({ blocks, className }: BlockPaletteProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [draggedItemId, setDraggedItemId] = useState<string | null>(null);

  const onDragStart = (
    event: React.DragEvent,
    blockType: string,
    blockId: string,
    blockName: string,
    blockData?: Record<string, unknown>
  ) => {
    setDraggedItemId(blockId);
    event.dataTransfer.setData(
      'application/reactflow',
      JSON.stringify({
        type: blockType,
        blockId,
        name: blockName,
        ...blockData,
      })
    );
    event.dataTransfer.effectAllowed = 'move';
  };

  const onDragEnd = () => {
    setDraggedItemId(null);
  };

  const handleKeyDown = (
    event: React.KeyboardEvent<HTMLDivElement>,
    type: string,
    id: string,
    _name: string,
    _additionalData?: Record<string, unknown>
  ) => {
    // Allow keyboard users to "pick up" the item for drag simulation
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      // Toggle the grabbed state for screen reader feedback
      setDraggedItemId(draggedItemId === id ? null : id);
    }
  };

  const filteredBlocks = blocks.filter((block) =>
    block.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const groupedBlocks = filteredBlocks.reduce<Record<string, Block[]>>(
    (acc, block) => {
      const existing = acc[block.type];
      if (!existing) {
        acc[block.type] = [block];
      } else {
        existing.push(block);
      }
      return acc;
    },
    {}
  );

  const renderBlockItem = (
    type: keyof typeof blockTypeConfig,
    id: string,
    name: string,
    description?: string,
    additionalData?: Record<string, unknown>
  ) => {
    const config = blockTypeConfig[type];
    const Icon = config.icon;
    const isGrabbed = draggedItemId === id;

    return (
      <div
        key={id}
        role="button"
        tabIndex={0}
        draggable
        aria-label={`${name} ${type} block${description ? `. ${description}` : ''}. Drag to add to flow.`}
        aria-grabbed={isGrabbed}
        aria-describedby={`${id}-instructions`}
        onDragStart={(e) => onDragStart(e, type, id, name, additionalData)}
        onDragEnd={onDragEnd}
        onKeyDown={(e) => handleKeyDown(e, type, id, name, additionalData)}
        className={cn(
          'flex items-start gap-3 p-3 rounded-md border-2 border-border',
          'cursor-grab active:cursor-grabbing',
          'transition-all hover:shadow-md hover:border-opacity-100',
          'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
          'bg-card',
          isGrabbed && 'ring-2 ring-primary'
        )}
        style={{
          borderColor: `${config.color}40`,
        }}
      >
        <span id={`${id}-instructions`} className="sr-only">
          Press Enter or Space to toggle selection for drag and drop
        </span>
        <Icon className="h-4 w-4 mt-0.5 flex-shrink-0" style={{ color: config.color }} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <p className="font-medium text-sm truncate">{name}</p>
            <Badge variant={config.variant} className="text-xs flex-shrink-0">
              {type}
            </Badge>
          </div>
          {description && (
            <p className="text-xs text-muted-foreground line-clamp-2">{description}</p>
          )}
        </div>
      </div>
    );
  };

  return (
    <Card className={cn('h-full flex flex-col', className)}>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg">Block Palette</CardTitle>
        <div className="relative mt-2">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search blocks..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-8"
          />
        </div>
      </CardHeader>
      <CardContent className="flex-1 overflow-hidden p-0">
        <ScrollArea className="h-full px-6 pb-6">
          <div className="space-y-6">
            {/* Pattern Blocks */}
            <div>
              <h3 className="text-sm font-semibold mb-3 text-muted-foreground">Patterns</h3>
              <div className="space-y-2">
                {patternBlocks.map((block) =>
                  renderBlockItem(block.type, block.id, block.name, block.description)
                )}
              </div>
            </div>

            {/* AI Blocks */}
            {groupedBlocks.ai && groupedBlocks.ai.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold mb-3 text-muted-foreground">AI Blocks</h3>
                <div className="space-y-2">
                  {groupedBlocks.ai.map((block) =>
                    renderBlockItem('ai', block.id, block.name, block.description, {
                      model: block.model,
                    })
                  )}
                </div>
              </div>
            )}

            {/* Function Blocks */}
            {groupedBlocks.function && groupedBlocks.function.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold mb-3 text-muted-foreground">
                  Function Blocks
                </h3>
                <div className="space-y-2">
                  {groupedBlocks.function.map((block) =>
                    renderBlockItem('function', block.id, block.name, block.description)
                  )}
                </div>
              </div>
            )}

            {/* Router Blocks */}
            {groupedBlocks.router && groupedBlocks.router.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold mb-3 text-muted-foreground">Routers</h3>
                <div className="space-y-2">
                  {groupedBlocks.router.map((block) =>
                    renderBlockItem('router', block.id, block.name, block.description)
                  )}
                </div>
              </div>
            )}

            {/* Parallel Blocks */}
            {groupedBlocks.parallel && groupedBlocks.parallel.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold mb-3 text-muted-foreground">Parallel</h3>
                <div className="space-y-2">
                  {groupedBlocks.parallel.map((block) =>
                    renderBlockItem('parallel', block.id, block.name, block.description)
                  )}
                </div>
              </div>
            )}

            {/* Loop Blocks */}
            {groupedBlocks.loop && groupedBlocks.loop.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold mb-3 text-muted-foreground">Loops</h3>
                <div className="space-y-2">
                  {groupedBlocks.loop.map((block) =>
                    renderBlockItem('loop', block.id, block.name, block.description)
                  )}
                </div>
              </div>
            )}

            {filteredBlocks.length === 0 && searchTerm && (
              <div className="text-center py-8 text-muted-foreground text-sm">
                No blocks found matching &quot;{searchTerm}&quot;
              </div>
            )}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
