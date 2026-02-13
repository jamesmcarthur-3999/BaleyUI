'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { authClient } from '@/lib/auth/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { trpc } from '@/lib/trpc/client';
import { ROUTES } from '@/lib/routes';
import { CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';

export default function AcceptInvitationPage() {
  const params = useParams();
  const router = useRouter();
  const { data: sessionData, isPending } = authClient.useSession();
  const isLoaded = !isPending;
  const isSignedIn = !!sessionData?.user;
  const token = params.token as string;

  const [status, setStatus] = useState<'loading' | 'accepting' | 'success' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState('');

  const acceptMutation = trpc.team.acceptInvitation.useMutation({
    onSuccess: () => {
      setStatus('success');
      setTimeout(() => {
        router.push(ROUTES.dashboard);
      }, 2000);
    },
    onError: (error) => {
      setStatus('error');
      setErrorMessage(error.message);
    },
  });

  useEffect(() => {
    if (!isLoaded) return;

    if (!isSignedIn) {
      // Redirect to sign-in with a return URL
      const returnUrl = `/invite/${token}`;
      router.push(`${ROUTES.auth.signIn}?redirect_url=${encodeURIComponent(returnUrl)}`);
      return;
    }

    // Accept the invitation
    setStatus('accepting');
    acceptMutation.mutate({ token });
  // Only run when auth state is resolved
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoaded, isSignedIn, token]);

  if (!isLoaded || status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card className="w-full max-w-md">
          <CardContent className="flex flex-col items-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground mb-4" />
            <p className="text-sm text-muted-foreground">Loading invitation...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (status === 'accepting') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card className="w-full max-w-md">
          <CardContent className="flex flex-col items-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
            <p className="text-sm">Accepting invitation...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (status === 'success') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="flex justify-center mb-2">
              <CheckCircle2 className="h-12 w-12 text-green-500" />
            </div>
            <CardTitle>Welcome to the workspace!</CardTitle>
            <CardDescription>
              Redirecting you to the dashboard...
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-2">
            <AlertCircle className="h-12 w-12 text-destructive" />
          </div>
          <CardTitle>Invitation Error</CardTitle>
          <CardDescription>
            {errorMessage || 'Something went wrong with this invitation.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex justify-center">
          <Button onClick={() => router.push(ROUTES.dashboard)}>
            Go to Dashboard
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
