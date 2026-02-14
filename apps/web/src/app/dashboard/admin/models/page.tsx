'use client';

import { useState } from 'react';
import { trpc } from '@/lib/trpc/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/use-toast';
import {
  Cpu,
  ChevronLeft,
  ChevronRight,
  Check,
  X,
  AlertTriangle,
  RefreshCw,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const TIER_COLORS: Record<string, string> = {
  fast: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300',
  balanced: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  powerful: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300',
  ultra: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
};

const PROVIDER_COLORS: Record<string, string> = {
  anthropic: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300',
  openai: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  google: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  meta: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300',
};

function formatNumber(n: number | null | undefined): string {
  if (n == null) return '-';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return n.toString();
}

function formatCost(cost: string | null | undefined): string {
  if (!cost) return '-';
  const n = parseFloat(cost);
  if (n === 0) return '$0';
  if (n < 0.01) return `$${n.toFixed(4)}`;
  return `$${n.toFixed(2)}`;
}

function CapabilityIcon({ value }: { value: boolean | undefined }) {
  if (value) return <Check className="h-3.5 w-3.5 text-emerald-500" />;
  return <X className="h-3.5 w-3.5 text-muted-foreground/40" />;
}

function QualityBadge({ value }: { value: string | undefined }) {
  if (!value) return <span className="text-muted-foreground/40">-</span>;
  const colors: Record<string, string> = {
    excellent: 'text-emerald-600 dark:text-emerald-400',
    good: 'text-blue-600 dark:text-blue-400',
    basic: 'text-muted-foreground',
  };
  return <span className={cn('text-xs font-medium', colors[value] ?? '')}>{value}</span>;
}

const PAGE_SIZE = 50;

export default function AdminModelsPage() {
  const { toast } = useToast();
  const [providerFilter, setProviderFilter] = useState<string | undefined>();
  const [tierFilter, setTierFilter] = useState<string | undefined>();
  const [page, setPage] = useState(0);
  const utils = trpc.useUtils();

  const { data: stats } = trpc.admin.getModelStats.useQuery();
  const { data, isLoading } = trpc.admin.listModels.useQuery({
    provider: providerFilter,
    tier: tierFilter,
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
  });

  const models = data?.models ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  const seedModels = trpc.admin.seedModels.useMutation({
    onSuccess: (result) => {
      toast({ title: `Seeded ${result.count} models` });
      utils.admin.listModels.invalidate();
      utils.admin.getModelStats.invalidate();
    },
    onError: (err) => {
      toast({ title: 'Failed to seed models', description: err.message, variant: 'destructive' });
    },
  });

  const providers = stats?.byProvider ?? [];
  const tiers = stats?.byTier ?? [];

  return (
    <div className="space-y-4">
      {/* Stats bar */}
      {stats && (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <span>{stats.total} models</span>
            {stats.deprecated > 0 && (
              <span className="flex items-center gap-1">
                <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                {stats.deprecated} deprecated
              </span>
            )}
          </div>
          {stats.total > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => seedModels.mutate()}
              disabled={seedModels.isPending}
            >
              <RefreshCw className={cn('h-4 w-4 mr-1', seedModels.isPending && 'animate-spin')} />
              Reseed
            </Button>
          )}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-muted-foreground mr-1">Provider:</span>
        <Button
          variant={!providerFilter ? 'default' : 'outline'}
          size="sm"
          onClick={() => { setProviderFilter(undefined); setPage(0); }}
        >
          All
        </Button>
        {providers.map((p) => (
          <Button
            key={p.provider}
            variant={providerFilter === p.provider ? 'default' : 'outline'}
            size="sm"
            onClick={() => { setProviderFilter(p.provider); setPage(0); }}
          >
            {p.provider} ({p.count})
          </Button>
        ))}

        <span className="text-sm text-muted-foreground ml-4 mr-1">Tier:</span>
        <Button
          variant={!tierFilter ? 'default' : 'outline'}
          size="sm"
          onClick={() => { setTierFilter(undefined); setPage(0); }}
        >
          All
        </Button>
        {tiers.map((t) => (
          <Button
            key={t.tier}
            variant={tierFilter === t.tier ? 'default' : 'outline'}
            size="sm"
            onClick={() => { setTierFilter(t.tier); setPage(0); }}
          >
            {t.tier} ({t.count})
          </Button>
        ))}
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center text-muted-foreground">Loading models...</div>
          ) : models.length === 0 ? (
            <div className="p-8 text-center">
              <Cpu className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
              <p className="text-muted-foreground">No models found</p>
              <p className="text-xs text-muted-foreground mt-1 mb-4">
                The ai_models table is empty. Seed it with the current model catalog.
              </p>
              <Button
                onClick={() => seedModels.mutate()}
                disabled={seedModels.isPending}
              >
                {seedModels.isPending ? (
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Cpu className="h-4 w-4 mr-2" />
                )}
                Seed Model Library
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/60">
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Model</th>
                    <th className="text-left px-3 py-3 font-medium text-muted-foreground">Provider</th>
                    <th className="text-left px-3 py-3 font-medium text-muted-foreground">Tier</th>
                    <th className="text-left px-3 py-3 font-medium text-muted-foreground">Family</th>
                    <th className="text-right px-3 py-3 font-medium text-muted-foreground">Context</th>
                    <th className="text-right px-3 py-3 font-medium text-muted-foreground">Max Out</th>
                    <th className="text-right px-3 py-3 font-medium text-muted-foreground">In $/1M</th>
                    <th className="text-right px-3 py-3 font-medium text-muted-foreground">Out $/1M</th>
                    <th className="text-center px-2 py-3 font-medium text-muted-foreground" title="Reasoning">R</th>
                    <th className="text-center px-2 py-3 font-medium text-muted-foreground" title="Vision">V</th>
                    <th className="text-center px-2 py-3 font-medium text-muted-foreground" title="Tool Use">T</th>
                    <th className="text-center px-2 py-3 font-medium text-muted-foreground" title="Structured Output">S</th>
                    <th className="text-center px-3 py-3 font-medium text-muted-foreground">Code</th>
                    <th className="text-left px-3 py-3 font-medium text-muted-foreground">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {models.map((model) => {
                    const caps = (model.capabilities ?? {}) as Record<string, unknown>;
                    const isDeprecated = !!model.deprecatedAt;
                    const isSunset = !!model.sunsetAt && new Date(model.sunsetAt) < new Date();

                    return (
                      <tr
                        key={model.id}
                        className={cn(
                          'border-b border-border/30 hover:bg-muted/30 transition-colors',
                          (isDeprecated || isSunset) && 'opacity-60'
                        )}
                      >
                        <td className="px-4 py-2.5">
                          <p className="font-medium">{model.displayName}</p>
                          <p className="text-xs text-muted-foreground font-mono">{model.modelId}</p>
                        </td>
                        <td className="px-3 py-2.5">
                          <Badge
                            variant="secondary"
                            className={cn('text-[11px]', PROVIDER_COLORS[model.provider] ?? '')}
                          >
                            {model.provider}
                          </Badge>
                        </td>
                        <td className="px-3 py-2.5">
                          <Badge
                            variant="secondary"
                            className={cn('text-[11px]', TIER_COLORS[model.tier] ?? '')}
                          >
                            {model.tier}
                          </Badge>
                        </td>
                        <td className="px-3 py-2.5 text-muted-foreground">{model.family}</td>
                        <td className="px-3 py-2.5 text-right font-mono text-muted-foreground">
                          {formatNumber(model.contextWindow)}
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono text-muted-foreground">
                          {formatNumber(model.maxOutputTokens)}
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono text-muted-foreground">
                          {formatCost(model.inputCostPer1mTokens)}
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono text-muted-foreground">
                          {formatCost(model.outputCostPer1mTokens)}
                        </td>
                        <td className="px-2 py-2.5 text-center">
                          <CapabilityIcon value={caps.reasoning as boolean | undefined} />
                        </td>
                        <td className="px-2 py-2.5 text-center">
                          <CapabilityIcon value={caps.vision as boolean | undefined} />
                        </td>
                        <td className="px-2 py-2.5 text-center">
                          <CapabilityIcon value={caps.toolUse as boolean | undefined} />
                        </td>
                        <td className="px-2 py-2.5 text-center">
                          <CapabilityIcon value={caps.structuredOutput as boolean | undefined} />
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          <QualityBadge value={caps.codeGeneration as string | undefined} />
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="flex items-center gap-1.5">
                            {model.isLatest && (
                              <Badge variant="secondary" className="text-[10px] bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300">
                                Latest
                              </Badge>
                            )}
                            {model.isDefault && (
                              <Badge variant="secondary" className="text-[10px] bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">
                                Default
                              </Badge>
                            )}
                            {isDeprecated && (
                              <Badge variant="secondary" className="text-[10px] bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
                                Deprecated
                              </Badge>
                            )}
                            {isSunset && (
                              <Badge variant="destructive" className="text-[10px]">
                                Sunset
                              </Badge>
                            )}
                            {!model.sdkSupported && (
                              <Badge variant="outline" className="text-[10px]">
                                No SDK
                              </Badge>
                            )}
                            {!isDeprecated && !isSunset && !model.isLatest && !model.isDefault && model.sdkSupported && (
                              <span className="text-muted-foreground/40 text-xs">-</span>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">
            Page {page + 1} of {totalPages}
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(page - 1)}
              disabled={page === 0}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(page + 1)}
              disabled={page >= totalPages - 1}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
