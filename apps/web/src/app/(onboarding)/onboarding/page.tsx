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
import { Badge } from '@/components/ui/badge';
import {
  Loader2,
  Sparkles,
  Blocks,
  Workflow,
  Zap,
  MessageSquare,
  FileText,
  Mail,
  Bot,
  Database,
  Check,
  ArrowRight,
} from 'lucide-react';
import { ROUTES } from '@/lib/routes';

type Step = 'welcome' | 'create' | 'templates';

interface Template {
  id: string;
  name: string;
  description: string;
  icon: React.ReactNode;
  category: 'ai' | 'automation' | 'data';
  blocks: Array<{
    name: string;
    type: 'ai' | 'function';
    description: string;
    model?: string;
  }>;
}

const TEMPLATES: Template[] = [
  {
    id: 'chat-assistant',
    name: 'Chat Assistant',
    description: 'A conversational AI that answers questions and provides helpful responses.',
    icon: <MessageSquare className="h-6 w-6" />,
    category: 'ai',
    blocks: [
      {
        name: 'Chat Response',
        type: 'ai',
        description: 'You are a helpful assistant. Answer user questions clearly and concisely.',
        model: 'gpt-4o-mini',
      },
    ],
  },
  {
    id: 'content-summarizer',
    name: 'Content Summarizer',
    description: 'Summarize long documents, articles, or text into key points.',
    icon: <FileText className="h-6 w-6" />,
    category: 'ai',
    blocks: [
      {
        name: 'Text Summarizer',
        type: 'ai',
        description: 'Summarize the provided text into 3-5 key bullet points. Focus on the most important information.',
        model: 'gpt-4o-mini',
      },
    ],
  },
  {
    id: 'email-drafter',
    name: 'Email Drafter',
    description: 'Generate professional email drafts from brief descriptions.',
    icon: <Mail className="h-6 w-6" />,
    category: 'ai',
    blocks: [
      {
        name: 'Email Generator',
        type: 'ai',
        description: 'Write a professional email based on the context provided. Include appropriate greeting, body, and sign-off.',
        model: 'gpt-4o-mini',
      },
    ],
  },
  {
    id: 'ai-router',
    name: 'Intent Router',
    description: 'Route messages to different handlers based on detected intent.',
    icon: <Bot className="h-6 w-6" />,
    category: 'automation',
    blocks: [
      {
        name: 'Intent Classifier',
        type: 'ai',
        description: 'Classify the user intent into one of: question, request, feedback, complaint, other. Return only the category name.',
        model: 'gpt-4o-mini',
      },
      {
        name: 'Response Handler',
        type: 'ai',
        description: 'Generate an appropriate response based on the classified intent.',
        model: 'gpt-4o-mini',
      },
    ],
  },
  {
    id: 'data-transformer',
    name: 'Data Transformer',
    description: 'Transform and process JSON data with custom logic.',
    icon: <Database className="h-6 w-6" />,
    category: 'data',
    blocks: [
      {
        name: 'JSON Mapper',
        type: 'function',
        description: 'Transform input JSON data to a new structure.',
      },
    ],
  },
];

