'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useUser } from '@clerk/nextjs';
import { trpc } from '@/lib/trpc/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/components/ui/use-toast';
import {
  Loader2,
  Sparkles,
  Bot,
  Zap,
  Globe,
  ArrowRight,
} from 'lucide-react';
import { ROUTES } from '@/lib/routes';

type Step = 'welcome' | 'create';

export default function OnboardingPage() {
  const router = useRouter();
  const { user } = useUser();
  const { toast } = useToast();
  const [workspaceName, setWorkspaceName] = useState('');
  const [step, setStep] = useState<Step>('welcome');
  const [isCreating, setIsCreating] = useState(false);

  const { data: workspaceCheck, isLoading: isChecking } = trpc.workspaces.checkWorkspace.useQuery();
  const createWorkspace = trpc.workspaces.create.useMutation();

  if (workspaceCheck?.hasWorkspace) {
    router.push(ROUTES.dashboard);
    return null;
  }

  const handleCreate = async () => {
    const name = workspaceName.trim() || defaultName;
    setIsCreating(true);

    try {
      await createWorkspace.mutateAsync({ name });
      toast({
        title: 'Welcome to BaleyUI!',
        description: 'Your workspace is ready. Create your first BaleyBot!',
      });
      router.push(ROUTES.baleybots.list);
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

  const defaultName = user?.firstName
    ? `${user.firstName}'s Workspace`
    : 'My Workspace';

  if (isChecking) {
    return (
      <div className="flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (step === 'welcome') {
    return (
      <Card className="w-full max-w-2xl mx-4">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <div className="rounded-full bg-primary/10 p-4">
              <Sparkles className="h-12 w-12 text-primary" />
            </div>
          </div>
          <CardTitle className="text-3xl">Welcome to BaleyUI</CardTitle>
          <CardDescription className="text-lg">
            Build AI-powered bots with plain language
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="flex flex-col items-center text-center p-4 rounded-lg bg-muted/50">
              <Bot className="h-8 w-8 mb-2 text-purple-500" />
              <h3 className="font-medium">BaleyBots</h3>
              <p className="text-sm text-muted-foreground">
                AI agents that do work for you
              </p>
            </div>
            <div className="flex flex-col items-center text-center p-4 rounded-lg bg-muted/50">
              <Globe className="h-8 w-8 mb-2 text-blue-500" />
              <h3 className="font-medium">Tools</h3>
              <p className="text-sm text-muted-foreground">
                Search, fetch, notify, and more
              </p>
            </div>
            <div className="flex flex-col items-center text-center p-4 rounded-lg bg-muted/50">
              <Zap className="h-8 w-8 mb-2 text-yellow-500" />
              <h3 className="font-medium">Automate</h3>
              <p className="text-sm text-muted-foreground">
                Triggers, schedules, and chains
              </p>
            </div>
          </div>
        </CardContent>
        <CardFooter className="flex justify-center">
          <Button size="lg" onClick={() => setStep('create')}>
            Get Started
          </Button>
        </CardFooter>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-md mx-4">
      <CardHeader>
        <CardTitle>Create Your Workspace</CardTitle>
        <CardDescription>
          A workspace is where your BaleyBots, connections, and data live.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="workspace-name">Workspace Name</Label>
          <Input
            id="workspace-name"
            placeholder={defaultName}
            value={workspaceName}
            onChange={(e) => setWorkspaceName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleCreate();
            }}
          />
          <p className="text-xs text-muted-foreground">
            You can change this later in settings.
          </p>
        </div>
      </CardContent>
      <CardFooter className="flex gap-2">
        <Button variant="outline" onClick={() => setStep('welcome')}>
          Back
        </Button>
        <Button className="flex-1" onClick={handleCreate} disabled={isCreating}>
          {isCreating ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Creating...
            </>
          ) : (
            <>
              Create Workspace
              <ArrowRight className="h-4 w-4 ml-2" />
            </>
          )}
        </Button>
      </CardFooter>
    </Card>
  );
}
