'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { authClient } from '@/lib/auth/client';
import { Sparkles, Eye, EyeOff, Github } from 'lucide-react';
import Link from 'next/link';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

const isDev = process.env.NODE_ENV === 'development';
const hasGithub = process.env.NEXT_PUBLIC_AUTH_GITHUB === 'true';
const hasGoogle = process.env.NEXT_PUBLIC_AUTH_GOOGLE === 'true';
const hasSocial = hasGithub || hasGoogle;

export default function SignInPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectUrl = searchParams.get('redirect_url') || '/dashboard';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [shake, setShake] = useState(false);
  const [devLoading, setDevLoading] = useState(false);
  const [socialLoading, setSocialLoading] = useState<string | null>(null);

  const handleDevBypass = async () => {
    setDevLoading(true);
    setError('');
    try {
      const res = await fetch('/api/auth/dev-bypass', { method: 'POST' });
      if (res.ok) {
        router.push(redirectUrl);
      } else {
        const data = await res.json();
        setError(data.error || 'Dev bypass failed');
      }
    } catch {
      setError('Dev bypass request failed');
    }
    setDevLoading(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const result = await authClient.signIn.email({
      email,
      password,
    });

    if (result.error) {
      setError(result.error.message || 'Invalid email or password');
      setLoading(false);
      setShake(true);
      setTimeout(() => setShake(false), 500);
      return;
    }

    router.push(redirectUrl);
  };

  const handleSocialSignIn = async (provider: 'github' | 'google') => {
    setSocialLoading(provider);
    setError('');
    await authClient.signIn.social({
      provider,
      callbackURL: redirectUrl,
    });
  };

  return (
    <div className="min-h-screen flex bg-background">
      {/* Left panel - branding */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden bg-gradient-to-br from-primary/5 via-background to-accent/5">
        <div
          className="absolute top-[-100px] left-[-100px] w-[500px] h-[500px] rounded-full opacity-30"
          style={{ background: 'radial-gradient(circle, hsl(262 83% 58% / 0.15) 0%, transparent 55%)' }}
        />
        <div
          className="absolute bottom-[-50px] right-[-50px] w-[400px] h-[400px] rounded-full opacity-20"
          style={{ background: 'radial-gradient(circle, hsl(15 90% 65% / 0.12) 0%, transparent 55%)' }}
        />

        <div className="relative z-10 flex flex-col justify-center px-16 space-y-8">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center shadow-md shadow-primary/20">
              <Sparkles className="h-5 w-5 text-primary-foreground" />
            </div>
            <span className="text-2xl font-bold tracking-tight">
              <span className="text-gradient">Baley</span>
              <span className="text-foreground">UI</span>
            </span>
          </Link>

          <div className="space-y-4 max-w-md">
            <h1 className="text-3xl font-bold tracking-tight leading-tight">
              Welcome back
            </h1>
            <p className="text-muted-foreground leading-relaxed">
              Sign in to continue building AI agents. Your workspace and bots are
              waiting.
            </p>
          </div>

          <div className="space-y-3 max-w-md">
            <Feature text="Real-time agent streaming" />
            <Feature text="Built-in tools and connections" />
            <Feature text="Human-in-the-loop approval" />
          </div>
        </div>
      </div>

      {/* Right panel - sign in form */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-[400px]">
          {/* Mobile logo */}
          <div className="lg:hidden flex justify-center mb-8">
            <Link href="/" className="flex items-center gap-2.5">
              <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center shadow-md shadow-primary/20">
                <Sparkles className="h-4 w-4 text-primary-foreground" />
              </div>
              <span className="text-xl font-bold tracking-tight">
                <span className="text-gradient">Baley</span>
                <span className="text-foreground">UI</span>
              </span>
            </Link>
          </div>

          <div className={cn('space-y-6', shake && 'animate-shake')}>
            <div className="space-y-2 text-center">
              <h2 className="text-2xl font-bold tracking-tight">Sign in</h2>
              <p className="text-sm text-muted-foreground">
                Enter your email and password to continue
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    autoComplete="current-password"
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    tabIndex={-1}
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>

              <div className="flex justify-end">
                <Link
                  href="/forgot-password"
                  className="text-xs text-muted-foreground hover:text-primary transition-colors"
                >
                  Forgot password?
                </Link>
              </div>

              {error && (
                <p className="text-sm text-destructive">{error}</p>
              )}

              <Button
                type="submit"
                variant="premium"
                className="w-full"
                loading={loading}
                loadingText="Signing in..."
              >
                Sign in
              </Button>
            </form>

            {hasSocial && (
              <>
                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t border-border/60" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-background px-2 text-muted-foreground">or continue with</span>
                  </div>
                </div>

                <div className={cn('grid gap-3', hasGithub && hasGoogle ? 'grid-cols-2' : 'grid-cols-1')}>
                  {hasGithub && (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => handleSocialSignIn('github')}
                      loading={socialLoading === 'github'}
                      disabled={!!socialLoading}
                    >
                      <Github className="h-4 w-4 mr-2" />
                      GitHub
                    </Button>
                  )}
                  {hasGoogle && (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => handleSocialSignIn('google')}
                      loading={socialLoading === 'google'}
                      disabled={!!socialLoading}
                    >
                      <GoogleIcon />
                      Google
                    </Button>
                  )}
                </div>
              </>
            )}

            <p className="text-center text-sm text-muted-foreground">
              Don&apos;t have an account?{' '}
              <Link href="/sign-up" className="text-primary hover:underline font-medium">
                Sign up
              </Link>
            </p>

            {isDev && (
              <div className="pt-4 border-t border-dashed border-muted-foreground/20">
                <Button
                  type="button"
                  variant="outline"
                  className="w-full border-dashed text-muted-foreground hover:text-foreground"
                  onClick={handleDevBypass}
                  loading={devLoading}
                  loadingText="Signing in..."
                >
                  Dev Bypass (skip login)
                </Button>
                <p className="text-[10px] text-muted-foreground/50 text-center mt-1">
                  Development only — signs in as jamesmcarthur3999@gmail.com
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Feature({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="h-1.5 w-1.5 rounded-full bg-primary" />
      <span className="text-sm text-muted-foreground">{text}</span>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg className="h-4 w-4 mr-2" viewBox="0 0 24 24">
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        fill="#EA4335"
      />
    </svg>
  );
}
