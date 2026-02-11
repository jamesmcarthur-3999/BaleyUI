import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4">
      <div className="text-center">
        <p className="text-6xl font-bold text-primary">404</p>
        <h1 className="mt-4 text-2xl font-semibold text-foreground">
          Page not found
        </h1>
        <p className="mt-2 text-muted-foreground">
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
        </p>
        <div className="mt-8 flex items-center justify-center gap-4">
          <Link
            href="/dashboard"
            className="rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go to Dashboard
          </Link>
          <Link
            href="/"
            className="rounded-lg border border-border px-5 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-muted"
          >
            Back to Home
          </Link>
        </div>
      </div>
    </div>
  );
}
