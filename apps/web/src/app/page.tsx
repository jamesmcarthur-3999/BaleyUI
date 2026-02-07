import Link from 'next/link';
import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { ROUTES } from '@/lib/routes';
import { Button } from '@/components/ui/button';
import {
  ArrowRight,
  Bot,
  Brain,
  ChevronRight,
  Code2,
  Eye,
  GitBranch,
  Globe,
  Layers,
  MessageSquare,
  Shield,
  Sparkles,
  Timer,
  Workflow,
  Zap,
} from 'lucide-react';

export default async function HomePage() {
  const { userId } = await auth();

  if (userId) {
    redirect(ROUTES.dashboard);
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-background">
      {/* ===== AMBIENT BACKGROUND ===== */}
      <div className="absolute inset-0 bg-gradient-to-b from-primary/5 via-transparent to-accent/5" />
      <div
        className="absolute top-[-200px] left-1/2 -translate-x-1/2 w-[1200px] h-[800px] rounded-full opacity-40"
        style={{ background: 'radial-gradient(circle, hsl(262 83% 58% / 0.12) 0%, transparent 55%)' }}
      />
      <div
        className="absolute top-[400px] right-[-200px] w-[600px] h-[600px] rounded-full opacity-30"
        style={{ background: 'radial-gradient(circle, hsl(15 90% 65% / 0.1) 0%, transparent 55%)' }}
      />
      <div
        className="absolute bottom-[-100px] left-[-100px] w-[500px] h-[500px] rounded-full opacity-25"
        style={{ background: 'radial-gradient(circle, hsl(280 60% 75% / 0.1) 0%, transparent 55%)' }}
      />
      <div className="absolute inset-0 noise pointer-events-none" />

      {/* ===== CONTENT ===== */}
      <div className="relative z-10">
        {/* ===== NAV ===== */}
        <nav className="container flex items-center justify-between py-6">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center shadow-md shadow-primary/20">
              <Sparkles className="h-4.5 w-4.5 text-primary-foreground" />
            </div>
            <span className="text-xl font-bold tracking-tight">
              <span className="text-gradient">Baley</span>
              <span className="text-foreground">UI</span>
            </span>
          </Link>
          <div className="flex items-center gap-3">
            <Link href="#features" className="hidden sm:inline-flex">
              <Button variant="ghost" size="sm">Features</Button>
            </Link>
            <Link href="#how-it-works" className="hidden sm:inline-flex">
              <Button variant="ghost" size="sm">How It Works</Button>
            </Link>
            <Link href={ROUTES.auth.signIn}>
              <Button variant="ghost" size="sm">Sign In</Button>
            </Link>
            <Link href={ROUTES.auth.signUp}>
              <Button size="sm">Get Started</Button>
            </Link>
          </div>
        </nav>

        {/* ===== HERO ===== */}
        <section className="container pt-20 sm:pt-28 pb-24 sm:pb-32">
          <div className="max-w-4xl mx-auto text-center space-y-8">
            {/* Badge */}
            <div className="animate-fade-in inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/20 text-sm font-medium text-primary">
              <Zap className="h-3.5 w-3.5" />
              <span>AI agent platform for builders</span>
              <ChevronRight className="h-3.5 w-3.5" />
            </div>

            {/* Headline */}
            <h1 className="animate-fade-in-up text-5xl sm:text-6xl lg:text-7xl font-bold tracking-tight leading-[1.08]">
              Build AI agents that{' '}
              <span className="text-gradient-warm">actually work</span>
            </h1>

            {/* Subheadline */}
            <p className="animate-fade-in-up stagger-2 max-w-2xl mx-auto text-lg sm:text-xl text-muted-foreground leading-relaxed">
              BaleyUI is a visual platform for designing, testing, and deploying
              AI-powered workflows. Go from idea to production agent in minutes,
              not months.
            </p>

            {/* CTAs */}
            <div className="animate-fade-in-up stagger-3 flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
              <Link href={ROUTES.auth.signUp}>
                <Button variant="premium" size="lg" className="gap-2 text-base h-13 px-8">
                  Start Building Free
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
              <Link href="#how-it-works">
                <Button variant="outline" size="lg" className="text-base h-13 px-8">
                  See How It Works
                </Button>
              </Link>
            </div>

            {/* Social proof line */}
            <p className="animate-fade-in stagger-4 text-sm text-muted-foreground pt-2">
              Free to start. No credit card required.
            </p>
          </div>
        </section>

        {/* ===== DEMO / VISUAL SHOWCASE ===== */}
        <section className="container pb-24 sm:pb-32">
          <div className="max-w-5xl mx-auto">
            <div className="relative rounded-2xl border border-border bg-card/80 backdrop-blur-sm overflow-hidden shadow-2xl shadow-primary/5">
              {/* Window chrome */}
              <div className="flex items-center gap-2 px-4 py-3 border-b border-border bg-muted/50">
                <div className="flex gap-1.5">
                  <div className="w-3 h-3 rounded-full bg-destructive/60" />
                  <div className="w-3 h-3 rounded-full bg-color-warning/60" />
                  <div className="w-3 h-3 rounded-full bg-color-success/60" />
                </div>
                <div className="flex-1 text-center text-xs text-muted-foreground font-mono">
                  baleyui &mdash; customer-support-bot
                </div>
              </div>
              {/* Code preview */}
              <div className="p-6 sm:p-8 font-mono text-sm leading-relaxed">
                <div className="space-y-1">
                  <span className="text-muted-foreground"># Define an AI agent in plain language</span>
                  <div className="pt-2">
                    <span className="text-primary font-semibold">support_agent</span>
                    <span className="text-muted-foreground"> {'{'}</span>
                  </div>
                  <div className="pl-4 sm:pl-6">
                    <span className="text-accent">&quot;goal&quot;</span>
                    <span className="text-muted-foreground">: </span>
                    <span className="text-foreground">&quot;Help customers resolve issues using our knowledge base&quot;</span>
                    <span className="text-muted-foreground">,</span>
                  </div>
                  <div className="pl-4 sm:pl-6">
                    <span className="text-accent">&quot;model&quot;</span>
                    <span className="text-muted-foreground">: </span>
                    <span className="text-foreground">&quot;anthropic:claude-sonnet-4-20250514&quot;</span>
                    <span className="text-muted-foreground">,</span>
                  </div>
                  <div className="pl-4 sm:pl-6">
                    <span className="text-accent">&quot;tools&quot;</span>
                    <span className="text-muted-foreground">: </span>
                    <span className="text-foreground">[&quot;web_search&quot;, &quot;fetch_url&quot;, &quot;send_notification&quot;]</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">{'}'}</span>
                  </div>
                  <div className="pt-4">
                    <span className="text-primary font-semibold">escalation_bot</span>
                    <span className="text-muted-foreground"> {'{'}</span>
                  </div>
                  <div className="pl-4 sm:pl-6">
                    <span className="text-accent">&quot;goal&quot;</span>
                    <span className="text-muted-foreground">: </span>
                    <span className="text-foreground">&quot;Escalate unresolved issues to human agents&quot;</span>
                    <span className="text-muted-foreground">,</span>
                  </div>
                  <div className="pl-4 sm:pl-6">
                    <span className="text-accent">&quot;trigger&quot;</span>
                    <span className="text-muted-foreground">: </span>
                    <span className="text-foreground">&quot;bb_completion:support_agent&quot;</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">{'}'}</span>
                  </div>
                  <div className="pt-4">
                    <span className="text-primary font-semibold">chain</span>
                    <span className="text-muted-foreground"> {'{ '}</span>
                    <span className="text-foreground">support_agent escalation_bot</span>
                    <span className="text-muted-foreground">{' }'}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ===== FEATURES ===== */}
        <section id="features" className="container pb-24 sm:pb-32">
          <div className="max-w-5xl mx-auto">
            {/* Section header */}
            <div className="text-center space-y-4 mb-16">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-accent/10 text-xs font-medium text-accent">
                Features
              </div>
              <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">
                Everything you need to ship AI agents
              </h2>
              <p className="max-w-2xl mx-auto text-muted-foreground">
                From a simple chatbot to complex multi-agent workflows with tools,
                triggers, and human-in-the-loop approval.
              </p>
            </div>

            {/* Feature grid */}
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
              <FeatureCard
                icon={<Code2 className="h-5 w-5" />}
                title="BAL Language"
                description="Define agents in plain, readable code. No boilerplate, no frameworks &mdash; just describe what you want."
                color="primary"
              />
              <FeatureCard
                icon={<Bot className="h-5 w-5" />}
                title="Agent Chaining"
                description="Connect agents together. One bot's output feeds the next. Build pipelines that handle complex workflows."
                color="accent"
              />
              <FeatureCard
                icon={<Eye className="h-5 w-5" />}
                title="Real-time Streaming"
                description="Watch your agent think. See every tool call, decision, and reasoning step as it happens."
                color="block-ai"
              />
              <FeatureCard
                icon={<Globe className="h-5 w-5" />}
                title="Built-in Tools"
                description="Web search, URL fetch, notifications, scheduling, memory &mdash; ready to use out of the box."
                color="primary"
              />
              <FeatureCard
                icon={<Shield className="h-5 w-5" />}
                title="Human-in-the-Loop"
                description="Set approval gates for sensitive actions. Your agents ask permission before doing anything risky."
                color="accent"
              />
              <FeatureCard
                icon={<Timer className="h-5 w-5" />}
                title="Triggers & Schedules"
                description="Run agents on webhooks, schedules, or when another agent completes. Fully automated."
                color="block-ai"
              />
            </div>
          </div>
        </section>

        {/* ===== HOW IT WORKS ===== */}
        <section id="how-it-works" className="container pb-24 sm:pb-32">
          <div className="max-w-5xl mx-auto">
            {/* Section header */}
            <div className="text-center space-y-4 mb-16">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-xs font-medium text-primary">
                How It Works
              </div>
              <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">
                From idea to production in three steps
              </h2>
            </div>

            {/* Steps */}
            <div className="grid md:grid-cols-3 gap-8 md:gap-12">
              <StepCard
                number="01"
                title="Describe your agent"
                description="Write what you want in BAL &mdash; a simple, readable language. Or let our AI creator bot generate it from a plain English description."
                icon={<MessageSquare className="h-5 w-5" />}
              />
              <StepCard
                number="02"
                title="Connect & configure"
                description="Add your AI provider (OpenAI, Anthropic, Ollama), attach tools, set up triggers. Everything wires together visually."
                icon={<Layers className="h-5 w-5" />}
              />
              <StepCard
                number="03"
                title="Test & deploy"
                description="Run your agent with real inputs. Watch the execution stream in real-time. When it works, deploy with one click."
                icon={<Zap className="h-5 w-5" />}
              />
            </div>
          </div>
        </section>

        {/* ===== USE CASES ===== */}
        <section className="container pb-24 sm:pb-32">
          <div className="max-w-5xl mx-auto">
            <div className="text-center space-y-4 mb-16">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-accent/10 text-xs font-medium text-accent">
                Use Cases
              </div>
              <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">
                Built for real-world workflows
              </h2>
            </div>

            <div className="grid sm:grid-cols-2 gap-6">
              <UseCaseCard
                title="Customer Support"
                description="Auto-triage tickets, search your knowledge base, draft responses, and escalate when needed."
                tags={['web_search', 'send_notification', 'spawn_baleybot']}
              />
              <UseCaseCard
                title="Data Pipeline"
                description="Fetch data from APIs, transform it with AI, store results, and alert your team on anomalies."
                tags={['fetch_url', 'store_memory', 'schedule_task']}
              />
              <UseCaseCard
                title="Content Generation"
                description="Research topics, generate drafts, fact-check claims, and publish to your CMS automatically."
                tags={['web_search', 'fetch_url', 'spawn_baleybot']}
              />
              <UseCaseCard
                title="Internal Tooling"
                description="Natural language interfaces for your databases, APIs, and internal systems. No UI needed."
                tags={['create_tool', 'store_memory', 'send_notification']}
              />
            </div>
          </div>
        </section>

        {/* ===== ARCHITECTURE CALLOUT ===== */}
        <section className="container pb-24 sm:pb-32">
          <div className="max-w-4xl mx-auto">
            <div className="relative rounded-2xl border border-border bg-card/60 backdrop-blur-sm p-8 sm:p-12 overflow-hidden">
              {/* Background decoration */}
              <div
                className="absolute top-0 right-0 w-[300px] h-[300px] rounded-full opacity-20"
                style={{ background: 'radial-gradient(circle, hsl(262 83% 58% / 0.2) 0%, transparent 60%)' }}
              />

              <div className="relative grid md:grid-cols-2 gap-8 items-center">
                <div className="space-y-4">
                  <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">
                    Open architecture,{' '}
                    <span className="text-gradient">your infrastructure</span>
                  </h2>
                  <p className="text-muted-foreground leading-relaxed">
                    Bring your own AI provider. Connect to your own databases. Deploy
                    on your own infrastructure. BaleyUI is a platform, not a walled garden.
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <ArchBadge icon={<Brain className="h-4 w-4" />} label="Any LLM" sublabel="OpenAI, Anthropic, Ollama" />
                  <ArchBadge icon={<GitBranch className="h-4 w-4" />} label="Multi-Agent" sublabel="Chain, branch, loop" />
                  <ArchBadge icon={<Workflow className="h-4 w-4" />} label="Webhooks" sublabel="Trigger from anywhere" />
                  <ArchBadge icon={<Shield className="h-4 w-4" />} label="Approval Gates" sublabel="Human-in-the-loop" />
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ===== FINAL CTA ===== */}
        <section className="container pb-24 sm:pb-32">
          <div className="max-w-3xl mx-auto text-center space-y-8">
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">
              Ready to build something{' '}
              <span className="text-gradient-warm">extraordinary</span>?
            </h2>
            <p className="text-lg text-muted-foreground">
              Start with our free tier. Scale when you&apos;re ready.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link href={ROUTES.auth.signUp}>
                <Button variant="premium" size="lg" className="gap-2 text-base h-13 px-8">
                  Get Started Free
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
            </div>
          </div>
        </section>

        {/* ===== FOOTER ===== */}
        <footer className="container py-8 border-t border-border">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-muted-foreground">
            <div className="flex items-center gap-2.5">
              <div className="h-6 w-6 rounded-lg bg-primary/10 flex items-center justify-center">
                <Sparkles className="h-3 w-3 text-primary" />
              </div>
              <span>BaleyUI &copy; {new Date().getFullYear()}</span>
            </div>
            <div className="flex items-center gap-6">
              <Link href={ROUTES.apiDocs} className="hover:text-foreground transition-colors">Docs</Link>
              <Link href="https://github.com/baleybots" className="hover:text-foreground transition-colors">GitHub</Link>
            </div>
          </div>
        </footer>
      </div>
    </main>
  );
}

