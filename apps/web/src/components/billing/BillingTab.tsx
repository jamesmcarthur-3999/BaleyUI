'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { UsageMeter } from './UsageMeter';
import { trpc } from '@/lib/trpc/client';
import { cn } from '@/lib/utils';
import {
  Zap,
  Hash,
  Bot,
  Radio,
  Laptop,
  Globe,
  Clock,
  BarChart3,
  Check,
  Lock,
  CreditCard,
  Crown,
} from 'lucide-react';

const PRO_FEATURES = [
  { key: 'websocket' as const, label: 'WebSocket Streaming', icon: Radio },
  { key: 'localRuntime' as const, label: 'Local Runtime', icon: Laptop },
  { key: 'webhookTriggers' as const, label: 'Webhook Triggers', icon: Globe },
  { key: 'scheduledTasks' as const, label: 'Scheduled Tasks', icon: Clock },
  { key: 'analytics' as const, label: 'Advanced Analytics', icon: BarChart3 },
];

export function BillingTab() {
  const { data: billing, isLoading } = trpc.analytics.getBilling.useQuery();
  const upgradeMutation = trpc.analytics.upgrade.useMutation();
  const manageBillingMutation = trpc.analytics.manageBilling.useMutation();

  const handleUpgrade = async () => {
    const result = await upgradeMutation.mutateAsync({ planId: 'pro' });
    if (result.url) {
      window.location.href = result.url;
    }
  };

  const handleManageBilling = async () => {
    const result = await manageBillingMutation.mutateAsync();
    if (result.url) {
      window.location.href = result.url;
    }
  };

  if (isLoading) {
    return (
      <div className="grid gap-4 md:grid-cols-2">
        <Skeleton className="h-48" />
        <Skeleton className="h-48" />
      </div>
    );
  }

  if (!billing) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-muted-foreground">
          Unable to load billing information.
        </CardContent>
      </Card>
    );
  }

  const isPaid = billing.planName.toLowerCase() !== 'free';
  const renewalDate = billing.subscription?.currentPeriodEnd
    ? new Date(billing.subscription.currentPeriodEnd).toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      })
    : null;

  return (
    <div className="space-y-4 animate-card-appear">
      {/* Row 1: Plan + Usage */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Plan Card */}
        <Card variant={isPaid ? 'premium' : 'default'} className="relative overflow-hidden">
          {isPaid && (
            <div className="absolute top-0 right-0 w-32 h-32 orb orb-purple opacity-50" />
          )}
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Crown className={cn('h-5 w-5', isPaid ? 'text-primary' : 'text-muted-foreground')} />
                <CardTitle className={cn(isPaid && 'text-gradient')}>
                  {billing.planName}
                </CardTitle>
              </div>
              <Badge
                variant={billing.subscription?.status === 'active' ? 'default' : 'secondary'}
                className="text-xs"
              >
                {billing.subscription?.status === 'active' ? 'Active' : 'Free'}
              </Badge>
            </div>
            <CardDescription>
              {isPaid && renewalDate
                ? `Renews ${renewalDate}`
                : 'Get started with BaleyBots'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {billing.subscription?.cancelAtPeriodEnd && (
              <p className="text-xs text-amber-600 dark:text-amber-400">
                Cancels at end of billing period
              </p>
            )}
          </CardContent>
        </Card>

        {/* Usage Card */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Usage This Month</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <UsageMeter
              label="Executions"
              used={billing.usage.executionsThisMonth}
              limit={billing.limits.maxExecutionsPerMonth}
              icon={Zap}
            />
            <UsageMeter
              label="Tokens"
              used={billing.usage.tokensThisMonth}
              limit={billing.limits.maxTokensPerMonth}
              icon={Hash}
            />
            <UsageMeter
              label="BaleyBots"
              used={billing.usage.baleybotCount}
              limit={billing.limits.maxBaleybots}
              icon={Bot}
            />
          </CardContent>
        </Card>
      </div>

      {/* Row 2: Feature Unlocks (free plan only) */}
      {!isPaid && (
        <Card className="bg-gradient-to-br from-card to-primary/5">
          <CardHeader>
            <CardTitle className="text-base">Unlock Pro Features</CardTitle>
            <CardDescription>
              Upgrade to access the full BaleyBots platform
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-2 sm:grid-cols-2">
              {PRO_FEATURES.map((feature) => {
                const unlocked = billing.limits.features[feature.key];
                const FeatureIcon = feature.icon;
                return (
                  <div
                    key={feature.key}
                    className={cn(
                      'flex items-center gap-3 rounded-lg px-3 py-2.5 border transition-colors',
                      unlocked
                        ? 'border-emerald-500/20 bg-emerald-500/5'
                        : 'border-border bg-card'
                    )}
                  >
                    {unlocked ? (
                      <Check className="h-4 w-4 text-emerald-500 shrink-0" />
                    ) : (
                      <Lock className="h-4 w-4 text-primary shrink-0" />
                    )}
                    <div className="flex items-center gap-2 min-w-0">
                      <FeatureIcon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <span className={cn('text-sm', unlocked && 'line-through text-muted-foreground')}>
                        {feature.label}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="pt-2">
              <Button
                variant="premium"
                className="w-full"
                onClick={handleUpgrade}
                disabled={upgradeMutation.isPending}
              >
                {upgradeMutation.isPending ? 'Redirecting...' : 'Upgrade to Pro'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Row 3: Manage Billing (paid plan only) */}
      {isPaid && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Billing Portal</CardTitle>
            <CardDescription>
              Manage your subscription, view invoices, and update payment methods
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              variant="outline"
              onClick={handleManageBilling}
              disabled={manageBillingMutation.isPending}
            >
              <CreditCard className="h-4 w-4 mr-2" />
              {manageBillingMutation.isPending ? 'Redirecting...' : 'Billing Portal'}
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
