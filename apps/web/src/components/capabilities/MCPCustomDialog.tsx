'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Settings2, Loader2, Plug, Wrench, AlertTriangle } from 'lucide-react';
import { trpc } from '@/lib/trpc/client';
import { useToast } from '@/components/ui/use-toast';

interface MCPCustomDialogProps {
  onCreated?: () => void;
}

export function MCPCustomDialog({ onCreated }: MCPCustomDialogProps) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [transportType, setTransportType] = useState<'http' | 'sse' | 'stdio'>('http');
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [command, setCommand] = useState('');
  const [args, setArgs] = useState('');
  const [authType, setAuthType] = useState<'none' | 'bearer' | 'basic'>('none');
  const [authToken, setAuthToken] = useState('');
  const [toolPrefix, setToolPrefix] = useState('');
  const [creating, setCreating] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; toolCount?: number; message?: string } | null>(null);

  const createConnection = trpc.connections.create.useMutation();
  const testConnection = trpc.connections.test.useMutation();

  const resetForm = () => {
    setName('');
    setUrl('');
    setCommand('');
    setArgs('');
    setAuthType('none');
    setAuthToken('');
    setToolPrefix('');
    setTestResult(null);
    setTransportType('http');
  };

  const handleCreate = async () => {
    if (!name.trim()) {
      toast({ title: 'Name is required', variant: 'destructive' });
      return;
    }

    setCreating(true);
    setTestResult(null);

    try {
      const config: Record<string, unknown> = {
        transportType,
        toolPrefix: toolPrefix || undefined,
      };

      if (transportType === 'stdio') {
        config.command = command;
        if (args.trim()) {
          config.args = args.split(/\s+/).filter(Boolean);
        }
      } else {
        config.url = url;
      }

      if (authType !== 'none' && authToken) {
        config.authType = authType;
        config.authToken = authToken;
      }

      const connection = await createConnection.mutateAsync({
        type: 'mcp',
        name: name.trim(),
        config,
        initialStatus: 'unconfigured',
      });

      // Auto-test
      try {
        const result = await testConnection.mutateAsync({ id: connection!.id });
        setTestResult({
          success: result.success,
          toolCount: result.details?.toolCount,
          message: result.message,
        });

        if (result.success) {
          toast({ title: `Connected! Discovered ${result.details?.toolCount ?? 0} tools.` });
          setOpen(false);
          resetForm();
          onCreated?.();
        } else {
          toast({ title: 'Connection test failed', description: result.message, variant: 'destructive' });
        }
      } catch {
        toast({ title: 'Connection created', description: 'Test failed. Check your server URL.', variant: 'destructive' });
      }
    } catch (error) {
      toast({
        title: 'Failed to create MCP connection',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setCreating(false);
    }
  };

  const isValid =
    name.trim() &&
    (transportType === 'stdio' ? command.trim() : url.trim());

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetForm(); }}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">
          <Settings2 className="h-4 w-4 mr-2" />
          Custom MCP
        </Button>
      </DialogTrigger>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>Custom MCP Server</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Name */}
          <div className="space-y-1.5">
            <Label htmlFor="mcp-name" className="text-xs">Connection Name</Label>
            <Input
              id="mcp-name"
              placeholder="My MCP Server"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          {/* Transport Type */}
          <div className="space-y-1.5">
            <Label className="text-xs">Transport Type</Label>
            <Select value={transportType} onValueChange={(v) => setTransportType(v as 'http' | 'sse' | 'stdio')}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="http">HTTP (Streamable)</SelectItem>
                <SelectItem value="sse">SSE (Server-Sent Events)</SelectItem>
                <SelectItem value="stdio">Stdio (Local Process)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Stdio warning */}
          {transportType === 'stdio' && (
            <div className="text-xs p-2 rounded-md bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400 flex items-start gap-2">
              <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              <span>
                Stdio transport spawns a local process and is not compatible with Vercel or serverless deployments. Use HTTP or SSE for remote servers.
              </span>
            </div>
          )}

          {/* URL (for http/sse) */}
          {transportType !== 'stdio' && (
            <div className="space-y-1.5">
              <Label htmlFor="mcp-url" className="text-xs">Server URL</Label>
              <Input
                id="mcp-url"
                type="url"
                placeholder="https://mcp.example.com"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
              />
            </div>
          )}

          {/* Command (for stdio) */}
          {transportType === 'stdio' && (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="mcp-command" className="text-xs">Command</Label>
                <Input
                  id="mcp-command"
                  placeholder="npx"
                  value={command}
                  onChange={(e) => setCommand(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="mcp-args" className="text-xs">Arguments (space-separated)</Label>
                <Input
                  id="mcp-args"
                  placeholder="-y @modelcontextprotocol/server-example"
                  value={args}
                  onChange={(e) => setArgs(e.target.value)}
                />
              </div>
            </>
          )}

          {/* Auth */}
          {transportType !== 'stdio' && (
            <>
              <div className="space-y-1.5">
                <Label className="text-xs">Authentication</Label>
                <Select value={authType} onValueChange={(v) => setAuthType(v as 'none' | 'bearer' | 'basic')}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    <SelectItem value="bearer">Bearer Token</SelectItem>
                    <SelectItem value="basic">Basic Auth</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {authType !== 'none' && (
                <div className="space-y-1.5">
                  <Label htmlFor="mcp-token" className="text-xs">
                    {authType === 'bearer' ? 'Bearer Token' : 'Password'}
                  </Label>
                  <Input
                    id="mcp-token"
                    type="password"
                    placeholder="••••••••"
                    value={authToken}
                    onChange={(e) => setAuthToken(e.target.value)}
                  />
                </div>
              )}
            </>
          )}

          {/* Tool Prefix */}
          <div className="space-y-1.5">
            <Label htmlFor="mcp-prefix" className="text-xs">
              Tool Prefix <span className="text-muted-foreground">(optional)</span>
            </Label>
            <Input
              id="mcp-prefix"
              placeholder="myserver_"
              value={toolPrefix}
              onChange={(e) => setToolPrefix(e.target.value)}
            />
          </div>

          {/* Test result */}
          {testResult && (
            <div className={`text-xs p-2 rounded-md flex items-center gap-2 ${
              testResult.success
                ? 'bg-green-50 text-green-700 dark:bg-green-950/30 dark:text-green-400'
                : 'bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-400'
            }`}>
              {testResult.success ? (
                <>
                  <Wrench className="h-3.5 w-3.5" />
                  Discovered {testResult.toolCount ?? 0} tools
                </>
              ) : (
                testResult.message ?? 'Connection test failed'
              )}
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-2">
            <Button
              onClick={handleCreate}
              disabled={!isValid || creating}
              size="sm"
            >
              {creating ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Plug className="h-4 w-4 mr-2" />
              )}
              Connect & Discover
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
