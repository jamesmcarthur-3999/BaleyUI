'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { TrendingUp, Users, Zap, ArrowRight } from 'lucide-react';

export function CardsShowcase() {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {/* Simple card */}
      <div className="rounded-xl border border-border bg-card p-6 space-y-3">
        <h3 className="font-semibold text-card-foreground">Simple Card</h3>
        <p className="text-sm text-muted-foreground">
          A basic card component with title and description text content.
        </p>
        <Button variant="outline" size="sm">
          Learn More <ArrowRight className="ml-2 h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Card with badge */}
      <div className="rounded-xl border border-border bg-card p-6 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-card-foreground">Featured</h3>
          <Badge>New</Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          Card with a badge indicator showing status or category.
        </p>
        <Button size="sm">Get Started</Button>
      </div>

      {/* Stats card */}
      <div className="rounded-xl border border-border bg-card p-6 md:col-span-2">
        <h3 className="font-semibold text-card-foreground mb-4">Dashboard Overview</h3>
        <div className="grid grid-cols-3 gap-4">
          <div className="rounded-lg bg-muted/50 p-4 text-center">
            <div className="flex items-center justify-center gap-2 text-primary mb-1">
              <Users className="h-4 w-4" />
              <span className="text-2xl font-bold">2,847</span>
            </div>
            <span className="text-xs text-muted-foreground">Active Users</span>
          </div>
          <div className="rounded-lg bg-muted/50 p-4 text-center">
            <div className="flex items-center justify-center gap-2 text-primary mb-1">
              <Zap className="h-4 w-4" />
              <span className="text-2xl font-bold">14.2k</span>
            </div>
            <span className="text-xs text-muted-foreground">Executions</span>
          </div>
          <div className="rounded-lg bg-muted/50 p-4 text-center">
            <div className="flex items-center justify-center gap-2 text-primary mb-1">
              <TrendingUp className="h-4 w-4" />
              <span className="text-2xl font-bold">98.5%</span>
            </div>
            <span className="text-xs text-muted-foreground">Success Rate</span>
          </div>
        </div>
        <Separator className="my-4" />
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Last 30 days</span>
          <Button variant="ghost" size="sm">View Details</Button>
        </div>
      </div>
    </div>
  );
}
