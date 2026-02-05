import { fetchRequestHandler } from '@trpc/server/adapters/fetch';
import { appRouter } from '@/lib/trpc/routers';
import { createTRPCContext } from '@/lib/trpc/trpc';
import { createLogger } from '@/lib/logger';

const logger = createLogger('api/trpc');

const handler = (req: Request) =>
  fetchRequestHandler({
    endpoint: '/api/trpc',
    req,
    router: appRouter,
    createContext: () => createTRPCContext(req),
    onError:
      process.env.NODE_ENV === 'development'
        ? ({ path, error }) => {
            logger.error(`tRPC failed on ${path ?? '<no-path>'}`, { message: error.message });
          }
        : undefined,
  });

export { handler as GET, handler as POST };
