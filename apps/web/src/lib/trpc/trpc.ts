import { initTRPC, TRPCError } from '@trpc/server';
import { auth } from '@clerk/nextjs/server';
import superjson from 'superjson';
import { db } from '@baleyui/db';

/**
 * Create tRPC context for each request.
 * Contains the database client and user info.
 */
export const createTRPCContext = async () => {
  const { userId } = await auth();
  return { db, userId };
};

export type Context = Awaited<ReturnType<typeof createTRPCContext>>;

const t = initTRPC.context<Context>().create({
  transformer: superjson,
  errorFormatter({ shape }) {
    return shape;
  },
});

export const router = t.router;
export const publicProcedure = t.procedure;

/**
 * Authenticated procedure - requires authentication but NOT a workspace.
 * Use this for operations like workspace creation or checking workspace status.
 */
export const authenticatedProcedure = t.procedure.use(async ({ ctx, next }) => {
  if (!ctx.userId) {
    throw new TRPCError({
      code: 'UNAUTHORIZED',
      message: 'You must be signed in to access this resource',
    });
  }

  return next({
    ctx: {
      ...ctx,
      userId: ctx.userId,
    },
  });
});

/**
 * Protected procedure - requires authentication.
 * Adds workspace to context after verifying user owns it.
 */
export const protectedProcedure = t.procedure.use(async ({ ctx, next }) => {
  if (!ctx.userId) {
    throw new TRPCError({
      code: 'UNAUTHORIZED',
      message: 'You must be signed in to access this resource',
    });
  }

  // Get the user's workspace using the schema from the same module
  const workspace = await ctx.db.query.workspaces.findFirst({
    where: (ws, { eq, and, isNull }) =>
      and(eq(ws.ownerId, ctx.userId!), isNull(ws.deletedAt)),
  });

  if (!workspace) {
    throw new TRPCError({
      code: 'NOT_FOUND',
      message: 'No workspace found for this user',
    });
  }

  return next({
    ctx: {
      ...ctx,
      userId: ctx.userId,
      workspace,
    },
  });
});

/**
 * Audited procedure - protected procedure with audit logging capability.
 * Use this for operations that should be logged for compliance/debugging.
 */
export const auditedProcedure = protectedProcedure.use(async (opts) => {
  // Import audit middleware dynamically to avoid circular dependencies
  const { auditMiddleware } = await import('../audit/middleware');
  return auditMiddleware({
    ctx: opts.ctx,
    next: opts.next,
    path: opts.path,
    type: opts.type,
  });
});
