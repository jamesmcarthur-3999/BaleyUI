'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { LoadingDots } from '@/components/ui/loading-dots';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { StatusIndicator } from '@/components/ui/status-indicator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/components/ui/use-toast';

export default function ComponentsDemo() {
  const { toast } = useToast();

  return (
    <div className="container mx-auto py-10">
      <div className="mb-8">
        <h1 className="text-4xl font-bold mb-2">BaleyUI Design System</h1>
        <p className="text-muted-foreground">
          Component showcase for the BaleyUI design system
        </p>
      </div>

      <div className="space-y-8">
        {/* Badges Section */}
        <Card>
          <CardHeader>
            <CardTitle>Badge Variants</CardTitle>
            <CardDescription>
              Custom badge variants for block types, providers, and status
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <h3 className="text-sm font-medium mb-2">Block Types</h3>
              <div className="flex flex-wrap gap-2">
                <Badge variant="ai">AI Block</Badge>
                <Badge variant="function">Function Block</Badge>
                <Badge variant="router">Router Block</Badge>
                <Badge variant="parallel">Parallel Block</Badge>
              </div>
            </div>

            <div>
              <h3 className="text-sm font-medium mb-2">Providers</h3>
              <div className="flex flex-wrap gap-2">
                <Badge variant="openai">OpenAI</Badge>
                <Badge variant="anthropic">Anthropic</Badge>
                <Badge variant="ollama">Ollama</Badge>
              </div>
            </div>

            <div>
              <h3 className="text-sm font-medium mb-2">Status</h3>
              <div className="flex flex-wrap gap-2">
                <Badge variant="connected">Connected</Badge>
                <Badge variant="error">Error</Badge>
                <Badge variant="unconfigured">Unconfigured</Badge>
              </div>
            </div>

            <div>
              <h3 className="text-sm font-medium mb-2">Standard</h3>
              <div className="flex flex-wrap gap-2">
                <Badge variant="default">Default</Badge>
                <Badge variant="secondary">Secondary</Badge>
                <Badge variant="destructive">Destructive</Badge>
                <Badge variant="outline">Outline</Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Status Indicators */}
        <Card>
          <CardHeader>
            <CardTitle>Status Indicators</CardTitle>
            <CardDescription>
              Small dot indicators for connection status with animated pulse
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <StatusIndicator status="connected" />
                <span className="text-sm">Connected</span>
              </div>
              <div className="flex items-center gap-2">
                <StatusIndicator status="error" />
                <span className="text-sm">Error</span>
              </div>
              <div className="flex items-center gap-2">
                <StatusIndicator status="unconfigured" />
                <span className="text-sm">Unconfigured</span>
              </div>
              <div className="flex items-center gap-2">
                <StatusIndicator status="pending" />
                <span className="text-sm">Pending (animated)</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Loading Dots */}
        <Card>
          <CardHeader>
            <CardTitle>Loading Dots</CardTitle>
            <CardDescription>
              Animated three-dot indicator for streaming/loading states
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2">
                <LoadingDots size="sm" />
                <span className="text-sm">Small</span>
              </div>
              <div className="flex items-center gap-2">
                <LoadingDots size="md" />
                <span className="text-sm">Medium</span>
              </div>
              <div className="flex items-center gap-2">
                <LoadingDots size="lg" />
                <span className="text-sm">Large</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Form Components */}
        <Card>
          <CardHeader>
            <CardTitle>Form Components</CardTitle>
            <CardDescription>Input, Label, and Select components</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" placeholder="Enter your email" />
            </div>

            <div className="space-y-2">
              <Label htmlFor="provider">Provider</Label>
              <Select>
                <SelectTrigger id="provider">
                  <SelectValue placeholder="Select a provider" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="openai">OpenAI</SelectItem>
                  <SelectItem value="anthropic">Anthropic</SelectItem>
                  <SelectItem value="ollama">Ollama</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Dialog */}
        <Card>
          <CardHeader>
            <CardTitle>Dialog</CardTitle>
            <CardDescription>Modal dialog component</CardDescription>
          </CardHeader>
          <CardContent>
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="outline">Open Dialog</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Example Dialog</DialogTitle>
                  <DialogDescription>
                    This is an example dialog demonstrating the dialog component.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">Name</Label>
                    <Input id="name" placeholder="Enter your name" />
                  </div>
                  <Button className="w-full">Save Changes</Button>
                </div>
              </DialogContent>
            </Dialog>
          </CardContent>
        </Card>

        {/* Tabs */}
        <Card>
          <CardHeader>
            <CardTitle>Tabs</CardTitle>
            <CardDescription>Tabbed interface component</CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="overview">
              <TabsList>
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="analytics">Analytics</TabsTrigger>
                <TabsTrigger value="settings">Settings</TabsTrigger>
              </TabsList>
              <TabsContent value="overview" className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  This is the overview tab content.
                </p>
              </TabsContent>
              <TabsContent value="analytics" className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  This is the analytics tab content.
                </p>
              </TabsContent>
              <TabsContent value="settings" className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  This is the settings tab content.
                </p>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        {/* Toast */}
        <Card>
          <CardHeader>
            <CardTitle>Toast Notifications</CardTitle>
            <CardDescription>
              Click buttons to trigger toast notifications
            </CardDescription>
          </CardHeader>
          <CardContent className="flex gap-2">
            <Button
              onClick={() => {
                toast({
                  title: 'Success!',
                  description: 'Your action was completed successfully.',
                });
              }}
            >
              Show Success Toast
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                toast({
                  variant: 'destructive',
                  title: 'Error!',
                  description: 'Something went wrong.',
                });
              }}
            >
              Show Error Toast
            </Button>
          </CardContent>
        </Card>

        {/* Buttons */}
        <Card>
          <CardHeader>
            <CardTitle>Buttons</CardTitle>
            <CardDescription>Button component variants</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Button variant="default">Default</Button>
            <Button variant="destructive">Destructive</Button>
            <Button variant="outline">Outline</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="link">Link</Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
