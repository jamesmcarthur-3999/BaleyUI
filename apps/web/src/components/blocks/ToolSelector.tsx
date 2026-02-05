'use client';

import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';

interface Tool {
  id: string;
  name: string;
  description?: string | null;
  type?: string;
}

interface ToolSelectorProps {
  tools: Tool[];
  selectedToolIds: string[];
  onChange: (toolIds: string[]) => void;
}

export function ToolSelector({ tools, selectedToolIds, onChange }: ToolSelectorProps) {
  const handleToggle = (toolId: string, checked: boolean) => {
    if (checked) {
      onChange([...selectedToolIds, toolId]);
    } else {
      onChange(selectedToolIds.filter((id) => id !== toolId));
    }
  };

  if (!tools || tools.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Tools</CardTitle>
          <CardDescription>
            No tools available. Create tools in your workspace to use them in blocks.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Tools</CardTitle>
        <CardDescription>
          Select the tools this block can use during execution
        </CardDescription>
        {selectedToolIds.length > 0 && (
          <div className="flex items-center gap-2 pt-2">
            <span className="text-sm text-muted-foreground">Selected:</span>
            <Badge variant="secondary">{selectedToolIds.length}</Badge>
          </div>
        )}
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[300px] pr-4">
          <div className="space-y-4">
            {tools.map((tool) => {
              const isSelected = selectedToolIds.includes(tool.id);
              return (
                <div
                  key={tool.id}
                  className="flex items-start space-x-3 rounded-lg border p-4 hover:bg-accent/50 transition-colors"
                >
                  <Checkbox
                    id={`tool-${tool.id}`}
                    checked={isSelected}
                    onCheckedChange={(checked) =>
                      handleToggle(tool.id, checked as boolean)
                    }
                  />
                  <div className="flex-1 space-y-1">
                    <Label
                      htmlFor={`tool-${tool.id}`}
                      className="cursor-pointer font-medium"
                    >
                      {tool.name}
                    </Label>
                    {tool.description && (
                      <p className="text-sm text-muted-foreground">
                        {tool.description}
                      </p>
                    )}
                    {tool.type && (
                      <Badge variant="outline" className="text-xs">
                        {tool.type}
                      </Badge>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
