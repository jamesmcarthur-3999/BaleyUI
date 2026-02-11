'use client';

import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { trpc } from '@/lib/trpc/client';
import { useToast } from '@/components/ui/use-toast';
import { Search, ExternalLink, Check, AlertTriangle, Loader2, Trash2, Eye, EyeOff } from 'lucide-react';

interface ToolService {
  id: string;
  name: string;
  provider: string;
  tool: string;
  description: string;
  configured: boolean;
  source: 'env' | 'workspace' | null;
  envVar: string;
  signUpUrl: string;
}

const TOOL_ICONS: Record<string, typeof Search> = {
  tavily: Search,
};

export function ToolServiceCard({
  service,
  onSaved,
}: {
  service: ToolService;
  onSaved?: () => void;
}) {
  const Icon = TOOL_ICONS[service.id] ?? Search;
  const { toast } = useToast();
  const [apiKey, setApiKey] = useState('');
  const [showInput, setShowInput] = useState(false);
  const [showKey, setShowKey] = useState(false);

  const saveMutation = trpc.connections.saveToolServiceKey.useMutation({
    onSuccess: () => {
      toast({ title: 'API Key Saved', description: `${service.provider} API key has been saved and encrypted.` });
      setApiKey('');
      setShowInput(false);
      onSaved?.();
    },
    onError: (error) => {
      toast({ title: 'Save Failed', description: error.message, variant: 'destructive' });
    },
  });

  const removeMutation = trpc.connections.removeToolServiceKey.useMutation({
    onSuccess: () => {
      toast({ title: 'API Key Removed', description: `${service.provider} API key has been removed.` });
      onSaved?.();
    },
    onError: (error) => {
      toast({ title: 'Remove Failed', description: error.message, variant: 'destructive' });
    },
  });

  function handleSave() {
    if (!apiKey.trim()) return;
    saveMutation.mutate({
      serviceId: service.id as 'tavily',
      apiKey: apiKey.trim(),
    });
  }

  function handleRemove() {
    removeMutation.mutate({ serviceId: service.id as 'tavily' });
  }

  const isSaving = saveMutation.isPending;
  const isRemoving = removeMutation.isPending;
  const isFromEnv = service.source === 'env';

  return (
    <Card className={cn(!service.configured && 'border-dashed')}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span
              className={cn(
                'inline-block h-2.5 w-2.5 rounded-full shrink-0',
                service.configured ? 'bg-green-500' : 'bg-amber-400'
              )}
            />
            <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
            <CardTitle className="truncate text-base">
              {service.name}
            </CardTitle>
          </div>
          <Badge variant="secondary">{service.provider}</Badge>
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-xs text-muted-foreground mb-3">
          {service.description}
        </p>

        {/* Status banner */}
        {service.configured ? (
          <div className="flex items-center justify-between text-xs text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-950/30 rounded-md px-2 py-1.5 mb-3">
            <span className="flex items-center gap-1.5">
              <Check className="h-3.5 w-3.5 shrink-0" />
              {isFromEnv ? (
                <span>Configured via <code className="font-mono">{service.envVar}</code></span>
              ) : (
                <span>API key saved in workspace</span>
              )}
            </span>
            {!isFromEnv && (
              <Button
                variant="ghost"
                size="sm"
                className="h-5 px-1 text-destructive hover:text-destructive"
                onClick={handleRemove}
                disabled={isRemoving}
              >
                {isRemoving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
              </Button>
            )}
          </div>
        ) : (
          <>
            {/* Key input form */}
            {showInput ? (
              <div className="space-y-2 mb-3">
                <div className="relative">
                  <Input
                    type={showKey ? 'text' : 'password'}
                    placeholder="tvly-..."
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSave()}
                    className="pr-8 font-mono text-xs h-8"
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={() => setShowKey(!showKey)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showKey ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <Button size="sm" onClick={handleSave} disabled={!apiKey.trim() || isSaving} className="h-7 text-xs">
                    {isSaving ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
                    Save Key
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => { setShowInput(false); setApiKey(''); }} className="h-7 text-xs">
                    Cancel
                  </Button>
                  <a
                    href={service.signUpUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ml-auto text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                  >
                    Get a key <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 rounded-md px-2 py-1.5 mb-3">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                <span>Not configured — add an API key to enable</span>
              </div>
            )}
          </>
        )}

        {/* Footer */}
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-xs">
            {service.tool}
          </Badge>
          {!service.configured && !showInput && (
            <>
              <Button variant="outline" size="sm" onClick={() => setShowInput(true)} className="ml-auto">
                Add API Key
              </Button>
              <Button variant="ghost" size="sm" asChild>
                <a href={service.signUpUrl} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </Button>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
