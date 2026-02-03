import Link from 'next/link';
import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { ROUTES } from '@/lib/routes';
import { Button } from '@/components/ui/button';
import { ArrowRight, Sparkles, Workflow, Zap } from 'lucide-react';

export default async function HomePage() {
  const { userId } = await auth();

  // If signed in, redirect to dashboard
  if (userId) {
    redirect(ROUTES.dashboard);
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-background">
      {/* Ambient background effects */}
      <div className="absolute inset-0 bg-gradient-to-b from-primary/5 via-transparent to-accent/5" />
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[600px] bg-primary/10 rounded-full blur-[120px] opacity-50" />
      <div className="absolute bottom-0 right-0 w-[400px] h-[400px] bg-accent/10 rounded-full blur-[100px] opacity-40" />

      {/* Noise texture overlay */}
      <div className="absolute inset-0 noise pointer-events-none" />

      {/* Content */}
      <div className="relative z-10">
        {/* Navigation */}
        <nav className="container flex items-center justify-between py-6">
          <Link href="/" className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center">
              <Sparkles className="h-4 w-4 text-primary-foreground" />
            </div>
            <span className="text-xl font-semibold tracking-tight">
              <span className="text-primary">Baley</span>UI
            </span>
          </Link>
          <div className="flex items-center gap-3">
            <Link href={ROUTES.auth.signIn}>
              <Button variant="ghost" size="sm">Sign In</Button>
            </Link>
            <Link href={ROUTES.auth.signUp}>
              <Button size="sm">Get Started</Button>
            </Link>
          </div>
        </nav>

        {/* Hero Section */}
        <section className="container pt-24 pb-32">
          <div className="max-w-4xl mx-auto text-center space-y-8">
            {/* Badge */}
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/20 text-sm text-primary">
              <Zap className="h-4 w-4" />
              <span>AI-first development platform</span>
            </div>

            {/* Headline */}
            <h1 className="text-5xl sm:text-6xl lg:text-7xl font-bold tracking-tight leading-[1.1]">
              Build intelligent systems,{' '}
              <span className="text-gradient">not just chatbots</span>
            </h1>

            {/* Subheadline */}
            <p className="max-w-2xl mx-auto text-lg sm:text-xl text-muted-foreground leading-relaxed">
              BaleyUI is the visual development platform for AI workflows.
              Design, test, and deploy sophisticated AI agents that actually
              understand your business logic.
            </p>

            {/* CTA Buttons */}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
              <Link href={ROUTES.auth.signUp}>
                <Button variant="premium" size="lg" className="gap-2">
                  Start Building Free
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
              <Link href="#features">
                <Button variant="outline" size="lg">
                  See How It Works
                </Button>
              </Link>
            </div>
          </div>
        </section>

        {/* Features Grid */}
        <section id="features" className="container pb-32">
          <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
            {/* Feature 1 */}
            <div className="group relative p-6 rounded-2xl bg-card border border-border hover:border-primary/30 transition-all duration-300">
              <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="relative space-y-4">
                <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center">
                  <Sparkles className="h-6 w-6 text-primary" />
                </div>
                <h3 className="text-lg font-semibold">Visual AI Builder</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Drag-and-drop interface to compose AI agents. No code required to
                  create sophisticated workflows.
                </p>
              </div>
            </div>

            {/* Feature 2 */}
            <div className="group relative p-6 rounded-2xl bg-card border border-border hover:border-accent/30 transition-all duration-300">
              <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-accent/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="relative space-y-4">
                <div className="h-12 w-12 rounded-xl bg-accent/10 flex items-center justify-center">
                  <Workflow className="h-6 w-6 text-accent" />
                </div>
                <h3 className="text-lg font-semibold">Intelligent Routing</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Smart decision trees and parallel execution. Your agents adapt
                  to context automatically.
                </p>
              </div>
            </div>

            {/* Feature 3 */}
            <div className="group relative p-6 rounded-2xl bg-card border border-border hover:border-block-ai/30 transition-all duration-300">
              <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-block-ai/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="relative space-y-4">
                <div className="h-12 w-12 rounded-xl bg-block-ai/10 flex items-center justify-center">
                  <Zap className="h-6 w-6 text-block-ai" />
                </div>
                <h3 className="text-lg font-semibold">Real-time Streaming</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Watch your AI think in real-time. Full transparency into decisions,
                  tool calls, and reasoning.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer className="container py-8 border-t border-border">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-muted-foreground">
            <p>© 2026 BaleyUI. Part of the BaleyBots ecosystem.</p>
            <div className="flex items-center gap-6">
              <Link href="#" className="hover:text-foreground transition-colors">Documentation</Link>
              <Link href="#" className="hover:text-foreground transition-colors">GitHub</Link>
              <Link href="#" className="hover:text-foreground transition-colors">Discord</Link>
            </div>
          </div>
        </footer>
      </div>
    </main>
  );
}
