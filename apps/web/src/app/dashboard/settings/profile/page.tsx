'use client';

import { useState } from 'react';
import { authClient } from '@/lib/auth/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/use-toast';
import { trpc } from '@/lib/trpc/client';
import { cn } from '@/lib/utils';
import { PasswordStrength } from '@/components/ui/password-strength';
import {
  Monitor,
  Moon,
  Sun,
  Mail,
  Bell,
  BellOff,
  Pencil,
  Check,
  X,
  Eye,
  EyeOff,
  KeyRound,
  Calendar,
  Shield,
  Camera,
} from 'lucide-react';

type Theme = 'light' | 'dark' | 'system';

const THEME_OPTIONS: { value: Theme; label: string; icon: typeof Sun }[] = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor },
];

export default function ProfilePage() {
  const { data: sessionData, isPending: isSessionLoading } = authClient.useSession();
  const { toast } = useToast();
  const utils = trpc.useUtils();

  const { data: profile, isLoading } = trpc.users.getProfile.useQuery();

  // Name editing state
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState('');

  // Password change state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);

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

  const updateProfile = trpc.users.updateProfile.useMutation({
    onSuccess: () => {
      utils.users.getProfile.invalidate();
      setEditingName(false);
      toast({ title: 'Profile updated' });
    },
    onError: (error) => {
      toast({
        title: 'Failed to update profile',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const changePassword = trpc.users.changePassword.useMutation({
    onSuccess: () => {
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      toast({ title: 'Password changed successfully' });
    },
    onError: (error) => {
      toast({
        title: 'Failed to change password',
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

  const handleSaveName = () => {
    if (nameInput.trim()) {
      updateProfile.mutate({ name: nameInput.trim() });
    }
  };

  const handleChangePassword = (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      toast({
        title: 'Passwords do not match',
        variant: 'destructive',
      });
      return;
    }
    changePassword.mutate({
      currentPassword,
      newPassword,
    });
  };

  if (isSessionLoading || isLoading) {
    return (
      <div className="flex justify-center py-8">
        <div className="text-muted-foreground">Loading profile...</div>
      </div>
    );
  }

  const currentUser = sessionData?.user;

  const initials = currentUser?.name
    ? currentUser.name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)
    : '?';

  const memberSince = profile?.createdAt
    ? new Date(profile.createdAt).toLocaleDateString('en-US', {
        month: 'long',
        year: 'numeric',
      })
    : null;

  return (
    <div className="max-w-2xl space-y-6">
      {/* Account Info */}
      <Card>
        <CardHeader>
          <CardTitle>Account</CardTitle>
          <CardDescription>
            Your account information
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-start gap-4">
            {/* Avatar */}
            <div className="relative group">
              <div className="h-16 w-16 rounded-full bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center ring-2 ring-primary/10">
                <span className="text-xl font-bold text-primary">{initials}</span>
              </div>
              <div
                className="absolute inset-0 rounded-full bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-not-allowed"
                title="Avatar upload coming soon"
              >
                <Camera className="h-5 w-5 text-white" />
              </div>
            </div>

            <div className="flex-1 space-y-2">
              {/* Name */}
              <div className="flex items-center gap-2">
                {editingName ? (
                  <div className="flex items-center gap-2">
                    <Input
                      value={nameInput}
                      onChange={(e) => setNameInput(e.target.value)}
                      className="h-8 w-48"
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleSaveName();
                        if (e.key === 'Escape') setEditingName(false);
                      }}
                    />
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      onClick={handleSaveName}
                      disabled={updateProfile.isPending}
                    >
                      <Check className="h-4 w-4 text-green-500" />
                    </Button>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      onClick={() => setEditingName(false)}
                    >
                      <X className="h-4 w-4 text-muted-foreground" />
                    </Button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-lg">
                      {currentUser?.name || 'User'}
                    </p>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      onClick={() => {
                        setNameInput(currentUser?.name || '');
                        setEditingName(true);
                      }}
                      className="h-6 w-6"
                    >
                      <Pencil className="h-3 w-3" />
                    </Button>
                  </div>
                )}
              </div>

              {/* Email */}
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Mail className="h-3.5 w-3.5" />
                <span>{currentUser?.email || profile?.email || 'No email'}</span>
                {profile?.emailVerified && (
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                    <Shield className="h-2.5 w-2.5 mr-0.5" />
                    Verified
                  </Badge>
                )}
              </div>

              {/* Member since */}
              {memberSince && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground/70">
                  <Calendar className="h-3 w-3" />
                  <span>Member since {memberSince}</span>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Change Password */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <KeyRound className="h-4 w-4" />
            Change Password
          </CardTitle>
          <CardDescription>
            Update your password to keep your account secure
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleChangePassword} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="current-password">Current Password</Label>
              <div className="relative">
                <Input
                  id="current-password"
                  type={showCurrentPassword ? 'text' : 'password'}
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="Enter current password"
                  required
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  tabIndex={-1}
                >
                  {showCurrentPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="new-password">New Password</Label>
              <div className="relative">
                <Input
                  id="new-password"
                  type={showNewPassword ? 'text' : 'password'}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Enter new password"
                  required
                  minLength={8}
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowNewPassword(!showNewPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  tabIndex={-1}
                >
                  {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <PasswordStrength password={newPassword} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirm-password">Confirm New Password</Label>
              <Input
                id="confirm-password"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm new password"
                required
                minLength={8}
              />
              {confirmPassword && newPassword !== confirmPassword && (
                <p className="text-xs text-destructive">Passwords do not match</p>
              )}
            </div>

            <Button
              type="submit"
              size="sm"
              loading={changePassword.isPending}
              loadingText="Changing password..."
              disabled={!currentPassword || !newPassword || newPassword !== confirmPassword}
            >
              Change Password
            </Button>
          </form>
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
