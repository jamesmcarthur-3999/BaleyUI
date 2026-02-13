'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useUser } from '@clerk/nextjs';
import { trpc } from '@/lib/trpc/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FormFieldGroup } from '@/components/ui/form-field-group';
import { useToast } from '@/components/ui/use-toast';
import {
  Loader2,
  Sparkles,
  Bot,
  Zap,
  Globe,
  ArrowRight,
  Check,
  Key,
} from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ROUTES } from '@/lib/routes';

type Step = 'welcome' | 'create' | 'connect-ai';

export default function OnboardingPage() {
  const router = useRouter();
  const { user } = useUser();
  const { toast } = useToast();
  const [workspaceName, setWorkspaceName] = useState('');
  const [step, setStep] = useState<Step>('welcome');
  const [isCreating, setIsCreating] = useState(false);
  const [aiProvider, setAiProvider] = useState<'openai' | 'anthropic'>('openai');
  const [aiApiKey, setAiApiKey] = useState('');
  const [isConnectingAI, setIsConnectingAI] = useState(false);

  const utils = trpc.useUtils();
  const { data: workspaceCheck, isLoading: isChecking } = trpc.workspaces.checkWorkspace.useQuery();
  const createWorkspace = trpc.workspaces.create.useMutation();
  const createConnection = trpc.connections.create.useMutation();

  if (workspaceCheck?.hasWorkspace) {
    router.push(ROUTES.dashboard);
    return null;
  }

  const defaultName = user?.firstName
    ? `${user.firstName}'s Workspace`
    : 'My Workspace';

  const handleCreate = async () => {
    const name = workspaceName.trim() || defaultName;
    setIsCreating(true);

    try {
      await createWorkspace.mutateAsync({ name });
      // Invalidate the checkWorkspace cache so WorkspaceGuard sees the new workspace
      await utils.workspaces.checkWorkspace.invalidate();
      toast({
        title: 'Workspace created!',
        description: 'Now let\u2019s connect an AI provider.',
      });
      setStep('connect-ai');
    } catch (error) {
      toast({
        title: 'Setup Failed',
        description: error instanceof Error ? error.message : 'Something went wrong',
        variant: 'destructive',
      });
    } finally {
      setIsCreating(false);
    }
  };

  const handleConnectAI = async () => {
    setIsConnectingAI(true);
    try {
      await createConnection.mutateAsync({
        type: aiProvider,
        name: aiProvider === 'openai' ? 'OpenAI' : 'Anthropic',
        config: { apiKey: aiApiKey.trim() },
        initialStatus: 'connected',
      });
      toast({
        title: 'AI provider connected!',
        description: `${aiProvider === 'openai' ? 'OpenAI' : 'Anthropic'} is ready to use.`,
      });
      router.push(ROUTES.baleybots.list);
    } catch (error) {
      toast({
        title: 'Connection Failed',
        description: error instanceof Error ? error.message : 'Could not connect. Check your API key.',
        variant: 'destructive',
      });
    } finally {
      setIsConnectingAI(false);
    }
  };

  const handleSkipAI = () => {
    toast({
      title: 'Skipped AI setup',
      description: "You'll need to connect an AI provider before creating your first BaleyBot.",
    });
    router.push(ROUTES.baleybots.list);
  };

  if (isChecking) {
    return (
      <div className="flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (step === 'welcome') {
    return (
      <div className="w-full max-w-2xl mx-4 space-y-8 animate-fade-in">
        {/* Header */}
        <div className="text-center space-y-4">
          <div className="inline-flex items-center justify-center">
            <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center shadow-lg shadow-primary/20">
              <Sparkles className="h-8 w-8 text-primary-foreground" />
            </div>
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">
            Welcome{user?.firstName ? `, ${user.firstName}` : ''}!
          </h1>
          <p className="text-lg text-muted-foreground max-w-md mx-auto">
            Let&apos;s get you set up with BaleyUI. It only takes a moment.
          </p>
        </div>

        {/* Feature highlights */}
        <div className="grid gap-3 max-w-lg mx-auto">
          <FeatureRow
            icon={<Bot className="h-5 w-5 text-primary" />}
            title="Create AI agents"
            description="Build agents that search the web, call APIs, and automate workflows"
          />
          <FeatureRow
            icon={<Globe className="h-5 w-5 text-accent" />}
            title="Connect your tools"
            description="Plug in OpenAI, Anthropic, databases, and more"
          />
          <FeatureRow
            icon={<Zap className="h-5 w-5 text-color-warning" />}
            title="Deploy instantly"
            description="Test in real-time, then deploy with webhooks and schedules"
          />
        </div>

        {/* CTA */}
        <div className="flex justify-center pt-2">
          <Button
            size="lg"
            variant="premium"
            className="gap-2 text-base h-12 px-10"
            onClick={() => setStep('create')}
          >
            Set Up Your Workspace
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    );
  }

  if (step === 'create') {
    return (
      <div className="w-full max-w-md mx-4 space-y-6 animate-fade-in">
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center mb-2">
            <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center">
              <Sparkles className="h-6 w-6 text-primary" />
            </div>
          </div>
          <h2 className="text-2xl font-bold tracking-tight">Name your workspace</h2>
          <p className="text-sm text-muted-foreground">
            A workspace holds your BaleyBots, connections, and data.
            You can always rename it later.
          </p>
        </div>

        {/* Form */}
        <div className="space-y-4 rounded-2xl border border-border bg-card p-6">
          <FormFieldGroup label="Workspace Name">
            <Input
              placeholder={defaultName}
              value={workspaceName}
              onChange={(e) => setWorkspaceName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCreate();
              }}
              autoFocus
              className="h-12 text-base"
            />
          </FormFieldGroup>

          <div className="flex gap-3">
            <Button
              variant="outline"
              className="flex-shrink-0"
              onClick={() => setStep('welcome')}
            >
              Back
            </Button>
            <Button
              className="flex-1 gap-2"
              onClick={handleCreate}
              variant="premium"
              loading={isCreating}
              loadingText="Creating..."
            >
              Create Workspace
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Progress indicator */}
        <div className="flex items-center justify-center gap-2">
          <div className="h-2 w-2 rounded-full bg-primary" />
          <div className="h-2 w-2 rounded-full bg-primary" />
          <div className="h-2 w-2 rounded-full bg-muted" />
        </div>
      </div>
    );
  }

  if (step === 'connect-ai') {
    return (
      <div className="w-full max-w-md mx-4 space-y-6 animate-fade-in">
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center mb-2">
            <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center">
              <Key className="h-6 w-6 text-primary" />
            </div>
          </div>
          <h2 className="text-2xl font-bold tracking-tight">Connect an AI provider</h2>
          <p className="text-sm text-muted-foreground">
            BaleyBots need an AI provider to work. You can always add more later.
          </p>
        </div>

        {/* Provider Selection + API Key Form */}
        <div className="space-y-4 rounded-2xl border border-border bg-card p-6">
          <FormFieldGroup label="Provider">
            <Select value={aiProvider} onValueChange={(v) => setAiProvider(v as 'openai' | 'anthropic')}>
              <SelectTrigger className="h-12">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="openai">OpenAI</SelectItem>
                <SelectItem value="anthropic">Anthropic</SelectItem>
              </SelectContent>
            </Select>
          </FormFieldGroup>

          <FormFieldGroup label="API Key" required>
            <Input
              type="password"
              placeholder={aiProvider === 'openai' ? 'sk-...' : 'sk-ant-...'}
              value={aiApiKey}
              onChange={(e) => setAiApiKey(e.target.value)}
              className="h-12 font-mono text-sm"
            />
          </FormFieldGroup>

          <Button
            className="w-full gap-2"
            variant="premium"
            onClick={handleConnectAI}
            loading={isConnectingAI}
            loadingText="Connecting..."
            disabled={!aiApiKey.trim()}
          >
            Connect & Continue
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>

        {/* Skip link */}
        <div className="text-center">
          <button
            className="text-sm text-muted-foreground hover:text-foreground underline underline-offset-4 transition-colors"
            onClick={handleSkipAI}
          >
            Skip for now
          </button>
        </div>

        {/* Progress indicator - 3 dots */}
        <div className="flex items-center justify-center gap-2">
          <div className="h-2 w-2 rounded-full bg-primary" />
          <div className="h-2 w-2 rounded-full bg-primary" />
          <div className="h-2 w-2 rounded-full bg-primary" />
        </div>
      </div>
    );
  }

  return null;
}

function FeatureRow({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="flex items-start gap-4 p-4 rounded-xl border border-border bg-card">
      <div className="flex-shrink-0 mt-0.5">
        <div className="h-10 w-10 rounded-xl bg-muted/50 flex items-center justify-center">
          {icon}
        </div>
      </div>
      <div className="space-y-0.5">
        <div className="font-medium text-sm">{title}</div>
        <div className="text-sm text-muted-foreground">{description}</div>
      </div>
      <div className="flex-shrink-0 mt-1">
        <Check className="h-4 w-4 text-color-success" />
      </div>
    </div>
  );
}
