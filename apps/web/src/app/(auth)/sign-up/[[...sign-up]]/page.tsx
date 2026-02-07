import { SignUp } from '@clerk/nextjs';
import { Sparkles } from 'lucide-react';
import Link from 'next/link';

export default function SignUpPage() {
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

      {/* Right panel - Clerk form */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-[440px]">
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
          <SignUp
            fallbackRedirectUrl="/onboarding"
            appearance={{
              elements: {
                rootBox: 'w-full',
                card: 'shadow-none border-0 w-full',
              },
            }}
          />
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
