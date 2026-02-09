/**
 * Next.js Instrumentation
 *
 * This file runs once when the server starts.
 * Used to initialize internal BaleyBots and built-in tool services.
 */

import * as Sentry from '@sentry/nextjs';

let sentryInitialized = false;

function initializeSentry() {
  if (sentryInitialized) {
    return;
  }

  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    enabled: process.env.NODE_ENV === 'production',
    tracesSampleRate: 0.1,
  });

  sentryInitialized = true;
}

export async function register() {
  initializeSentry();

  // Only run on server
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { seedInternalBaleybots } = await import('@/lib/baleybot/internal-baleybots');
    const { initializeBuiltInToolServices } = await import('@/lib/baleybot/services');

    try {
      // Initialize built-in tool services
      initializeBuiltInToolServices({
        tavilyApiKey: process.env.TAVILY_API_KEY,
      });

      // Seed internal BaleyBots
      await seedInternalBaleybots();

      console.log('[instrumentation] BaleyUI initialized successfully');
    } catch (error) {
      console.error('[instrumentation] Failed to initialize:', error);
    }
  }
}
