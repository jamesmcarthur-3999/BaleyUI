import { initTRPC, TRPCError } from '@trpc/server';
import { auth } from '@clerk/nextjs/server';
import superjson from 'superjson';
import { db } from '@baleyui/db';
import { validateApiKey } from '@/lib/api/validate-api-key';

/**
 * Create tRPC context for each request.
 * Contains the database client and user info.
 * Supports both Clerk session auth and API key auth.
 */
export const createTRPCContext = async (req?: Request) => {
  // Try Clerk session auth first
  const { userId } = await auth();
  if (userId) {
    return { db, userId, workspaceId: null as string | null, authMethod: 'session' as const };
  }

  // Try API key auth if request is provided
  if (req) {
    const authHeader = req.headers.get('authorization');
    if (authHeader?.startsWith('Bearer bui_')) {
      try {
        const validation = await validateApiKey(authHeader);
        return {
          db,
          userId: null,
          workspaceId: validation.workspaceId,
          authMethod: 'api_key' as const,
        };
      } catch {
        // Invalid API key, fall through
      }
    }
  }

  return { db, userId: null, workspaceId: null as string | null, authMethod: null };
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
 * Protected procedure - requires authentication (session or API key).
 * Adds workspace to context after verifying access.
 */
export const protectedProcedure = t.procedure.use(async ({ ctx, next }) => {
  // API key auth - workspace comes from the API key validation
  if (ctx.authMethod === 'api_key' && ctx.workspaceId) {
    const workspace = await ctx.db.query.workspaces.findFirst({
      where: (ws, { eq, and, isNull }) =>
        and(eq(ws.id, ctx.workspaceId!), isNull(ws.deletedAt)),
    });

    if (!workspace) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'Workspace not found',
      });
    }

    return next({
      ctx: {
        ...ctx,
        userId: null,
        workspace,
      },
    });
  }

  // Session auth - require userId
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
 * Admin procedure - requires authentication and admin user ID.
 * Overrides workspace context with the system workspace.
 */
export const adminProcedure = authenticatedProcedure.use(async ({ ctx, next }) => {
  const adminUserIds = (process.env.ADMIN_USER_IDS || '').split(',').map((id) => id.trim()).filter(Boolean);

  if (!adminUserIds.includes(ctx.userId)) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Admin access required',
    });
  }

  // Resolve system workspace for admin operations
  const { getOrCreateSystemWorkspace } = await import('@/lib/system-workspace');
  const systemWorkspaceId = await getOrCreateSystemWorkspace();

  const workspace = await ctx.db.query.workspaces.findFirst({
    where: (ws, { eq: wsEq, isNull, and: wsAnd }) => wsAnd(wsEq(ws.id, systemWorkspaceId), isNull(ws.deletedAt)),
  });

  if (!workspace) {
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'System workspace not found',
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
