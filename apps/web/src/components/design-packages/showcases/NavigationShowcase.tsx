'use client';

import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { ChevronRight, Home } from 'lucide-react';

export function NavigationShowcase() {
  const [activeTab, setActiveTab] = useState('overview');

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-semibold text-foreground mb-3">Breadcrumbs</h3>
        <nav className="flex items-center gap-1.5 text-sm">
          <Home className="h-3.5 w-3.5 text-muted-foreground" />
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-muted-foreground">Dashboard</span>
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-muted-foreground">Settings</span>
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="font-medium text-foreground">Design</span>
        </nav>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-foreground mb-3">Tabs</h3>
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="analytics">Analytics</TabsTrigger>
            <TabsTrigger value="settings">Settings</TabsTrigger>
          </TabsList>
          <TabsContent value="overview" className="mt-3 rounded-lg border border-border p-4 text-sm text-muted-foreground">
            Overview content panel with tab navigation.
          </TabsContent>
          <TabsContent value="analytics" className="mt-3 rounded-lg border border-border p-4 text-sm text-muted-foreground">
            Analytics data and charts would appear here.
          </TabsContent>
          <TabsContent value="settings" className="mt-3 rounded-lg border border-border p-4 text-sm text-muted-foreground">
            Configuration and settings panel.
          </TabsContent>
        </Tabs>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-foreground mb-3">Badges</h3>
        <div className="flex flex-wrap gap-2">
          <Badge>Default</Badge>
          <Badge variant="secondary">Secondary</Badge>
          <Badge variant="outline">Outline</Badge>
          <Badge variant="destructive">Destructive</Badge>
        </div>
      </div>
    </div>
  );
}