/* ===== COMPONENT HELPERS ===== */

function FeatureCard({
  icon,
  title,
  description,
  color,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  color: string;
}) {
  return (
    <div className="group relative p-6 rounded-2xl bg-card border border-border hover:border-primary/20 transition-all duration-300">
      <div className={`absolute inset-0 rounded-2xl bg-gradient-to-br from-${color}/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity`} />
      <div className="relative space-y-3">
        <div className={`h-10 w-10 rounded-xl bg-${color}/10 flex items-center justify-center text-${color}`}>
          {icon}
        </div>
        <h3 className="font-semibold">{title}</h3>
        <p
          className="text-sm text-muted-foreground leading-relaxed"
          dangerouslySetInnerHTML={{ __html: description }}
        />
      </div>
    </div>
  );
}

function StepCard({
  number,
  title,
  description,
  icon,
}: {
  number: string;
  title: string;
  description: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="relative space-y-4">
      <div className="flex items-center gap-3">
        <span className="text-4xl font-bold text-primary/15">{number}</span>
        <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
          {icon}
        </div>
      </div>
      <h3 className="text-lg font-semibold">{title}</h3>
      <p
        className="text-sm text-muted-foreground leading-relaxed"
        dangerouslySetInnerHTML={{ __html: description }}
      />
    </div>
  );
}

function UseCaseCard({
  title,
  description,
  tags,
}: {
  title: string;
  description: string;
  tags: string[];
}) {
  return (
    <div className="group p-6 rounded-2xl bg-card border border-border hover:border-primary/20 transition-all duration-300">
      <div className="space-y-3">
        <h3 className="font-semibold">{title}</h3>
        <p className="text-sm text-muted-foreground leading-relaxed">{description}</p>
        <div className="flex flex-wrap gap-2 pt-1">
          {tags.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-secondary text-secondary-foreground"
            >
              {tag}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function ArchBadge({
  icon,
  label,
  sublabel,
}: {
  icon: React.ReactNode;
  label: string;
  sublabel: string;
}) {
  return (
    <div className="flex items-center gap-3 p-3 rounded-xl bg-muted/50 border border-border">
      <div className="text-primary">{icon}</div>
      <div>
        <div className="text-sm font-medium">{label}</div>
        <div className="text-xs text-muted-foreground">{sublabel}</div>
      </div>
    </div>
  );
}
