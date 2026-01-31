'use client';

import { ConnectionsList } from '@/components/connections/ConnectionsList';
import { AddConnectionDialog } from '@/components/connections/AddConnectionDialog';
import { Breadcrumbs } from '@/components/ui/breadcrumbs';
import { ROUTES } from '@/lib/routes';

export default function ConnectionsPage() {
  return (
    <div className="container py-10">
      <Breadcrumbs
        items={[
          { label: 'Settings', href: ROUTES.settings.root },
          { label: 'Connections' },
        ]}
        className="mb-6"
      />

      <div className="mb-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Connections</h1>
            <p className="mt-2 text-muted-foreground">
              Manage your AI provider connections
            </p>
          </div>
          <AddConnectionDialog />
        </div>
      </div>

      <div className="space-y-8">
        {/* Info Card */}
        <div className="rounded-lg border bg-muted/50 p-4">
          <p className="text-sm text-muted-foreground">
            Connect to AI providers like OpenAI, Anthropic, and Ollama to use in your blocks and flows.
            API keys are encrypted before being stored in the database.
          </p>
        </div>

        {/* Connections List */}
        <ConnectionsList />
      </div>
    </div>
  );
}
