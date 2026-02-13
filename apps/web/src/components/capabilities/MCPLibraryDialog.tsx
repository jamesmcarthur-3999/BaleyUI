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
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Search,
  Plug,
  MessageSquare,
  Github,
  BookOpen,
  LayoutList,
  MapPin,
  Globe,
  Brain,
  CreditCard,
  Users,
  CheckCircle2,
  ExternalLink,
  Lock,
  Unlock,
  Key,
  Shield,
  Cloud,
  Zap,
  Phone,
  Bug,
  Cog,
  Database,
  Palette,
  Image,
  FolderOpen,
} from 'lucide-react';
import type { MCPLibraryEntry, MCPAuthMethod } from '@/lib/connections/mcp-library';
import { getMCPLibrary } from '@/lib/connections/mcp-library';
import { trpc } from '@/lib/trpc/client';
import { useToast } from '@/components/ui/use-toast';

const ICON_MAP: Record<string, React.ElementType> = {
  MessageSquare,
  Github,
  BookOpen,
  LayoutList,
  MapPin,
  Search,
  Globe,
  Brain,
  CreditCard,
  Users,
  Plug,
  Shield,
  Cloud,
  Zap,
  Phone,
  Bug,
  Cog,
  Database,
  Palette,
  Image,
  FolderOpen,
};

const AUTH_BADGES: Record<MCPAuthMethod, { label: string; icon: React.ElementType; className: string }> = {
  open: { label: 'No auth', icon: Unlock, className: 'bg-green-500/10 text-green-700 dark:text-green-400' },
  api_key: { label: 'API key', icon: Key, className: 'bg-amber-500/10 text-amber-700 dark:text-amber-400' },
  oauth: { label: 'OAuth', icon: Lock, className: 'bg-blue-500/10 text-blue-700 dark:text-blue-400' },
};

const CATEGORIES = [
  { id: 'all', label: 'All' },
  { id: 'developer', label: 'Developer' },
  { id: 'payments', label: 'Payments' },
  { id: 'productivity', label: 'Productivity' },
  { id: 'data', label: 'Data' },
  { id: 'design', label: 'Design' },
  { id: 'communication', label: 'Communication' },
  { id: 'crm', label: 'CRM' },
  { id: 'automation', label: 'Automation' },
] as const;

type Step = 'browse' | 'install';

interface MCPLibraryDialogProps {
  onInstalled?: () => void;
}

