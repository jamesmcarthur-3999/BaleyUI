'use client';

import { useState } from 'react';
import { AIBlockEditor } from './AIBlockEditor';
import { FunctionBlockEditor } from './FunctionBlockEditor';
import { ExecutionModeSelector } from './ExecutionModeSelector';
import { HybridSettings } from './HybridSettings';
import { FallbackLog } from './FallbackLog';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/components/ui/use-toast';
import { trpc } from '@/lib/trpc/client';
import { Save, Loader2 } from 'lucide-react';
import type { ExecutionMode } from './ExecutionModeSelector';

interface BlockEditorProps {
  block: any;
}

export function BlockEditor({ block }: BlockEditorProps) {
  const { toast } = useToast();
  const utils = trpc.useUtils();

  const [name, setName] = useState(block.name);
  const [description, setDescription] = useState(block.description || '');
  const [blockData, setBlockData] = useState(block);
  const [executionMode, setExecutionMode] = useState<ExecutionMode>(
    (block.executionMode as ExecutionMode) || 'ai_only'
  );
  const [hybridThreshold, setHybridThreshold] = useState<number>(
    parseFloat(block.hybridThreshold || '80')
  );

  const updateMutation = trpc.blocks.update.useMutation({
    onSuccess: () => {
      toast({
        title: 'Block Updated',
        description: 'Your changes have been saved successfully.',
      });
      utils.blocks.getById.invalidate({ id: block.id });
      utils.blocks.list.invalidate();
    },
    onError: (error) => {
      toast({
        title: 'Failed to Update Block',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const updateExecutionModeMutation = trpc.blocks.updateExecutionMode.useMutation({
    onSuccess: () => {
      toast({
        title: 'Execution Mode Updated',
        description: 'The execution mode has been changed successfully.',
      });
      utils.blocks.getById.invalidate({ id: block.id });
    },
    onError: (error) => {
      toast({
        title: 'Failed to Update Execution Mode',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const updateHybridSettingsMutation = trpc.blocks.updateHybridSettings.useMutation({
    onSuccess: () => {
      toast({
        title: 'Hybrid Settings Updated',
        description: 'Your hybrid mode settings have been saved.',
      });
      utils.blocks.getById.invalidate({ id: block.id });
    },
    onError: (error) => {
      toast({
        title: 'Failed to Update Hybrid Settings',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const { data: fallbackLogs, isLoading: isLoadingFallbacks } = trpc.blocks.getFallbackLogs.useQuery(
    { blockId: block.id },
    { enabled: block.type === 'ai' }
  );

  const handleSave = () => {
    updateMutation.mutate({
      id: block.id,
      version: block.version,
      name,
      description,
      ...blockData,
    });
  };

  const handleBlockDataChange = (data: any) => {
    setBlockData((prev: any) => ({ ...prev, ...data }));
  };

  const handleExecutionModeChange = (mode: ExecutionMode) => {
    setExecutionMode(mode);
    updateExecutionModeMutation.mutate({
      id: block.id,
      version: block.version,
      executionMode: mode,
    });
  };

  const handleHybridSettingsSave = () => {
    updateHybridSettingsMutation.mutate({
      id: block.id,
      version: block.version,
      hybridThreshold,
    });
  };

  return (
    <Tabs defaultValue="configuration" className="space-y-6">
      <TabsList>
        <TabsTrigger value="configuration">Configuration</TabsTrigger>
        {block.type === 'ai' && <TabsTrigger value="execution">Execution</TabsTrigger>}
      </TabsList>

      <TabsContent value="configuration" className="space-y-6">
        {/* Basic Information */}
        <Card>
          <CardContent className="pt-6">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Block Name</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Enter block name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Enter block description (optional)"
                  rows={3}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Type-Specific Editor */}
        {block.type === 'ai' && (
          <AIBlockEditor
            block={blockData}
            onChange={handleBlockDataChange}
          />
        )}

        {block.type === 'function' && (
          <FunctionBlockEditor
            block={blockData}
            onChange={handleBlockDataChange}
          />
        )}

        {/* Save Button */}
        <div className="flex justify-end gap-4">
          <Button
            onClick={handleSave}
            disabled={updateMutation.isPending}
            size="lg"
          >
            {updateMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="mr-2 h-4 w-4" />
                Save Changes
              </>
            )}
          </Button>
        </div>
      </TabsContent>

      {block.type === 'ai' && (
        <TabsContent value="execution" className="space-y-6">
          {/* Execution Mode Selector */}
          <ExecutionModeSelector
            value={executionMode}
            onChange={handleExecutionModeChange}
            hasGeneratedCode={!!block.generatedCode}
            codeAccuracy={block.codeAccuracy ? parseFloat(block.codeAccuracy) : null}
            disabled={updateExecutionModeMutation.isPending}
          />

          {/* Hybrid Settings (only show for hybrid mode) */}
          {executionMode === 'hybrid' && (
            <HybridSettings
              threshold={hybridThreshold}
              onThresholdChange={setHybridThreshold}
              onSave={handleHybridSettingsSave}
              isSaving={updateHybridSettingsMutation.isPending}
            />
          )}

          {/* Fallback Log */}
          <FallbackLog
            blockId={block.id}
            entries={fallbackLogs || []}
            isLoading={isLoadingFallbacks}
          />
        </TabsContent>
      )}
    </Tabs>
  );
}
