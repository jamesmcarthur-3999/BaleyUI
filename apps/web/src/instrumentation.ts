/**
 * Next.js Instrumentation
 *
 * This file runs once when the server starts.
 * Used to initialize internal BaleyBots and built-in tool services.
 */

export async function register() {
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
