'use client';

import { Component } from 'react';
import type { ReactNode, ErrorInfo } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * Client-side error boundary that reports platform crashes
 * to the platform bug tracking API.
 *
 * Wraps the root layout to catch React render errors.
 * Falls through to show a minimal recovery UI.
 */
export class PlatformErrorBoundary extends Component<Props, State> {
  /** Track reported hashes this session to avoid duplicate reports */
  private reportedHashes = new Set<string>();

  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    // Simple hash for session-level dedup
    const hash = `${error.message}:${error.stack?.slice(0, 200) ?? ''}`;
    if (this.reportedHashes.has(hash)) return;
    this.reportedHashes.add(hash);

    // Report to platform bug API (fire-and-forget)
    fetch('/api/platform-bugs/report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        errorMessage: error.message,
        stackTrace: error.stack,
        source: 'client',
        category: 'react_crash',
        route: typeof window !== 'undefined' ? window.location.pathname : undefined,
        environment: process.env.NODE_ENV ?? 'production',
        metadata: {
          componentStack: errorInfo.componentStack?.slice(0, 2000),
          userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
        },
      }),
    }).catch(() => {
      // Silently fail — don't compound the error
    });
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center p-8 bg-background">
          <div className="max-w-md w-full text-center">
            <div className="rounded-2xl bg-muted/30 p-4 mb-4 inline-block">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="32"
                height="32"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="text-muted-foreground"
              >
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            </div>
            <h2 className="text-lg font-semibold mb-2">Something went wrong</h2>
            <p className="text-sm text-muted-foreground mb-4">
              An unexpected error occurred. This has been automatically reported.
            </p>
            <button
              onClick={() => {
                this.setState({ hasError: false, error: null });
                window.location.reload();
              }}
              className="inline-flex items-center px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity"
            >
              Reload page
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
