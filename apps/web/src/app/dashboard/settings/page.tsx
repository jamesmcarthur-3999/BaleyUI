import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import Link from 'next/link';
import { Settings, Plug, User, Shield, Key, ShieldCheck } from 'lucide-react';

export default function SettingsPage() {
  const settingsSections = [
    {
      title: 'Connections',
      description: 'Manage AI provider connections (OpenAI, Anthropic, Ollama)',
      icon: Plug,
      href: '/dashboard/settings/connections',
    },
    {
      title: 'API Keys',
      description: 'Manage API keys for programmatic access',
      icon: Key,
      href: '/dashboard/settings/api-keys',
    },
    {
      title: 'Approval Patterns',
      description: 'Manage auto-approval rules for BaleyBot tool usage',
      icon: ShieldCheck,
      href: '/dashboard/settings/approvals',
    },
    {
      title: 'Workspace',
      description: 'Configure your workspace name and settings',
      icon: Settings,
      href: '/dashboard/settings/workspace',
    },
    {
      title: 'Account',
      description: 'User profile, preferences, and account settings',
      icon: User,
      href: '/dashboard/settings/account',
      comingSoon: true,
    },
    {
      title: 'Security',
      description: 'Two-factor authentication, sessions, and access logs',
      icon: Shield,
      href: '/dashboard/settings/security',
      comingSoon: true,
    },
  ];

  return (
    <div className="container py-10">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Settings</h1>
        <p className="mt-2 text-muted-foreground">
          Manage your workspace, connections, and preferences
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {settingsSections.map((section) => {
          const Icon = section.icon;
          const isComingSoon = section.comingSoon;

          const content = (
            <Card
              className={
                isComingSoon
                  ? 'opacity-60 cursor-not-allowed'
                  : 'cursor-pointer transition-colors hover:bg-accent'
              }
            >
              <CardHeader>
                <div className="flex items-start gap-4">
                  <div className="rounded-lg bg-primary/10 p-2">
                    <Icon className="h-6 w-6 text-primary" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <CardTitle>{section.title}</CardTitle>
                      {isComingSoon && (
                        <Badge variant="secondary" className="text-xs">
                          Coming Soon
                        </Badge>
                      )}
                    </div>
                    <CardDescription className="mt-1.5">
                      {section.description}
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
            </Card>
          );

          if (isComingSoon) {
            return <div key={section.title}>{content}</div>;
          }

          return (
            <Link key={section.title} href={section.href}>
              {content}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
