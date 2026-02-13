'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { authClient } from '@/lib/auth/client';
import { Sparkles, Eye, EyeOff } from 'lucide-react';
import Link from 'next/link';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { PasswordStrength } from '@/components/ui/password-strength';

export default function SignUpPage() {
  const router = useRouter();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const result = await authClient.signUp.email({
      email,
      password,
      name,
    });

    if (result.error) {
      setError(result.error.message || 'Failed to create account');
      setLoading(false);
      return;
    }

    router.push('/onboarding');
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
              Start building AI agents in minutes
            </h1>
            <p className="text-muted-foreground leading-relaxed">
              Create your free account and deploy your first AI agent today.
              No credit card required.
            </p>
          </div>

          <div className="space-y-3 max-w-md">
            <Feature text="Free tier with generous limits" />
            <Feature text="Connect any AI provider" />
            <Feature text="Deploy in one click" />
          </div>
        </div>
      </div>

      {/* Right panel - sign up form */}
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

          <div className="space-y-6">
            <div className="space-y-2 text-center">
              <h2 className="text-2xl font-bold tracking-tight">Create an account</h2>
              <p className="text-sm text-muted-foreground">
                Get started with BaleyUI for free
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Name</Label>
                <Input
                  id="name"
                  type="text"
                  placeholder="Your name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  autoComplete="name"
                />
              </div>

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
                    placeholder="Create a password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={8}
                    autoComplete="new-password"
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
                <PasswordStrength password={password} />
              </div>

              {error && (
                <p className="text-sm text-destructive">{error}</p>
              )}

              <Button
                type="submit"
                variant="premium"
                className="w-full"
                loading={loading}
                loadingText="Creating account..."
              >
                Create account
              </Button>
            </form>

            <p className="text-center text-sm text-muted-foreground">
              Already have an account?{' '}
              <Link href="/sign-in" className="text-primary hover:underline font-medium">
                Sign in
              </Link>
            </p>
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
