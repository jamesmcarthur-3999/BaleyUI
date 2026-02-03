'use client';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { trpc } from '@/lib/trpc/client';

interface ModelSelectorProps {
  connectionId: string | null;
  value: string | null;
  onChange: (value: string) => void;
}

// Predefined models for OpenAI and Anthropic
const OPENAI_MODELS = [
  { id: 'gpt-4', name: 'GPT-4' },
  { id: 'gpt-4-turbo', name: 'GPT-4 Turbo' },
  { id: 'gpt-4-turbo-preview', name: 'GPT-4 Turbo Preview' },
  { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo' },
  { id: 'gpt-3.5-turbo-16k', name: 'GPT-3.5 Turbo 16K' },
];

const ANTHROPIC_MODELS = [
  { id: 'claude-3-opus-20240229', name: 'Claude 3 Opus' },
  { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet' },
  { id: 'claude-3-sonnet-20240229', name: 'Claude 3 Sonnet' },
  { id: 'claude-3-haiku-20240307', name: 'Claude 3 Haiku' },
];

function getModelsForConnection(connection: { type: string; availableModels?: unknown } | undefined) {
  if (!connection) return [];

  switch (connection.type) {
    case 'openai':
      return OPENAI_MODELS;
    case 'anthropic':
      return ANTHROPIC_MODELS;
    case 'ollama':
      // For Ollama, use the availableModels from the connection
      if (connection.availableModels && Array.isArray(connection.availableModels)) {
        return connection.availableModels.map((model: any) => ({
          id: model.name || model,
          name: model.name || model,
        }));
      }
      return [];
    default:
      return [];
  }
}

export function ModelSelector({ connectionId, value, onChange }: ModelSelectorProps) {
  // Fetch connections to get the connection type
  const { data: connections } = trpc.connections.list.useQuery();

  const connection = connections?.find((c) => c.id === connectionId);
  const availableModels = getModelsForConnection(connection);

  if (!connectionId) {
    return (
      <Select disabled>
        <SelectTrigger>
          <SelectValue placeholder="Select a connection first" />
        </SelectTrigger>
      </Select>
    );
  }

  if (!connection) {
    return (
      <Select disabled>
        <SelectTrigger>
          <SelectValue placeholder="Loading connection..." />
        </SelectTrigger>
      </Select>
    );
  }

  return (
    <Select value={value || ''} onValueChange={onChange}>
      <SelectTrigger>
        <SelectValue placeholder="Select a model" />
      </SelectTrigger>
      <SelectContent>
        {availableModels.length === 0 ? (
          <SelectItem value="none" disabled>
            No models available
          </SelectItem>
        ) : (
          availableModels.map((model) => (
            <SelectItem key={model.id} value={model.id}>
              {model.name}
            </SelectItem>
          ))
        )}
      </SelectContent>
    </Select>
  );
}
