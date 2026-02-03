'use client';

import { useUser } from '@clerk/nextjs';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { trpc } from '@/lib/trpc/client';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ROUTES } from '@/lib/routes';
import {
  BaleybotCard,
  CreateBaleybotPrompt,
  RecentActivityFeed,
} from '@/components/baleybots';
import { Bot, ArrowRight, Sparkles, Zap } from 'lucide-react';

export default function HomePage() {
  const { user } = useUser();
  const router = useRouter();

  // Fetch BaleyBots
  const { data: baleybots, isLoading: baleybotsLoading } =
    trpc.baleybots.list.useQuery();

  // Fetch recent activity
  const { data: recentActivity, isLoading: activityLoading } =
    trpc.baleybots.getRecentActivity.useQuery({
      limit: 5,
    });

  const isLoading = baleybotsLoading || activityLoading;

  // Transform activity data for the feed
  const activityFeedData =
    recentActivity?.map((execution) => ({
      id: execution.id,
      baleybotId: execution.baleybotId,
      baleybotName: execution.baleybot?.name || 'Unknown',
      baleybotIcon: execution.baleybot?.icon || null,
      status: execution.status as
        | 'pending'
        | 'running'
        | 'completed'
        | 'failed'
        | 'cancelled',
      startedAt: execution.startedAt ? new Date(execution.startedAt) : null,
      completedAt: execution.completedAt
        ? new Date(execution.completedAt)
        : null,
      durationMs: execution.durationMs,
      output: execution.output,
    })) || [];

  return (
    <div className="min-h-screen bg-gradient-hero">
      {/* Decorative orbs */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="orb orb-purple w-[500px] h-[500px] -top-48 -right-24" />
        <div className="orb orb-coral w-[400px] h-[400px] top-1/2 -left-32" style={{ animationDelay: '-7s' }} />
        <div className="orb orb-lavender w-[300px] h-[300px] bottom-24 right-1/4" style={{ animationDelay: '-13s' }} />
      </div>

      <div className="relative mx-auto max-w-6xl px-6 lg:px-8 py-12">
        <div className="flex flex-col gap-10">
          {/* Hero Header */}
          <div className="animate-fade-in">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-3xl animate-bounce-subtle">👋</span>
              <h1 className="text-4xl font-bold tracking-tight">
                Welcome back{user?.firstName ? `, ${user.firstName}` : ''}
              </h1>
            </div>
            <p className="text-lg text-muted-foreground">
              Create and manage your intelligent BaleyBots
            </p>
          </div>

          {/* Create Prompt - Hero Card */}
          <div className="animate-fade-in-up stagger-1 opacity-0">
            <CreateBaleybotPrompt />
          </div>

          {/* BaleyBots Grid */}
          <div className="animate-fade-in-up stagger-2 opacity-0">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-3">
                <div className="icon-box w-10 h-10">
                  <Bot className="h-5 w-5 text-primary" />
                </div>
                <h2 className="text-xl font-semibold">
                  Your BaleyBots {baleybots && `(${baleybots.length})`}
                </h2>
              </div>
              {baleybots && baleybots.length > 0 && (
                <Button variant="ghost" size="sm" asChild className="group">
                  <Link href={ROUTES.baleybots.list}>
                    View All
                    <ArrowRight className="h-4 w-4 ml-2 transition-transform group-hover:translate-x-1" />
                  </Link>
                </Button>
              )}
            </div>

            {baleybotsLoading ? (
              <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="rounded-2xl overflow-hidden">
                    <Skeleton className="h-36 animate-shimmer" />
                  </div>
                ))}
              </div>
            ) : baleybots && baleybots.length > 0 ? (
              <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
                {baleybots.slice(0, 6).map((bb, index) => (
                  <div
                    key={bb.id}
                    className={`animate-fade-in-up opacity-0 stagger-${Math.min(index + 1, 6)}`}
                  >
                    <BaleybotCard
                      id={bb.id}
                      name={bb.name}
                      description={bb.description}
                      icon={bb.icon}
                      status={
                        bb.status as 'draft' | 'active' | 'paused' | 'error'
                      }
                      executionCount={bb.executionCount ?? 0}
                      lastExecutedAt={
                        bb.lastExecutedAt ? new Date(bb.lastExecutedAt) : null
                      }
                    />
                  </div>
                ))}
              </div>
            ) : (
              <div className="card-playful rounded-2xl border-2 border-dashed border-primary/20 p-8">
                <div className="flex flex-col items-center text-center">
                  <div className="icon-box w-16 h-16 mb-4">
                    <Bot className="h-8 w-8 text-primary" />
                  </div>
                  <h3 className="text-lg font-semibold mb-2">No BaleyBots yet</h3>
                  <p className="text-muted-foreground mb-4 max-w-md">
                    Create your first BaleyBot by describing what you need above.
                    It only takes a few seconds!
                  </p>
                  <Button asChild className="btn-playful text-white">
                    <Link href={ROUTES.baleybots.create}>
                      <Sparkles className="h-4 w-4 mr-2" />
                      Create Your First Bot
                    </Link>
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* Recent Activity */}
          <div className="animate-fade-in-up stagger-3 opacity-0">
            <RecentActivityFeed
              executions={activityFeedData}
              isLoading={activityLoading}
            />
          </div>

          {/* Getting Started - show only if no baleybots */}
          {!isLoading && (!baleybots || baleybots.length === 0) && (
            <div className="animate-fade-in-up stagger-4 opacity-0">
              <div className="card-playful rounded-2xl p-8">
                <h3 className="text-xl font-semibold mb-6 text-center">
                  Getting Started is Easy
                </h3>
                <div className="grid gap-6 md:grid-cols-3">
                  <div className="flex flex-col items-center text-center group">
                    <div className="icon-box w-14 h-14 mb-4 transition-transform group-hover:scale-110">
                      <span className="text-2xl font-bold text-primary">1</span>
                    </div>
                    <h4 className="font-semibold mb-2">Describe Your Task</h4>
                    <p className="text-sm text-muted-foreground">
                      Tell us what you want to automate in plain English
                    </p>
                  </div>
                  <div className="flex flex-col items-center text-center group">
                    <div className="icon-box-accent w-14 h-14 mb-4 transition-transform group-hover:scale-110">
                      <span className="text-2xl font-bold text-accent">2</span>
                    </div>
                    <h4 className="font-semibold mb-2">Review the Plan</h4>
                    <p className="text-sm text-muted-foreground">
                      We&apos;ll create a BaleyBot and show you what it will do
                    </p>
                  </div>
                  <div className="flex flex-col items-center text-center group">
                    <div className="icon-box w-14 h-14 mb-4 transition-transform group-hover:scale-110">
                      <Zap className="h-6 w-6 text-primary" />
                    </div>
                    <h4 className="font-semibold mb-2">Run & Refine</h4>
                    <p className="text-sm text-muted-foreground">
                      Execute your BaleyBot and iterate based on results
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