export default function OnboardingPage() {
  const router = useRouter();
  const { user } = useUser();
  const { toast } = useToast();
  const [workspaceName, setWorkspaceName] = useState('');
  const [step, setStep] = useState<Step>('welcome');
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [isCreatingResources, setIsCreatingResources] = useState(false);

  // Check if user already has a workspace
  const { data: workspaceCheck, isLoading: isChecking } = trpc.workspaces.checkWorkspace.useQuery();

  // Create workspace mutation
  const createWorkspace = trpc.workspaces.create.useMutation();

  // Create block mutation
  const createBlock = trpc.blocks.create.useMutation();

  // If user already has a workspace, redirect
  if (workspaceCheck?.hasWorkspace) {
    router.push(ROUTES.dashboard);
    return null;
  }

  const handleCreateWorkspace = () => {
    if (!workspaceName.trim()) {
      toast({
        title: 'Name Required',
        description: 'Please enter a name for your workspace.',
        variant: 'destructive',
      });
      return;
    }

    // Move to template selection
    setStep('templates');
  };

  const handleFinish = async () => {
    setIsCreatingResources(true);

    try {
      // First create the workspace
      await createWorkspace.mutateAsync({ name: workspaceName.trim() });

      // If a template is selected, create the blocks
      if (selectedTemplate) {
        const template = TEMPLATES.find(t => t.id === selectedTemplate);
        if (template) {
          for (const block of template.blocks) {
            await createBlock.mutateAsync({
              name: block.name,
              type: block.type,
              description: block.description,
              model: block.model,
            });
          }
          toast({
            title: 'Template Applied',
            description: `Created ${template.blocks.length} block${template.blocks.length > 1 ? 's' : ''} from the ${template.name} template.`,
          });
        }
      }

      toast({
        title: 'Welcome to BaleyUI!',
        description: 'Your workspace is ready.',
      });

      router.push(ROUTES.dashboard);
    } catch (error) {
      toast({
        title: 'Setup Failed',
        description: error instanceof Error ? error.message : 'Something went wrong',
        variant: 'destructive',
      });
    } finally {
      setIsCreatingResources(false);
    }
  };

  const handleSkipTemplates = async () => {
    setIsCreatingResources(true);

    try {
      await createWorkspace.mutateAsync({ name: workspaceName.trim() });
      toast({
        title: 'Welcome to BaleyUI!',
        description: 'Your workspace is ready.',
      });
      router.push(ROUTES.dashboard);
    } catch (error) {
      toast({
        title: 'Setup Failed',
        description: error instanceof Error ? error.message : 'Something went wrong',
        variant: 'destructive',
      });
    } finally {
      setIsCreatingResources(false);
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

  // Welcome step
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
            Build powerful AI workflows with visual composition
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="flex flex-col items-center text-center p-4 rounded-lg bg-muted/50">
              <Blocks className="h-8 w-8 mb-2 text-purple-500" />
              <h3 className="font-medium">Blocks</h3>
              <p className="text-sm text-muted-foreground">
                Create reusable AI and function blocks
              </p>
            </div>
            <div className="flex flex-col items-center text-center p-4 rounded-lg bg-muted/50">
              <Workflow className="h-8 w-8 mb-2 text-blue-500" />
              <h3 className="font-medium">Flows</h3>
              <p className="text-sm text-muted-foreground">
                Compose blocks visually into workflows
              </p>
            </div>
            <div className="flex flex-col items-center text-center p-4 rounded-lg bg-muted/50">
              <Zap className="h-8 w-8 mb-2 text-yellow-500" />
              <h3 className="font-medium">Execute</h3>
              <p className="text-sm text-muted-foreground">
                Run workflows with real-time streaming
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

  // Create workspace step
  if (step === 'create') {
    return (
      <Card className="w-full max-w-md mx-4">
        <CardHeader>
          <CardTitle>Create Your Workspace</CardTitle>
          <CardDescription>
            A workspace is where all your blocks, flows, and connections live.
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
                if (e.key === 'Enter') handleCreateWorkspace();
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
          <Button className="flex-1" onClick={handleCreateWorkspace}>
            Continue
            <ArrowRight className="h-4 w-4 ml-2" />
          </Button>
        </CardFooter>
      </Card>
    );
  }

  // Template selection step
  return (
    <Card className="w-full max-w-3xl mx-4">
      <CardHeader>
        <CardTitle>Start with a Template</CardTitle>
        <CardDescription>
          Choose a template to get started quickly, or skip to start from scratch.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 md:grid-cols-2">
          {TEMPLATES.map((template) => (
            <button
              key={template.id}
              onClick={() => setSelectedTemplate(
                selectedTemplate === template.id ? null : template.id
              )}
              className={`flex items-start gap-3 p-4 rounded-lg border-2 text-left transition-all ${
                selectedTemplate === template.id
                  ? 'border-primary bg-primary/5'
                  : 'border-muted hover:border-muted-foreground/50'
              }`}
            >
              <div className={`shrink-0 rounded-lg p-2 ${
                template.category === 'ai' ? 'bg-purple-100 text-purple-600 dark:bg-purple-950 dark:text-purple-400'
                : template.category === 'automation' ? 'bg-blue-100 text-blue-600 dark:bg-blue-950 dark:text-blue-400'
                : 'bg-green-100 text-green-600 dark:bg-green-950 dark:text-green-400'
              }`}>
                {template.icon}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="font-medium text-sm">{template.name}</h3>
                  {selectedTemplate === template.id && (
                    <Check className="h-4 w-4 text-primary shrink-0" />
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                  {template.description}
                </p>
                <Badge variant="secondary" className="mt-2 text-xs">
                  {template.blocks.length} block{template.blocks.length > 1 ? 's' : ''}
                </Badge>
              </div>
            </button>
          ))}
        </div>
      </CardContent>
      <CardFooter className="flex gap-2 justify-between">
        <Button variant="outline" onClick={() => setStep('create')}>
          Back
        </Button>
        <div className="flex gap-2">
          <Button
            variant="ghost"
            onClick={handleSkipTemplates}
            disabled={isCreatingResources}
          >
            {isCreatingResources && !selectedTemplate ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Creating...
              </>
            ) : (
              'Skip'
            )}
          </Button>
          <Button
            onClick={handleFinish}
            disabled={!selectedTemplate || isCreatingResources}
          >
            {isCreatingResources && selectedTemplate ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Setting up...
              </>
            ) : (
              <>
                Use Template
                <ArrowRight className="h-4 w-4 ml-2" />
              </>
            )}
          </Button>
        </div>
      </CardFooter>
    </Card>
  );
}
