import Link from 'next/link';
import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { ROUTES } from '@/lib/routes';

export default async function HomePage() {
  const { userId } = await auth();

  // If signed in, redirect to dashboard
  if (userId) {
    redirect(ROUTES.dashboard);
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-background to-muted">
      <div className="container flex flex-col items-center justify-center gap-8 px-4 py-16">
        <h1 className="text-5xl font-bold tracking-tight sm:text-6xl">
          <span className="text-primary">Baley</span>UI
        </h1>
        <p className="max-w-2xl text-center text-xl text-muted-foreground">
          The most intuitive platform for AI-first product development. Not just
          chatbots—actual intelligent systems.
        </p>
        <div className="flex gap-4">
          <Link
            href={ROUTES.auth.signUp}
            className="rounded-md bg-primary px-6 py-3 font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Get Started
          </Link>
          <Link
            href={ROUTES.auth.signIn}
            className="rounded-md border border-border px-6 py-3 font-medium transition-colors hover:bg-accent"
          >
            Sign In
          </Link>
        </div>
      </div>
    </main>
  );
}
