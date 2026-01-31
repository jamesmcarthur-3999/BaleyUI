'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Copy, Edit, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { ROUTES } from '@/lib/routes';

interface Block {
  id: string;
  type: string;
  name: string;
  description: string | null;
  executionCount: number | null;
  lastExecutedAt: Date | null;
  model: string | null;
  createdAt: Date;
}

interface BlockCardProps {
  block: Block;
  onDelete: (id: string) => void;
  onDuplicate: (id: string) => void;
}

export function BlockCard({ block, onDelete, onDuplicate }: BlockCardProps) {
  const router = useRouter();

  const getTypeBadgeVariant = () => {
    switch (block.type) {
      case 'ai':
        return 'ai';
      case 'function':
        return 'function';
      case 'router':
        return 'router';
      case 'parallel':
        return 'parallel';
      default:
        return 'default';
    }
  };

  const getTypeLabel = () => {
    switch (block.type) {
      case 'ai':
        return 'AI Block';
      case 'function':
        return 'Function Block';
      case 'router':
        return 'Router Block';
      case 'parallel':
        return 'Parallel Block';
      default:
        return block.type;
    }
  };

  const handleCardClick = () => {
    router.push(ROUTES.blocks.detail(block.id));
  };

  const formatDate = (date: Date | null) => {
    if (!date) return 'Never';
    return new Date(date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  return (
    <Card
      className="cursor-pointer transition-all hover:shadow-md"
      onClick={handleCardClick}
    >
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <CardTitle className="text-lg">{block.name}</CardTitle>
            </div>
            <CardDescription className="mt-1">
              {block.description || 'No description'}
            </CardDescription>
          </div>
          <Badge variant={getTypeBadgeVariant() as any}>
            {getTypeLabel()}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {/* Block Details */}
          <div className="grid grid-cols-2 gap-3 text-sm">
            {block.model && (
              <div>
                <span className="text-muted-foreground">Model:</span>{' '}
                <span className="font-mono text-xs">{block.model}</span>
              </div>
            )}
            <div>
              <span className="text-muted-foreground">Executions:</span>{' '}
              <span className="font-semibold">{block.executionCount || 0}</span>
            </div>
            <div className="col-span-2">
              <span className="text-muted-foreground">Last executed:</span>{' '}
              <span className="text-xs">{formatDate(block.lastExecutedAt)}</span>
            </div>
          </div>

          {/* Actions */}
          <div
            className="flex items-center gap-2 pt-2 border-t"
            onClick={(e) => e.stopPropagation()}
          >
            <Button
              variant="outline"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                router.push(ROUTES.blocks.detail(block.id));
              }}
            >
              <Edit className="h-4 w-4 mr-1" />
              Edit
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                onDuplicate(block.id);
              }}
            >
              <Copy className="h-4 w-4 mr-1" />
              Duplicate
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                onDelete(block.id);
              }}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
