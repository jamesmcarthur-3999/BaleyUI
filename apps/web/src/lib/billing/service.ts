/**
 * Billing Service — all Stripe + quota logic in one file.
 *
 * Nothing else in the app imports `stripe` directly.
 * The executor never knows about plans.
 */

import { db, eq, and, gte, sql } from '@baleyui/db';
import { subscriptions, plans, baleybotUsage, baleybots, notDeleted } from '@baleyui/db';
import type { PlanLimits, BillingSummary } from './types';
import { QuotaExceededError } from './types';

// ---------------------------------------------------------------------------
// Lazy Stripe client — only initialized when needed
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _stripe: any = null;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getStripe(): any {
  if (!_stripe) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Stripe = require('stripe');
    _stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
  }
  return _stripe;
}

// ---------------------------------------------------------------------------
// Default plan for workspaces without a subscription
// ---------------------------------------------------------------------------

const FREE_PLAN_LIMITS: PlanLimits = {
  maxExecutionsPerMonth: 100,
  maxTokensPerMonth: 500_000,
  maxBaleybots: 3,
  maxConcurrentExecutions: 1,
  features: {
    websocket: false,
    localRuntime: false,
    webhookTriggers: false,
    scheduledTasks: false,
    analytics: false,
  },
};

// ---------------------------------------------------------------------------
// Quota check — the ONLY function other code calls
// ---------------------------------------------------------------------------

/**
 * Check whether the workspace is within its plan quota.
 * Returns { allowed: true } if execution can proceed.
 */
export async function checkQuota(
  workspaceId: string
): Promise<{ allowed: boolean; reason?: string }> {
  const limits = await getWorkspaceLimits(workspaceId);

  // Check monthly execution count
  if (limits.maxExecutionsPerMonth !== null) {
    const executionsThisMonth = await getMonthlyExecutionCount(workspaceId);
    if (executionsThisMonth >= limits.maxExecutionsPerMonth) {
      return {
        allowed: false,
        reason: `Monthly execution limit reached (${limits.maxExecutionsPerMonth})`,
      };
    }
  }

  // Check monthly token count
  if (limits.maxTokensPerMonth !== null) {
    const tokensThisMonth = await getMonthlyTokenCount(workspaceId);
    if (tokensThisMonth >= limits.maxTokensPerMonth) {
      return {
        allowed: false,
        reason: `Monthly token limit reached (${limits.maxTokensPerMonth.toLocaleString()})`,
      };
    }
  }

  return { allowed: true };
}

/**
 * Assert quota — throws QuotaExceededError if over limit.
 * This is the one-liner used in the baleybots router.
 */
export async function assertQuota(workspaceId: string): Promise<void> {
  const { allowed, reason } = await checkQuota(workspaceId);
  if (!allowed) {
    throw new QuotaExceededError(reason!);
  }
}

// ---------------------------------------------------------------------------
// Stripe operations — called by billing tRPC router only
// ---------------------------------------------------------------------------

/**
 * Create a Stripe Checkout session for plan upgrade.
 * Returns the checkout URL.
 */
export async function createCheckoutSession(
  workspaceId: string,
  planId: string
): Promise<string> {
  const stripe = getStripe();

  // Get the plan's Stripe price ID
  const plan = await db.query.plans.findFirst({
    where: eq(plans.id, planId),
  });

  if (!plan?.stripePriceId) {
    throw new Error(`Plan ${planId} not found or has no Stripe price`);
  }

  // Get or create Stripe customer for this workspace
  const customerId = await getOrCreateStripeCustomer(workspaceId);

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: 'subscription',
    line_items: [{ price: plan.stripePriceId, quantity: 1 }],
    success_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/analytics?billing=success`,
    cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/analytics?billing=cancelled`,
    metadata: { workspaceId, planId },
  });

  return session.url!;
}

/**
 * Create a Stripe Billing Portal session.
 * Returns the portal URL for invoices, payment methods, cancellation.
 */
