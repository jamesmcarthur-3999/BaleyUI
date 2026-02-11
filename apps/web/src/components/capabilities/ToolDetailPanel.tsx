'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { SlidePanel, SlidePanelFooter } from '@/components/ui/slide-panel';
import { Pencil, Trash2 } from 'lucide-react';

function formatDate(date: Date | string): string {
  return new Date(date).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

interface ToolDetailPanelProps {
  tool: {
    id: string;
    name: string;
    description: string;
    code: string;
    inputSchema: unknown;
    isGenerated: boolean | null;
    createdAt: Date;
    version: number;
  } | null;
  open: boolean;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
  usageStats?: { count: number; bots: Array<{ id: string; name: string }> };
}

export function ToolDetailPanel({
  tool,
  open,
  onClose,
  onEdit,
  onDelete,
  usageStats,
}: ToolDetailPanelProps) {
  const schema = ((tool?.inputSchema) || {}) as Record<string, unknown>;
  const properties = (schema.properties || {}) as Record<string, Record<string, unknown>>;
  const required = (schema.required || []) as string[];
  const hasParams = Object.keys(properties).length > 0;

  return (
    <SlidePanel
      open={open}
      onOpenChange={(isOpen) => { if (!isOpen) onClose(); }}
      title={tool?.name ?? ''}
      description={tool?.isGenerated ? 'Auto-generated tool' : 'Custom workspace tool'}
      footer={
        <SlidePanelFooter>
          <Button variant="outline" size="sm" onClick={onEdit}>
            <Pencil className="h-4 w-4 mr-1.5" />
            Edit
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={onDelete}
            className="text-destructive hover:text-destructive"
          >
            <Trash2 className="h-4 w-4 mr-1.5" />
            Delete
          </Button>
        </SlidePanelFooter>
      }
    >
      {tool && (
        <div className="space-y-6">
          {/* Description */}
          <div>
            <h3 className="text-sm font-medium text-muted-foreground mb-1">Description</h3>
            <p className="text-sm">{tool.description}</p>
          </div>

          {/* Parameters */}
          <div>
            <h3 className="text-sm font-medium text-muted-foreground mb-2">Input Parameters</h3>
            {hasParams ? (
              <div className="space-y-2">
                {Object.entries(properties).map(([name, def]) => (
                  <div key={name} className="flex items-start gap-2 rounded-md border p-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <code className="text-sm font-mono font-semibold">{name}</code>
                        <Badge variant="outline" className="text-xs">
                          {def.type as string}
                        </Badge>
                        {required.includes(name) && (
                          <Badge variant="destructive" className="text-xs">required</Badge>
                        )}
                      </div>
                      {typeof def.description === 'string' && (
                        <p className="text-xs text-muted-foreground mt-1">
                          {def.description}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No parameters defined.</p>
            )}
          </div>

          {/* Implementation */}
          <div>
            <h3 className="text-sm font-medium text-muted-foreground mb-2">Implementation</h3>
            <pre className="rounded-md bg-muted p-4 text-sm font-mono overflow-x-auto whitespace-pre-wrap">
              {tool.code}
            </pre>
          </div>

          {/* Usage Stats */}
          {usageStats && usageStats.count > 0 && (
            <div>
              <h3 className="text-sm font-medium text-muted-foreground mb-2">
                Used by {usageStats.count} BaleyBot{usageStats.count !== 1 ? 's' : ''}
              </h3>
              <div className="flex flex-wrap gap-2">
                {usageStats.bots.map((bot) => (
                  <Badge key={bot.id} variant="outline" className="text-xs">
                    {bot.name}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Metadata */}
          <div className="text-xs text-muted-foreground space-y-1">
            <p>Created: {formatDate(tool.createdAt)}</p>
            <p>Version: {tool.version}</p>
          </div>

          {/* Usage hint */}
          <div className="rounded-md border border-dashed p-3">
            <p className="text-xs text-muted-foreground">
              <strong>Usage in BAL:</strong> Add <code className="font-mono">&quot;{tool.name}&quot;</code> to your BaleyBot&apos;s <code className="font-mono">&quot;tools&quot;</code> array.
            </p>
          </div>
        </div>
      )}
    </SlidePanel>
  );
}
