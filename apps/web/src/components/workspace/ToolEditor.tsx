'use client';

import { useState } from 'react';
import { X, Wrench, Save, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { WorkspaceTool } from './WorkspaceToolsList';

// ============================================================================
// TYPES
// ============================================================================

interface ToolEditorProps {
  tool?: WorkspaceTool | null;
  onSave: (tool: Omit<WorkspaceTool, 'id' | 'createdAt' | 'updatedAt'>) => Promise<void>;
  onClose: () => void;
  className?: string;
}

// ============================================================================
// COMPONENT
// ============================================================================

export function ToolEditor({ tool, onSave, onClose, className }: ToolEditorProps) {
  const isNew = !tool;

  const [name, setName] = useState(tool?.name ?? '');
  const [description, setDescription] = useState(tool?.description ?? '');
  const [implementation, setImplementation] = useState('');
  const [inputSchemaStr, setInputSchemaStr] = useState(
    tool?.inputSchema ? JSON.stringify(tool.inputSchema, null, 2) : `{
  "type": "object",
  "properties": {
    "input": {
      "type": "string",
      "description": "Input to the tool"
    }
  }
}`
  );

  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    setError(null);

    // Validate
    if (!name.trim()) {
      setError('Tool name is required');
      return;
    }

    if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(name)) {
      setError('Tool name must start with a letter and contain only letters, numbers, and underscores');
      return;
    }

    if (!description.trim()) {
      setError('Tool description is required');
      return;
    }

    // Parse input schema
    let inputSchema: Record<string, unknown>;
    try {
      inputSchema = JSON.parse(inputSchemaStr);
    } catch {
      setError('Invalid JSON in input schema');
      return;
    }

    setIsSaving(true);

    try {
      await onSave({
        name,
        description,
        source: tool?.source ?? 'custom',
        connectionName: tool?.connectionName,
        inputSchema,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save tool');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div
      className={cn(
        'fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50',
        className
      )}
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl max-h-[90vh] overflow-auto bg-card border border-border rounded-2xl shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border sticky top-0 bg-card">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-emerald-500/10">
              <Wrench className="h-5 w-5 text-emerald-500" />
            </div>
            <div>
              <h3 className="font-semibold">{isNew ? 'Create Tool' : 'Edit Tool'}</h3>
              <p className="text-sm text-muted-foreground">
                {isNew ? 'Create a new custom tool for your workspace' : `Editing ${tool.name}`}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-muted transition-colors"
          >
            <X className="h-5 w-5 text-muted-foreground" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Name */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">
              Name <span className="text-destructive">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="my_custom_tool"
              disabled={!isNew && tool?.source === 'connection'}
              className={cn(
                'w-full px-4 py-2.5 rounded-lg',
                'border border-border bg-background',
                'focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/50',
                'text-sm font-mono',
                'disabled:opacity-50 disabled:cursor-not-allowed'
              )}
            />
            <p className="text-xs text-muted-foreground">
              Alphanumeric and underscores only. Used to reference the tool in BAL code.
            </p>
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">
              Description <span className="text-destructive">*</span>
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe what this tool does..."
              rows={3}
              className={cn(
                'w-full px-4 py-2.5 rounded-lg',
                'border border-border bg-background',
                'focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/50',
                'text-sm resize-none'
              )}
            />
            <p className="text-xs text-muted-foreground">
              A clear description helps the AI understand when and how to use this tool.
            </p>
          </div>

          {/* Implementation (for new custom tools) */}
          {isNew && (
            <div className="space-y-1.5">
              <label className="text-sm font-medium">
                Implementation (Natural Language)
              </label>
              <textarea
                value={implementation}
                onChange={(e) => setImplementation(e.target.value)}
                placeholder="Describe how this tool should work. The AI will interpret this at runtime..."
                rows={4}
                className={cn(
                  'w-full px-4 py-2.5 rounded-lg',
                  'border border-border bg-background',
                  'focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/50',
                  'text-sm resize-none'
                )}
              />
              <p className="text-xs text-muted-foreground">
                Describe the tool&apos;s behavior in plain language. The AI will execute this when the tool is called.
              </p>
            </div>
          )}

          {/* Input Schema */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Input Schema (JSON)</label>
            <textarea
              value={inputSchemaStr}
              onChange={(e) => setInputSchemaStr(e.target.value)}
              rows={8}
              spellCheck={false}
              className={cn(
                'w-full px-4 py-2.5 rounded-lg',
                'border border-border bg-background',
                'focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/50',
                'text-sm font-mono resize-none'
              )}
            />
            <p className="text-xs text-muted-foreground">
              JSON Schema defining the tool&apos;s input parameters.
            </p>
          </div>

          {/* Error */}
          {error && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-border sticky bottom-0 bg-card">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm font-medium hover:bg-muted transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving}
            className={cn(
              'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium',
              'bg-primary text-primary-foreground',
              'hover:opacity-90 transition-opacity',
              'disabled:opacity-50 disabled:cursor-not-allowed'
            )}
          >
            {isSaving ? (
              <>
                <span className="h-4 w-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="h-4 w-4" />
                {isNew ? 'Create Tool' : 'Save Changes'}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