export async function createPortalSession(workspaceId: string): Promise<string> {
  const stripe = getStripe();

  const sub = await db.query.subscriptions.findFirst({
    where: eq(subscriptions.workspaceId, workspaceId),
  });

  if (!sub?.stripeCustomerId) {
    throw new Error('No billing subscription found for this workspace');
  }

  const session = await stripe.billingPortal.sessions.create({
    customer: sub.stripeCustomerId,
    return_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/analytics`,
  });

  return session.url;
}

/**
 * Handle incoming Stripe webhook events.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function handleWebhookEvent(event: any): Promise<void> {
  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object;
      const workspaceId = session.metadata?.workspaceId;
      const planId = session.metadata?.planId;
      if (!workspaceId || !planId) break;

      const stripeSubscription = await getStripe().subscriptions.retrieve(
        session.subscription as string
      );

      await db
        .insert(subscriptions)
        .values({
          workspaceId,
          planId,
          stripeCustomerId: session.customer as string,
          stripeSubscriptionId: stripeSubscription.id,
          status: 'active',
          currentPeriodStart: new Date(stripeSubscription.current_period_start * 1000),
          currentPeriodEnd: new Date(stripeSubscription.current_period_end * 1000),
        })
        .onConflictDoUpdate({
          target: subscriptions.workspaceId,
          set: {
            planId,
            stripeCustomerId: session.customer as string,
            stripeSubscriptionId: stripeSubscription.id,
            status: 'active',
            currentPeriodStart: new Date(stripeSubscription.current_period_start * 1000),
            currentPeriodEnd: new Date(stripeSubscription.current_period_end * 1000),
            updatedAt: new Date(),
          },
        });
      break;
    }

    case 'customer.subscription.updated': {
      const sub = event.data.object;
      await db
        .update(subscriptions)
        .set({
          status: sub.status === 'active' ? 'active' : sub.status === 'past_due' ? 'past_due' : 'cancelled',
          currentPeriodStart: new Date(sub.current_period_start * 1000),
          currentPeriodEnd: new Date(sub.current_period_end * 1000),
          cancelAtPeriodEnd: sub.cancel_at_period_end,
          updatedAt: new Date(),
        })
        .where(eq(subscriptions.stripeSubscriptionId, sub.id));
      break;
    }

    case 'customer.subscription.deleted': {
      const sub = event.data.object;
      await db
        .update(subscriptions)
        .set({
          status: 'cancelled',
          updatedAt: new Date(),
        })
        .where(eq(subscriptions.stripeSubscriptionId, sub.id));
      break;
    }
  }
}

/**
 * Get full billing summary for a workspace.
 */
export async function getWorkspaceBilling(workspaceId: string): Promise<BillingSummary> {
  // Get subscription
  const sub = await db.query.subscriptions.findFirst({
    where: eq(subscriptions.workspaceId, workspaceId),
  });

  // Get plan limits
  let planId = 'free';
  let planName = 'Free';
  let limits = FREE_PLAN_LIMITS;

  if (sub) {
    const plan = await db.query.plans.findFirst({
      where: eq(plans.id, sub.planId),
    });
    if (plan) {
      planId = plan.id;
      planName = plan.name;
      limits = plan.limits as PlanLimits;
    }
  }

  // Get current month usage
  const executionsThisMonth = await getMonthlyExecutionCount(workspaceId);
  const tokensThisMonth = await getMonthlyTokenCount(workspaceId);

  // Get BB count
  const bbCountResult = await db
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(baleybots)
    .where(and(eq(baleybots.workspaceId, workspaceId), notDeleted(baleybots)));
  const baleybotCount = bbCountResult[0]?.count ?? 0;

  return {
    planId,
    planName,
    limits,
    usage: {
      executionsThisMonth,
      tokensThisMonth,
      baleybotCount,
    },
    subscription: sub
      ? {
          status: sub.status,
          currentPeriodStart: sub.currentPeriodStart,
          currentPeriodEnd: sub.currentPeriodEnd,
          cancelAtPeriodEnd: sub.cancelAtPeriodEnd ?? false,
        }
      : null,
  };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

async function getWorkspaceLimits(workspaceId: string): Promise<PlanLimits> {
  const sub = await db.query.subscriptions.findFirst({
    where: and(eq(subscriptions.workspaceId, workspaceId), eq(subscriptions.status, 'active')),
  });

  if (!sub) return FREE_PLAN_LIMITS;

  const plan = await db.query.plans.findFirst({
    where: eq(plans.id, sub.planId),
  });

  return (plan?.limits as PlanLimits) ?? FREE_PLAN_LIMITS;
}

async function getMonthlyExecutionCount(workspaceId: string): Promise<number> {
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const result = await db
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(baleybotUsage)
    .where(
      and(
        eq(baleybotUsage.workspaceId, workspaceId),
        gte(baleybotUsage.timestamp, startOfMonth)
      )
    );

  return result[0]?.count ?? 0;
}

async function getMonthlyTokenCount(workspaceId: string): Promise<number> {
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const result = await db
    .select({
      total: sql<number>`COALESCE(SUM(${baleybotUsage.tokenTotal}), 0)::int`,
    })
    .from(baleybotUsage)
    .where(
      and(
        eq(baleybotUsage.workspaceId, workspaceId),
        gte(baleybotUsage.timestamp, startOfMonth)
      )
    );

  return result[0]?.total ?? 0;
}

async function getOrCreateStripeCustomer(workspaceId: string): Promise<string> {
  // Check if we already have a Stripe customer
  const existing = await db.query.subscriptions.findFirst({
    where: eq(subscriptions.workspaceId, workspaceId),
  });

  if (existing?.stripeCustomerId) {
    return existing.stripeCustomerId;
  }

  // Create a new Stripe customer
  const stripe = getStripe();
  const customer = await stripe.customers.create({
    metadata: { workspaceId },
  });

  return customer.id;
}
