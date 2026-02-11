/**
 * Seed plan definitions.
 *
 * Run with: npx tsx packages/db/src/seeds/plans.ts
 */

import { db } from '../index';
import { plans } from '../schema';

const PLANS = [
  {
    id: 'free',
    name: 'Free',
    stripePriceId: null,
    limits: {
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
    },
  },
  {
    id: 'pro',
    name: 'Pro',
    stripePriceId: process.env.STRIPE_PRO_PRICE_ID || 'price_pro_placeholder',
    limits: {
      maxExecutionsPerMonth: 5_000,
      maxTokensPerMonth: 50_000_000,
      maxBaleybots: 25,
      maxConcurrentExecutions: 5,
      features: {
        websocket: true,
        localRuntime: true,
        webhookTriggers: true,
        scheduledTasks: true,
        analytics: true,
      },
    },
  },
  {
    id: 'team',
    name: 'Team',
    stripePriceId: process.env.STRIPE_TEAM_PRICE_ID || 'price_team_placeholder',
    limits: {
      maxExecutionsPerMonth: null, // unlimited
      maxTokensPerMonth: null,
      maxBaleybots: null,
      maxConcurrentExecutions: 20,
      features: {
        websocket: true,
        localRuntime: true,
        webhookTriggers: true,
        scheduledTasks: true,
        analytics: true,
      },
    },
  },
];

export async function seedPlans() {
  for (const plan of PLANS) {
    await db
      .insert(plans)
      .values({
        id: plan.id,
        name: plan.name,
        stripePriceId: plan.stripePriceId,
        limits: plan.limits,
      })
      .onConflictDoUpdate({
        target: plans.id,
        set: {
          name: plan.name,
          stripePriceId: plan.stripePriceId,
          limits: plan.limits,
          updatedAt: new Date(),
        },
      });
  }

  console.log(`Seeded ${PLANS.length} plans`);
}

// Run directly
if (require.main === module) {
  seedPlans()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