export function MCPLibraryDialog({ onInstalled }: MCPLibraryDialogProps) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>('browse');
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<string>('all');
  const [selected, setSelected] = useState<MCPLibraryEntry | null>(null);
  const [credentials, setCredentials] = useState<Record<string, string>>({});
  const [installing, setInstalling] = useState(false);

  const createConnection = trpc.connections.create.useMutation();
  const testConnection = trpc.connections.test.useMutation();

  const library = getMCPLibrary();

  const filtered = library.filter((entry) => {
    const matchesCategory = category === 'all' || entry.category === category;
    const matchesSearch =
      !search ||
      entry.name.toLowerCase().includes(search.toLowerCase()) ||
      entry.description.toLowerCase().includes(search.toLowerCase()) ||
      entry.tags.some((t) => t.includes(search.toLowerCase()));
    return matchesCategory && matchesSearch;
  });

  const handleSelect = (entry: MCPLibraryEntry) => {
    setSelected(entry);
    setCredentials({});
    setStep('install');
  };

  const handleInstall = async () => {
    if (!selected) return;
    setInstalling(true);

    try {
      // Build config from template
      const config: Record<string, unknown> = {
        ...selected.configTemplate,
        catalogId: selected.id,
      };

      // Set auth token from the first password credential
      const tokenCred = selected.requiredCredentials.find(
        (c) => c.type === 'password'
      );
      if (tokenCred && credentials[tokenCred.name]) {
        config.authToken = credentials[tokenCred.name];
        config.authType = 'bearer';
      }

      const connection = await createConnection.mutateAsync({
        type: 'mcp',
        name: selected.name,
        config,
        initialStatus: 'unconfigured',
      });

      // Auto-test the connection
      try {
        const result = await testConnection.mutateAsync({ id: connection!.id });
        if (result.success) {
          toast({ title: `${selected.name} connected! Discovered ${result.details?.toolCount ?? 0} tools.` });
          setOpen(false);
          resetForm();
          onInstalled?.();
        } else {
          toast({ title: 'Connection test failed', description: result.message, variant: 'destructive' });
        }
      } catch {
        toast({ title: `${selected.name} saved`, description: 'Connection test failed. The server may require OAuth authorization first.', variant: 'destructive' });
        setOpen(false);
        resetForm();
        onInstalled?.();
      }
    } catch (error) {
      toast({
        title: 'Failed to add MCP server',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setInstalling(false);
    }
  };

  const resetForm = () => {
    setStep('browse');
    setSelected(null);
    setCredentials({});
    setSearch('');
  };

  const handleBack = () => {
    setStep('browse');
    setSelected(null);
    setCredentials({});
  };

  const Icon = selected ? (ICON_MAP[selected.icon] ?? Plug) : Plug;

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetForm(); }}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Plug className="h-4 w-4 mr-2" />
          Add MCP Server
        </Button>
      </DialogTrigger>
      <DialogContent size="xl" className="flex flex-col">
        <DialogHeader>
          <DialogTitle>
            {step === 'browse' ? 'MCP Server Library' : `Connect ${selected?.name}`}
          </DialogTitle>
        </DialogHeader>

        {step === 'browse' && (
          <>
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search MCP servers..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>

            {/* Category tabs */}
            <div className="flex gap-1.5 flex-wrap">
              {CATEGORIES.map((cat) => (
                <Button
                  key={cat.id}
                  variant={category === cat.id ? 'default' : 'ghost'}
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => setCategory(cat.id)}
                >
                  {cat.label}
                </Button>
              ))}
            </div>

            {/* Grid */}
            <ScrollArea className="flex-1 min-h-0">
              <div className="grid grid-cols-2 gap-3 pr-3">
                {filtered.map((entry) => {
                  const EntryIcon = ICON_MAP[entry.icon] ?? Plug;
                  const authBadge = AUTH_BADGES[entry.authMethod];
                  const AuthIcon = authBadge.icon;
                  return (
                    <button
                      key={entry.id}
                      onClick={() => handleSelect(entry)}
                      className="text-left p-3 rounded-lg border hover:border-primary/50 hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex items-center gap-2 mb-1.5">
                        <EntryIcon className="h-4 w-4 text-muted-foreground shrink-0" />
                        <span className="font-medium text-sm truncate">
                          {entry.name}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground line-clamp-2 mb-2">
                        {entry.description}
                      </p>
                      <div className="flex items-center gap-1.5">
                        <Badge variant="outline" className={`text-[10px] gap-0.5 ${authBadge.className}`}>
                          <AuthIcon className="h-2.5 w-2.5" />
                          {authBadge.label}
                        </Badge>
                        <Badge variant="outline" className="text-[10px]">
                          {entry.configTemplate.transportType.toUpperCase()}
                        </Badge>
                      </div>
                    </button>
                  );
                })}
                {filtered.length === 0 && (
                  <div className="col-span-2 py-8 text-center text-sm text-muted-foreground">
                    No MCP servers found matching your search.
                  </div>
                )}
              </div>
            </ScrollArea>
          </>
        )}

        {step === 'install' && selected && (
          <div className="space-y-4">
            {/* Server info */}
            <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
              <Icon className="h-5 w-5 text-muted-foreground mt-0.5" />
              <div className="min-w-0">
                <div className="font-medium text-sm">{selected.name}</div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {selected.description}
                </p>
                <div className="flex items-center gap-2 mt-2">
                  <Badge variant="outline" className="text-[10px]">
                    {selected.configTemplate.transportType.toUpperCase()}
                  </Badge>
                  <Badge variant="outline" className="text-[10px]">
                    {selected.category}
                  </Badge>
                  {selected.docsUrl && (
                    <a
                      href={selected.docsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-primary hover:underline flex items-center gap-1"
                    >
                      Docs <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>
                <p className="text-[11px] text-muted-foreground mt-1.5 font-mono">
                  {selected.configTemplate.url}
                </p>
              </div>
            </div>

            {/* Credentials form */}
            {selected.requiredCredentials.length > 0 ? (
              <div className="space-y-3">
                <h4 className="text-sm font-medium">
                  {selected.authMethod === 'oauth' ? 'Authentication' : 'Credentials'}
                </h4>
                {selected.authMethod === 'oauth' && (
                  <p className="text-xs text-muted-foreground">
                    This server uses OAuth. You may need to generate an access token from their developer portal first.
                  </p>
                )}
                {selected.requiredCredentials.map((cred) => (
                  <div key={cred.name} className="space-y-1.5">
                    <Label htmlFor={cred.name} className="text-xs">
                      {cred.label}
                      {cred.helpUrl && (
                        <a
                          href={cred.helpUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary hover:underline ml-1.5"
                        >
                          (Get one)
                        </a>
                      )}
                    </Label>
                    <Input
                      id={cred.name}
                      type={cred.type === 'password' ? 'password' : 'text'}
                      placeholder={cred.placeholder}
                      value={credentials[cred.name] ?? ''}
                      onChange={(e) =>
                        setCredentials((prev) => ({
                          ...prev,
                          [cred.name]: e.target.value,
                        }))
                      }
                    />
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <CheckCircle2 className="h-4 w-4 text-green-500" />
                No credentials required. Ready to connect.
              </div>
            )}

            {/* Actions */}
            <div className="flex justify-between pt-2">
              <Button variant="ghost" size="sm" onClick={handleBack}>
                Back
              </Button>
              <Button
                size="sm"
                onClick={handleInstall}
                loading={installing}
                loadingText="Installing..."
                disabled={
                  selected.requiredCredentials.some(
                    (c) => !credentials[c.name]?.trim()
                  )
                }
              >
                <Plug className="h-4 w-4 mr-2" />
                Connect
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
