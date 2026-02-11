'use client';

import { useUser } from '@clerk/nextjs';
import Image from 'next/image';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/use-toast';
import { trpc } from '@/lib/trpc/client';
import { cn } from '@/lib/utils';
import { Monitor, Moon, Sun, Mail, Bell, BellOff, ExternalLink } from 'lucide-react';

type Theme = 'light' | 'dark' | 'system';

const THEME_OPTIONS: { value: Theme; label: string; icon: typeof Sun }[] = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor },
];

export default function ProfilePage() {
  const { user: clerkUser, isLoaded } = useUser();
  const { toast } = useToast();
  const utils = trpc.useUtils();

  const { data: profile, isLoading } = trpc.users.getProfile.useQuery();

  const updatePrefs = trpc.users.updatePreferences.useMutation({
    onSuccess: () => {
      utils.users.getProfile.invalidate();
      toast({ title: 'Preferences saved' });
    },
    onError: (error) => {
      toast({
        title: 'Failed to save preferences',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const currentTheme = (profile?.preferences as Record<string, unknown>)?.theme as Theme | undefined ?? 'system';
  const notificationEmail = (profile?.preferences as Record<string, unknown>)?.notificationEmail as boolean | undefined ?? true;

  const setTheme = (theme: Theme) => {
    updatePrefs.mutate({ theme });
  };

  const toggleNotifications = () => {
    updatePrefs.mutate({ notificationEmail: !notificationEmail });
  };

  if (!isLoaded || isLoading) {
    return (
      <div className="flex justify-center py-8">
        <div className="text-muted-foreground">Loading profile...</div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl space-y-6">
      {/* Account Info */}
      <Card>
        <CardHeader>
          <CardTitle>Account</CardTitle>
          <CardDescription>
            Your account is managed by Clerk. To change your name, email, or avatar, visit your Clerk profile.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            {clerkUser?.imageUrl && (
              <Image
                src={clerkUser.imageUrl}
                alt="Avatar"
                width={64}
                height={64}
                className="h-16 w-16 rounded-full border"
              />
            )}
            <div className="space-y-1">
              <p className="font-medium text-lg">
                {clerkUser?.fullName || clerkUser?.username || 'User'}
              </p>
              <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <Mail className="h-3.5 w-3.5" />
                {clerkUser?.primaryEmailAddress?.emailAddress || profile?.email || 'No email'}
              </div>
            </div>
          </div>

          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => clerkUser?.update && window.open('https://accounts.clerk.dev/user', '_blank')}
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Manage Account
          </Button>
        </CardContent>
      </Card>

      {/* Theme */}
      <Card>
        <CardHeader>
          <CardTitle>Appearance</CardTitle>
          <CardDescription>
            Choose how BaleyUI looks for you
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            {THEME_OPTIONS.map(({ value, label, icon: Icon }) => (
              <Button
                key={value}
                variant={currentTheme === value ? 'default' : 'outline'}
                size="sm"
                className={cn(
                  'gap-1.5 flex-1',
                  currentTheme === value && 'pointer-events-none'
                )}
                onClick={() => setTheme(value)}
                disabled={updatePrefs.isPending}
              >
                <Icon className="h-4 w-4" />
                {label}
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Notifications */}
      <Card>
        <CardHeader>
          <CardTitle>Notifications</CardTitle>
          <CardDescription>
            Control how you receive updates
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {notificationEmail ? (
                <Bell className="h-5 w-5 text-primary" />
              ) : (
                <BellOff className="h-5 w-5 text-muted-foreground" />
              )}
              <div>
                <Label className="text-sm font-medium">Email Notifications</Label>
                <p className="text-xs text-muted-foreground">
                  Receive email alerts for BaleyBot failures and workspace events
                </p>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={toggleNotifications}
              disabled={updatePrefs.isPending}
            >
              {notificationEmail ? 'Disable' : 'Enable'}
            </Button>
          </div>
          <div className="mt-3">
            <Badge variant={notificationEmail ? 'default' : 'secondary'}>
              {notificationEmail ? 'Enabled' : 'Disabled'}
            </Badge>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
