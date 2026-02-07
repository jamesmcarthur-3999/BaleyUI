// apps/web/src/components/creator/InlineConnectionForm.tsx
'use client';

import { useState } from 'react';
import { trpc } from '@/lib/trpc/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';
import { CheckCircle2, Loader2, X, ChevronDown, AlertCircle } from 'lucide-react';

type FormMode = 'ai' | 'database';
type AiProvider = 'openai' | 'anthropic' | 'ollama';
type DbProvider = 'postgres' | 'mysql';

interface InlineConnectionFormProps {
  mode: FormMode;
  /** Pre-select a database provider (e.g. when user clicks "Add" on a mysql requirement) */
  defaultDbProvider?: DbProvider;
  /** Existing connection names, used to deduplicate auto-generated names */
  existingNames?: string[];
  onSuccess?: () => void;
  onCancel?: () => void;
  className?: string;
}

const AI_PROVIDERS: { value: AiProvider; label: string }[] = [
  { value: 'openai', label: 'OpenAI' },
  { value: 'anthropic', label: 'Anthropic' },
  { value: 'ollama', label: 'Ollama' },
];

const DB_PROVIDERS: { value: DbProvider; label: string }[] = [
  { value: 'postgres', label: 'PostgreSQL' },
  { value: 'mysql', label: 'MySQL' },
];

function autoName(provider: string, existingNames: string[]): string {
  const labels: Record<string, string> = {
    openai: 'My OpenAI Connection',
    anthropic: 'My Anthropic Connection',
    ollama: 'My Ollama Connection',
    postgres: 'My Postgres Connection',
    mysql: 'My MySQL Connection',
  };
  const base = labels[provider] ?? `My ${provider} Connection`;
  if (!existingNames.includes(base)) return base;
  // Deduplicate: "My OpenAI Connection 2", "My OpenAI Connection 3", ...
  for (let i = 2; i <= 20; i++) {
    const candidate = `${base} ${i}`;
    if (!existingNames.includes(candidate)) return candidate;
  }
  return `${base} ${Date.now()}`;
}

/**
 * Simplified inline connection form for the BB creation flow.
 * AI mode: provider picker + API key. Database mode: provider picker + connection URL.
 * Advanced settings are collapsed by default.
 */
