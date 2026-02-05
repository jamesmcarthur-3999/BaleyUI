'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Edit, Trash2, Copy, Play } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { ROUTES } from '@/lib/routes';

interface FlowNode {
  id: string;
  type?: string;
  data?: Record<string, unknown>;
  position?: { x: number; y: number };
}

interface FlowEdge {
  id: string;
  source: string;
  target: string;
}

interface Flow {
  id: string;
  name: string;
  description: string | null;
  enabled: boolean;
  nodes: FlowNode[];
  edges: FlowEdge[];
  createdAt: Date;
  updatedAt: Date;
}

interface FlowCardProps {
  flow: Flow;
  onDelete: (id: string) => void;
  onDuplicate: (id: string) => void;
  onRun?: (id: string) => void;
}

export function FlowCard({ flow, onDelete, onDuplicate, onRun }: FlowCardProps) {
  const router = useRouter();

  const handleCardClick = () => {
    router.push(ROUTES.flows.detail(flow.id));
  };

  const formatDate = (date: Date) => {
    return new Date(date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const nodeCount = Array.isArray(flow.nodes) ? flow.nodes.length : 0;
  const edgeCount = Array.isArray(flow.edges) ? flow.edges.length : 0;

  return (
    <Card
      className="cursor-pointer transition-all hover:shadow-md focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
      onClick={handleCardClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleCardClick();
        }
      }}
      tabIndex={0}
      role="button"
    >
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <CardTitle className="text-lg">{flow.name}</CardTitle>
              {flow.enabled ? (
                <Badge variant="connected" className="text-xs">
                  Enabled
                </Badge>
              ) : (
                <Badge variant="outline" className="text-xs">
                  Disabled
                </Badge>
              )}
            </div>
            <CardDescription className="mt-1">
              {flow.description || 'No description'}
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {/* Flow Details */}
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <span className="text-muted-foreground">Nodes:</span>{' '}
              <span className="font-semibold">{nodeCount}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Connections:</span>{' '}
              <span className="font-semibold">{edgeCount}</span>
            </div>
            <div className="col-span-2">
              <span className="text-muted-foreground">Last modified:</span>{' '}
              <span className="text-xs">{formatDate(flow.updatedAt)}</span>
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
                router.push(ROUTES.flows.detail(flow.id));
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
                onRun?.(flow.id);
              }}
              disabled={!onRun}
            >
              <Play className="h-4 w-4 mr-1" />
              Run
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                onDuplicate(flow.id);
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
                onDelete(flow.id);
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
