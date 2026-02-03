'use client';

import * as React from 'react';
import { useState } from 'react';
import { SlidePanel, SlidePanelFooter } from '@/components/ui/slide-panel';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import {
  Settings,
  Key,
  Plug,
  Bell,
} from 'lucide-react';

interface SettingsPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function SettingsPanel({ open, onOpenChange }: SettingsPanelProps) {
  const [activeTab, setActiveTab] = useState('general');

  return (
    <SlidePanel
      open={open}
      onOpenChange={onOpenChange}
      title="Settings"
      description="Configure your workspace preferences"
      width="wide"
    >
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1">
        <TabsList className="w-full grid grid-cols-4">
          <TabsTrigger value="general" className="gap-2">
            <Settings className="h-4 w-4" />
            <span className="hidden sm:inline">General</span>
          </TabsTrigger>
          <TabsTrigger value="connections" className="gap-2">
            <Plug className="h-4 w-4" />
            <span className="hidden sm:inline">Connections</span>
          </TabsTrigger>
          <TabsTrigger value="api-keys" className="gap-2">
            <Key className="h-4 w-4" />
            <span className="hidden sm:inline">API Keys</span>
          </TabsTrigger>
          <TabsTrigger value="notifications" className="gap-2">
            <Bell className="h-4 w-4" />
            <span className="hidden sm:inline">Notifications</span>
          </TabsTrigger>
        </TabsList>

        <div className="mt-6 space-y-6">
          <TabsContent value="general" className="mt-0 space-y-6">
            <GeneralSettings />
          </TabsContent>

          <TabsContent value="connections" className="mt-0 space-y-6">
            <ConnectionsSettings />
          </TabsContent>

          <TabsContent value="api-keys" className="mt-0 space-y-6">
            <ApiKeysSettings />
          </TabsContent>

          <TabsContent value="notifications" className="mt-0 space-y-6">
            <NotificationSettings />
          </TabsContent>
        </div>
      </Tabs>

      <SlidePanelFooter>
        <Button variant="outline" onClick={() => onOpenChange(false)}>
          Close
        </Button>
      </SlidePanelFooter>
    </SlidePanel>
  );
}

SettingsPanel.displayName = 'SettingsPanel';

// ============================================================================
// TAB CONTENT COMPONENTS
// ============================================================================

function GeneralSettings() {
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-medium">General</h3>
        <p className="text-sm text-muted-foreground">
          Manage your workspace settings
        </p>
      </div>
      <Separator />
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label>Workspace Name</Label>
            <p className="text-sm text-muted-foreground">
              The name of your workspace
            </p>
          </div>
          <Input
            placeholder="My Workspace"
            className="w-[200px]"
          />
        </div>
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label>Dark Mode</Label>
            <p className="text-sm text-muted-foreground">
              Toggle dark mode for the interface
            </p>
          </div>
          <Switch />
        </div>
      </div>
    </div>
  );
}

function ConnectionsSettings() {
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-medium">LLM Connections</h3>
        <p className="text-sm text-muted-foreground">
          Configure your AI provider connections
        </p>
      </div>
      <Separator />
      <div className="rounded-lg border p-4 text-center text-sm text-muted-foreground">
        Connection settings coming soon.
        <br />
        Configure OpenAI, Anthropic, or Ollama connections.
      </div>
    </div>
  );
}

function ApiKeysSettings() {
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-medium">API Keys</h3>
        <p className="text-sm text-muted-foreground">
          Manage your API keys for external integrations
        </p>
      </div>
      <Separator />
      <div className="rounded-lg border p-4 text-center text-sm text-muted-foreground">
        API key management coming soon.
        <br />
        Generate and revoke API keys for programmatic access.
      </div>
    </div>
  );
}

function NotificationSettings() {
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-medium">Notifications</h3>
        <p className="text-sm text-muted-foreground">
          Configure how you receive notifications
        </p>
      </div>
      <Separator />
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label>Email Notifications</Label>
            <p className="text-sm text-muted-foreground">
              Receive email alerts for important events
            </p>
          </div>
          <Switch />
        </div>
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label>Execution Alerts</Label>
            <p className="text-sm text-muted-foreground">
              Get notified when executions complete or fail
            </p>
          </div>
          <Switch />
        </div>
      </div>
    </div>
  );
}

export { SettingsPanel, type SettingsPanelProps };