export function InlineConnectionForm({
  mode,
  defaultDbProvider,
  existingNames = [],
  onSuccess,
  onCancel,
  className,
}: InlineConnectionFormProps) {
  // Provider selection
  const [aiProvider, setAiProvider] = useState<AiProvider>('openai');
  const [dbProvider, setDbProvider] = useState<DbProvider>(defaultDbProvider ?? 'postgres');

  // Form fields
  const [apiKey, setApiKey] = useState('');
  const [connectionUrl, setConnectionUrl] = useState('');
  const [showManualDb, setShowManualDb] = useState(false);
  const [dbHost, setDbHost] = useState('');
  const [dbPort, setDbPort] = useState('');
  const [dbUser, setDbUser] = useState('');
  const [dbPass, setDbPass] = useState('');
  const [dbName, setDbName] = useState('');

  // Advanced fields
  const [baseUrl, setBaseUrl] = useState('');
  const [organization, setOrganization] = useState('');
  const [ssl, setSsl] = useState(true);
  const [schema, setSchema] = useState('');

  // State
  const [status, setStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  const utils = trpc.useUtils();
  const createMutation = trpc.connections.create.useMutation();
  const testMutation = trpc.connections.test.useMutation();

  const provider = mode === 'ai' ? aiProvider : dbProvider;

  function buildConfig() {
    if (mode === 'ai') {
      const config: Record<string, unknown> = {};
      if (apiKey) config.apiKey = apiKey;
      if (baseUrl) config.baseUrl = baseUrl;
      if (organization) config.organization = organization;
      return config;
    }

    // Database mode
    if (!showManualDb && connectionUrl) {
      return { connectionUrl };
    }

    const config: Record<string, unknown> = {};
    if (dbHost) config.host = dbHost;
    if (dbPort) config.port = parseInt(dbPort, 10);
    if (dbUser) config.username = dbUser;
    if (dbPass) config.password = dbPass;
    if (dbName) config.database = dbName;
    if (!ssl) config.ssl = false;
    if (schema) config.schema = schema;
    return config;
  }

  function isValid(): boolean {
    if (mode === 'ai') {
      // Ollama doesn't require an API key
      if (aiProvider === 'ollama') return true;
      return apiKey.length >= 10;
    }
    if (!showManualDb) {
      return connectionUrl.length > 0;
    }
    return dbHost.length > 0 && dbName.length > 0;
  }

  async function handleTestAndSave() {
    setStatus('testing');
    setErrorMessage('');

    try {
      // Test first
      const testResult = await testMutation.mutateAsync({
        type: provider,
        config: buildConfig(),
      });

      if (!testResult.success) {
        setStatus('error');
        setErrorMessage(testResult.message ?? 'Connection test failed');
        return;
      }

      // Create the connection
      await createMutation.mutateAsync({
        type: provider,
        name: autoName(provider, existingNames),
        config: buildConfig(),
      });

      setStatus('success');
      await utils.connections.list.invalidate();

      // Auto-close after brief success display
      setTimeout(() => {
        onSuccess?.();
      }, 1500);
    } catch (err) {
      setStatus('error');
      setErrorMessage(
        err instanceof Error ? err.message : 'Failed to save connection'
      );
    }
  }

  if (status === 'success') {
    return (
      <div className={cn('rounded-lg border border-green-500/30 bg-green-500/5 p-4', className)}>
        <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
          <CheckCircle2 className="h-5 w-5" />
          <span className="text-sm font-medium">Connection created successfully!</span>
        </div>
      </div>
    );
  }

  return (
    <div className={cn('rounded-lg border border-border p-4 space-y-4', className)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium">
          {mode === 'ai' ? 'Add AI Provider' : 'Add Database Connection'}
        </h4>
        {onCancel && (
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onCancel}>
            <X className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>

      {/* Provider picker */}
      <div className="flex gap-2">
        {(mode === 'ai' ? AI_PROVIDERS : DB_PROVIDERS).map((p) => (
          <Button
            key={p.value}
            variant={provider === p.value ? 'default' : 'outline'}
            size="sm"
            onClick={() => {
              if (mode === 'ai') setAiProvider(p.value as AiProvider);
              else setDbProvider(p.value as DbProvider);
              setStatus('idle');
              setErrorMessage('');
            }}
          >
            {p.label}
          </Button>
        ))}
      </div>

      {/* Main field */}
      {mode === 'ai' ? (
        <div className="space-y-1.5">
          <Label htmlFor="api-key" className="text-xs">
            {aiProvider === 'ollama' ? 'Base URL (optional)' : 'API Key'}
          </Label>
          {aiProvider === 'ollama' ? (
            <Input
              id="api-key"
              type="url"
              placeholder="http://localhost:11434"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
            />
          ) : (
            <Input
              id="api-key"
              type="password"
              placeholder={aiProvider === 'openai' ? 'sk-...' : 'sk-ant-...'}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              autoFocus
            />
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {!showManualDb ? (
            <div className="space-y-1.5">
              <Label htmlFor="conn-url" className="text-xs">Connection URL</Label>
              <Input
                id="conn-url"
                type="password"
                placeholder={dbProvider === 'postgres' ? 'postgres://user:pass@host:5432/db' : 'mysql://user:pass@host:3306/db'}
                value={connectionUrl}
                onChange={(e) => setConnectionUrl(e.target.value)}
                autoFocus
              />
              <button
                type="button"
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                onClick={() => setShowManualDb(true)}
              >
                Enter fields manually instead
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label htmlFor="db-host" className="text-xs">Host</Label>
                  <Input id="db-host" placeholder="localhost" value={dbHost} onChange={(e) => setDbHost(e.target.value)} autoFocus />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="db-port" className="text-xs">Port</Label>
                  <Input id="db-port" placeholder={dbProvider === 'postgres' ? '5432' : '3306'} value={dbPort} onChange={(e) => setDbPort(e.target.value)} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label htmlFor="db-user" className="text-xs">Username</Label>
                  <Input id="db-user" value={dbUser} onChange={(e) => setDbUser(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="db-pass" className="text-xs">Password</Label>
                  <Input id="db-pass" type="password" value={dbPass} onChange={(e) => setDbPass(e.target.value)} />
                </div>
              </div>
              <div className="space-y-1">
                <Label htmlFor="db-name" className="text-xs">Database</Label>
                <Input id="db-name" value={dbName} onChange={(e) => setDbName(e.target.value)} />
              </div>
              <button
                type="button"
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                onClick={() => setShowManualDb(false)}
              >
                Use connection URL instead
              </button>
            </div>
          )}
        </div>
      )}

      {/* Advanced settings (collapsed) */}
      <Collapsible>
        <CollapsibleTrigger className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
          <ChevronDown className="h-3 w-3" />
          Advanced settings
        </CollapsibleTrigger>
        <CollapsibleContent className="pt-2 space-y-2">
          {mode === 'ai' && aiProvider !== 'ollama' && (
            <>
              <div className="space-y-1">
                <Label htmlFor="base-url" className="text-xs">Base URL (optional)</Label>
                <Input id="base-url" type="url" placeholder="https://api.openai.com/v1" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} />
              </div>
              {aiProvider === 'openai' && (
                <div className="space-y-1">
                  <Label htmlFor="org" className="text-xs">Organization (optional)</Label>
                  <Input id="org" placeholder="org-..." value={organization} onChange={(e) => setOrganization(e.target.value)} />
                </div>
              )}
            </>
          )}
          {mode === 'database' && (
            <>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="ssl"
                  checked={ssl}
                  onChange={(e) => setSsl(e.target.checked)}
                  className="rounded border-border"
                />
                <Label htmlFor="ssl" className="text-xs">Use SSL</Label>
              </div>
              <div className="space-y-1">
                <Label htmlFor="schema" className="text-xs">Schema (optional)</Label>
                <Input id="schema" placeholder="public" value={schema} onChange={(e) => setSchema(e.target.value)} />
              </div>
            </>
          )}
        </CollapsibleContent>
      </Collapsible>

      {/* Error display */}
      {status === 'error' && errorMessage && (
        <div className="rounded-md border border-red-500/30 bg-red-500/5 p-2.5 flex items-start gap-2">
          <AlertCircle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
          <p className="text-xs text-red-600 dark:text-red-400">{errorMessage}</p>
        </div>
      )}

      {/* Test + Save button */}
      <Button
        className="w-full"
        disabled={!isValid() || status === 'testing'}
        onClick={handleTestAndSave}
      >
        {status === 'testing' ? (
          <>
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            Testing connection...
          </>
        ) : (
          'Test & Save'
        )}
      </Button>
    </div>
  );
}
