import { z } from 'zod';
import { router, systemAdminProcedure } from '../trpc';
import {
  baleybots,
  eq,
  and,
  desc,
  asc,
  notDeleted,
  updateWithLock,
  baleybotExecutions,
  user,
  session,
  workspaces,
  platformBugs,
  aiModels,
  db,
  sql,
  gt,
  lt,
  ne,
} from '@baleyui/db';
import { TRPCError } from '@trpc/server';
import { INTERNAL_BALEYBOTS } from '@/lib/baleybot/internal-baleybots';
import {
  uuidSchema,
  nameSchema,
  descriptionSchema,
  balCodeSchema,
  versionSchema,
} from '../helpers';

/**
 * Admin router for managing internal BaleyBots and system-wide auth/user management.
 * All procedures require admin privileges.
 */
export const adminRouter = router({
  // ============================================================================
  // ADMIN STATUS
  // ============================================================================

  isAdmin: systemAdminProcedure.query(() => true),

  // ============================================================================
  // INTERNAL BALEYBOTS MANAGEMENT
  // ============================================================================

  listInternalBaleybots: systemAdminProcedure.query(async ({ ctx }) => {
    const results = await ctx.db.query.baleybots.findMany({
      where: and(
        eq(baleybots.workspaceId, ctx.workspace.id),
        eq(baleybots.isInternal, true),
        notDeleted(baleybots)
      ),
      orderBy: [desc(baleybots.createdAt)],
    });

    return results.map((bb) => ({
      ...bb,
      hasDefaultCode: bb.name in INTERNAL_BALEYBOTS
        ? bb.balCode === INTERNAL_BALEYBOTS[bb.name]!.balCode.trim()
        : false,
    }));
  }),

  getInternalBaleybot: systemAdminProcedure
    .input(z.object({ id: uuidSchema }))
    .query(async ({ ctx, input }) => {
      const bb = await ctx.db.query.baleybots.findFirst({
        where: and(
          eq(baleybots.id, input.id),
          eq(baleybots.workspaceId, ctx.workspace.id),
          eq(baleybots.isInternal, true),
          notDeleted(baleybots)
        ),
        with: {
          executions: {
            limit: 10,
            orderBy: [desc(baleybotExecutions.createdAt)],
            columns: {
              id: true,
              status: true,
              createdAt: true,
              completedAt: true,
              durationMs: true,
              error: true,
              triggeredBy: true,
            },
          },
        },
      });

      if (!bb) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Internal BaleyBot not found',
        });
      }

      const defaultDef = INTERNAL_BALEYBOTS[bb.name];

      return {
        ...bb,
        hasDefaultCode: defaultDef
          ? bb.balCode === defaultDef.balCode.trim()
          : false,
        defaultBalCode: defaultDef?.balCode.trim() ?? null,
      };
    }),

  updateInternalBaleybot: systemAdminProcedure
    .input(
      z.object({
        id: uuidSchema,
        version: versionSchema,
        name: nameSchema.optional(),
        description: descriptionSchema,
        icon: z.string().max(100).optional(),
        balCode: balCodeSchema.optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.query.baleybots.findFirst({
        where: and(
          eq(baleybots.id, input.id),
          eq(baleybots.workspaceId, ctx.workspace.id),
          eq(baleybots.isInternal, true),
          notDeleted(baleybots)
        ),
      });

      if (!existing) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Internal BaleyBot not found',
        });
      }

      const updates: Record<string, unknown> = {
        adminEdited: true,
        updatedAt: new Date(),
      };

      if (input.name !== undefined) updates.name = input.name;
      if (input.description !== undefined) updates.description = input.description;
      if (input.icon !== undefined) updates.icon = input.icon;
      if (input.balCode !== undefined) updates.balCode = input.balCode;

      await updateWithLock(baleybots, input.id, input.version, updates);

      return { success: true };
    }),

  resetToDefault: systemAdminProcedure
    .input(
      z.object({
        id: uuidSchema,
        version: versionSchema,
      })
    )
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.query.baleybots.findFirst({
        where: and(
          eq(baleybots.id, input.id),
          eq(baleybots.workspaceId, ctx.workspace.id),
          eq(baleybots.isInternal, true),
          notDeleted(baleybots)
        ),
      });

      if (!existing) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Internal BaleyBot not found',
        });
      }

      const defaultDef = INTERNAL_BALEYBOTS[existing.name];
      if (!defaultDef) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `No default definition found for "${existing.name}"`,
        });
      }

      await updateWithLock(baleybots, input.id, input.version, {
        balCode: defaultDef.balCode.trim(),
        description: defaultDef.description,
        icon: defaultDef.icon,
        adminEdited: false,
        updatedAt: new Date(),
      });

      return { success: true };
    }),

  // ============================================================================
  // USER MANAGEMENT
  // ============================================================================

  listUsers: systemAdminProcedure
    .input(
      z.object({
        search: z.string().optional(),
        limit: z.number().int().min(1).max(100).default(50),
        offset: z.number().int().min(0).default(0),
      }).optional()
    )
    .query(async ({ input }) => {
      const { search, limit = 50, offset = 0 } = input ?? {};

      // Build where conditions
      const conditions = [];
      if (search) {
        conditions.push(
          sql`(${user.name} ILIKE ${'%' + search + '%'} OR ${user.email} ILIKE ${'%' + search + '%'})`
        );
      }

      const where = conditions.length > 0 ? sql`${sql.join(conditions, sql` AND `)}` : undefined;

      const [allUsers, countResult] = await Promise.all([
        db
          .select({
            id: user.id,
            name: user.name,
            email: user.email,
            emailVerified: user.emailVerified,
            image: user.image,
            createdAt: user.createdAt,
            updatedAt: user.updatedAt,
          })
          .from(user)
          .where(where)
          .orderBy(desc(user.createdAt))
          .limit(limit)
          .offset(offset),
        db
          .select({ count: sql<number>`count(*)::int` })
          .from(user)
          .where(where),
      ]);

      // Get session counts and workspace names for each user
      const userIds = allUsers.map((u) => u.id);
      if (userIds.length === 0) {
        return { users: [], total: 0 };
      }

      const now = new Date();
      const [sessionCounts, workspaceMap, lastActiveMap] = await Promise.all([
        // Active session counts
        db
          .select({
            userId: session.userId,
            count: sql<number>`count(*)::int`,
          })
          .from(session)
          .where(
            and(
              sql`${session.userId} = ANY(${userIds})`,
              gt(session.expiresAt, now)
            )
          )
          .groupBy(session.userId),
        // Workspace info
        db
          .select({
            ownerId: workspaces.ownerId,
            name: workspaces.name,
          })
          .from(workspaces)
          .where(
            and(
              sql`${workspaces.ownerId} = ANY(${userIds})`,
              notDeleted(workspaces)
            )
          ),
        // Last active session
        db
          .select({
            userId: session.userId,
            lastActive: sql<Date>`max(${session.updatedAt})`,
          })
          .from(session)
          .where(sql`${session.userId} = ANY(${userIds})`)
          .groupBy(session.userId),
      ]);

      const sessionCountMap = new Map(sessionCounts.map((s) => [s.userId, s.count]));
      const wsMap = new Map(workspaceMap.map((w) => [w.ownerId, w.name]));
      const activeMap = new Map(lastActiveMap.map((a) => [a.userId, a.lastActive]));

      const users = allUsers.map((u) => ({
        ...u,
        activeSessions: sessionCountMap.get(u.id) ?? 0,
        workspaceName: wsMap.get(u.id) ?? null,
        lastActive: activeMap.get(u.id) ?? null,
      }));

      return {
        users,
        total: countResult[0]?.count ?? 0,
      };
    }),

  getUser: systemAdminProcedure
    .input(z.object({ id: z.string().min(1) }))
    .query(async ({ input }) => {
      const found = await db.query.user.findFirst({
        where: eq(user.id, input.id),
        with: {
          sessions: {
            orderBy: [desc(session.createdAt)],
          },
          accounts: true,
        },
      });

      if (!found) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'User not found' });
      }

      // Get workspace
      const workspace = await db.query.workspaces.findFirst({
        where: and(eq(workspaces.ownerId, input.id), notDeleted(workspaces)),
        columns: { id: true, name: true, slug: true, createdAt: true },
      });

      // Get recent executions for this user's workspace
      let recentExecutions: Array<{
        id: string;
        status: string;
        createdAt: Date;
        durationMs: number | null;
        baleybotName: string | null;
      }> = [];

      if (workspace) {
        const execRows = await db
          .select({
            id: baleybotExecutions.id,
            status: baleybotExecutions.status,
            createdAt: baleybotExecutions.createdAt,
            durationMs: baleybotExecutions.durationMs,
            baleybotName: baleybots.name,
          })
          .from(baleybotExecutions)
          .innerJoin(baleybots, eq(baleybotExecutions.baleybotId, baleybots.id))
          .where(eq(baleybots.workspaceId, workspace.id))
          .orderBy(desc(baleybotExecutions.createdAt))
          .limit(10);

        recentExecutions = execRows;
      }

      return {
        ...found,
        workspace,
        recentExecutions,
      };
    }),

  deleteUser: systemAdminProcedure
    .input(z.object({ id: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      if (input.id === ctx.userId) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Cannot delete your own account',
        });
      }

      const found = await db.query.user.findFirst({
        where: eq(user.id, input.id),
      });

      if (!found) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'User not found' });
      }

      // Delete all sessions first, then the user (cascades handle the rest)
      await db.delete(session).where(eq(session.userId, input.id));
      await db.delete(user).where(eq(user.id, input.id));

      return { success: true };
    }),

  // ============================================================================
  // SESSION MANAGEMENT
  // ============================================================================

  listSessions: systemAdminProcedure
    .input(
      z.object({
        filter: z.enum(['all', 'active', 'expired']).default('all'),
        limit: z.number().int().min(1).max(100).default(50),
        offset: z.number().int().min(0).default(0),
      }).optional()
    )
    .query(async ({ input }) => {
      const { filter = 'all', limit = 50, offset = 0 } = input ?? {};
      const now = new Date();

      const conditions = [];
      if (filter === 'active') {
        conditions.push(gt(session.expiresAt, now));
      } else if (filter === 'expired') {
        conditions.push(lt(session.expiresAt, now));
      }

      const where = conditions.length > 0 ? and(...conditions) : undefined;

      const [sessions, countResult] = await Promise.all([
        db
          .select({
            id: session.id,
            userId: session.userId,
            ipAddress: session.ipAddress,
            userAgent: session.userAgent,
            expiresAt: session.expiresAt,
            createdAt: session.createdAt,
            updatedAt: session.updatedAt,
            userName: user.name,
            userEmail: user.email,
          })
          .from(session)
          .leftJoin(user, eq(session.userId, user.id))
          .where(where)
          .orderBy(desc(session.createdAt))
          .limit(limit)
          .offset(offset),
        db
          .select({ count: sql<number>`count(*)::int` })
          .from(session)
          .where(where),
      ]);

      return {
        sessions,
        total: countResult[0]?.count ?? 0,
      };
    }),

  revokeSession: systemAdminProcedure
    .input(z.object({ sessionId: z.string().min(1) }))
    .mutation(async ({ input }) => {
      await db.delete(session).where(eq(session.id, input.sessionId));
      return { success: true };
    }),

  revokeAllUserSessions: systemAdminProcedure
    .input(z.object({ userId: z.string().min(1) }))
    .mutation(async ({ input }) => {
      // Count first, then delete
      const countResult = await db.select({ count: sql<number>`count(*)::int` }).from(session).where(eq(session.userId, input.userId));
      await db.delete(session).where(eq(session.userId, input.userId));
      return { success: true, count: countResult[0]?.count ?? 0 };
    }),

  revokeExpiredSessions: systemAdminProcedure.mutation(async () => {
    const now = new Date();
    const countResult = await db.select({ count: sql<number>`count(*)::int` }).from(session).where(lt(session.expiresAt, now));
    await db.delete(session).where(lt(session.expiresAt, now));
    return { success: true, count: countResult[0]?.count ?? 0 };
  }),

  // ============================================================================
  // SYSTEM OVERVIEW / STATS
  // ============================================================================

  getSystemStats: systemAdminProcedure.query(async () => {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const [
      totalUsersResult,
      newUsersThisWeekResult,
      activeSessionsResult,
      expiredSessionsResult,
      totalWorkspacesResult,
      totalBaleybotsResult,
      internalBaleybotsResult,
      executionsTodayResult,
      totalExecutionsResult,
    ] = await Promise.all([
      db.select({ count: sql<number>`count(*)::int` }).from(user),
      db.select({ count: sql<number>`count(*)::int` }).from(user).where(gt(user.createdAt, weekAgo)),
      db.select({ count: sql<number>`count(*)::int` }).from(session).where(gt(session.expiresAt, now)),
      db.select({ count: sql<number>`count(*)::int` }).from(session).where(lt(session.expiresAt, now)),
      db.select({ count: sql<number>`count(*)::int` }).from(workspaces).where(notDeleted(workspaces)),
      db.select({ count: sql<number>`count(*)::int` }).from(baleybots).where(notDeleted(baleybots)),
      db.select({ count: sql<number>`count(*)::int` }).from(baleybots).where(
        and(eq(baleybots.isInternal, true), notDeleted(baleybots))
      ),
      db.select({ count: sql<number>`count(*)::int` }).from(baleybotExecutions).where(
        gt(baleybotExecutions.createdAt, todayStart)
      ),
      db.select({ count: sql<number>`count(*)::int` }).from(baleybotExecutions),
    ]);

    return {
      totalUsers: totalUsersResult[0]?.count ?? 0,
      newUsersThisWeek: newUsersThisWeekResult[0]?.count ?? 0,
      activeSessions: activeSessionsResult[0]?.count ?? 0,
      expiredSessions: expiredSessionsResult[0]?.count ?? 0,
      totalWorkspaces: totalWorkspacesResult[0]?.count ?? 0,
      totalBaleybots: totalBaleybotsResult[0]?.count ?? 0,
      internalBaleybots: internalBaleybotsResult[0]?.count ?? 0,
      executionsToday: executionsTodayResult[0]?.count ?? 0,
      totalExecutions: totalExecutionsResult[0]?.count ?? 0,
    };
  }),

  getRecentActivity: systemAdminProcedure.query(async () => {
    // Get recent user signups
    const recentUsers = await db
      .select({
        id: user.id,
        name: user.name,
        email: user.email,
        createdAt: user.createdAt,
      })
      .from(user)
      .orderBy(desc(user.createdAt))
      .limit(10);

    // Get recent executions
    const recentExecutions = await db
      .select({
        id: baleybotExecutions.id,
        status: baleybotExecutions.status,
        createdAt: baleybotExecutions.createdAt,
        durationMs: baleybotExecutions.durationMs,
        baleybotName: baleybots.name,
        isInternal: baleybots.isInternal,
      })
      .from(baleybotExecutions)
      .innerJoin(baleybots, eq(baleybotExecutions.baleybotId, baleybots.id))
      .orderBy(desc(baleybotExecutions.createdAt))
      .limit(20);

    // Merge and sort into a unified activity timeline
    type ActivityItem =
      | { type: 'user_signup'; data: (typeof recentUsers)[0]; timestamp: Date }
      | { type: 'execution'; data: (typeof recentExecutions)[0]; timestamp: Date };

    const items: ActivityItem[] = [
      ...recentUsers.map((u) => ({ type: 'user_signup' as const, data: u, timestamp: u.createdAt })),
      ...recentExecutions.map((e) => ({ type: 'execution' as const, data: e, timestamp: e.createdAt })),
    ];

    items.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    return items.slice(0, 20);
  }),

  getAuthHealth: systemAdminProcedure.query(async () => {
    const now = new Date();

    const [
      totalActiveResult,
      totalExpiredResult,
      usersWithNoSessionsResult,
      avgSessionAgeResult,
    ] = await Promise.all([
      db.select({ count: sql<number>`count(*)::int` }).from(session).where(gt(session.expiresAt, now)),
      db.select({ count: sql<number>`count(*)::int` }).from(session).where(lt(session.expiresAt, now)),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(user)
        .where(
          sql`${user.id} NOT IN (SELECT ${session.userId} FROM ${session} WHERE ${session.expiresAt} > ${now})`
        ),
      db
        .select({
          avgAge: sql<number>`EXTRACT(EPOCH FROM avg(${now} - ${session.createdAt}))::int`,
        })
        .from(session)
        .where(gt(session.expiresAt, now)),
    ]);

    return {
      totalActive: totalActiveResult[0]?.count ?? 0,
      totalExpired: totalExpiredResult[0]?.count ?? 0,
      usersWithNoSessions: usersWithNoSessionsResult[0]?.count ?? 0,
      avgSessionAgeSeconds: avgSessionAgeResult[0]?.avgAge ?? 0,
    };
  }),

  // ============================================================================
  // PLATFORM BUG TRACKING
  // ============================================================================

  listPlatformBugs: systemAdminProcedure
    .input(
      z.object({
        status: z.enum(['new', 'acknowledged', 'filed', 'resolved', 'wontfix']).optional(),
        severity: z.enum(['low', 'medium', 'high', 'critical']).optional(),
        category: z.string().optional(),
        environment: z.string().optional(),
        limit: z.number().int().min(1).max(100).default(50),
        offset: z.number().int().min(0).default(0),
      }).optional()
    )
    .query(async ({ input }) => {
      const { status, severity, category, environment, limit = 50, offset = 0 } = input ?? {};

      const conditions = [notDeleted(platformBugs)];
      if (status) conditions.push(eq(platformBugs.status, status));
      if (severity) conditions.push(eq(platformBugs.severity, severity));
      if (category) conditions.push(eq(platformBugs.category, category));
      if (environment) conditions.push(eq(platformBugs.environment, environment));

      const where = and(...conditions);

      const [bugs, countResult] = await Promise.all([
        db
          .select()
          .from(platformBugs)
          .where(where)
          .orderBy(desc(platformBugs.lastSeenAt))
          .limit(limit)
          .offset(offset),
        db
          .select({ count: sql<number>`count(*)::int` })
          .from(platformBugs)
          .where(where),
      ]);

      return {
        bugs,
        total: countResult[0]?.count ?? 0,
      };
    }),

  getPlatformBug: systemAdminProcedure
    .input(z.object({ id: uuidSchema }))
    .query(async ({ input }) => {
      const bug = await db.query.platformBugs.findFirst({
        where: and(
          eq(platformBugs.id, input.id),
          notDeleted(platformBugs)
        ),
      });

      if (!bug) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Platform bug not found' });
      }

      return bug;
    }),

  updatePlatformBugStatus: systemAdminProcedure
    .input(
      z.object({
        id: uuidSchema,
        version: versionSchema,
        status: z.enum(['acknowledged', 'filed', 'resolved', 'wontfix']),
        resolution: z.string().max(5000).optional(),
      })
    )
    .mutation(async ({ input }) => {
      const updates: Record<string, unknown> = {
        status: input.status,
        updatedAt: new Date(),
      };

      if (input.status === 'resolved') {
        updates.resolvedAt = new Date();
        if (input.resolution) {
          updates.resolution = input.resolution;
        }
      }

      await updateWithLock(platformBugs, input.id, input.version, updates);
      return { success: true };
    }),

  createGithubIssue: systemAdminProcedure
    .input(z.object({ id: uuidSchema, version: versionSchema }))
    .mutation(async ({ input }) => {
      const bug = await db.query.platformBugs.findFirst({
        where: and(
          eq(platformBugs.id, input.id),
          notDeleted(platformBugs)
        ),
      });

      if (!bug) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Platform bug not found' });
      }

      if (bug.githubIssueUrl) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'GitHub issue already exists' });
      }

      // Build issue body
      const issueTitle = bug.title ?? `[${bug.severity}] ${bug.category}: ${bug.errorMessage.slice(0, 80)}`;
      const issueBody = [
        `## Platform Bug Report`,
        ``,
        `**Category:** ${bug.category}`,
        `**Severity:** ${bug.severity}`,
        `**Source:** ${bug.source}`,
        `**Environment:** ${bug.environment}`,
        `**Occurrences:** ${bug.occurrenceCount}`,
        `**First seen:** ${bug.firstSeenAt.toISOString()}`,
        `**Last seen:** ${bug.lastSeenAt.toISOString()}`,
        ``,
        `### Error Message`,
        '```',
        bug.errorMessage.slice(0, 2000),
        '```',
        bug.stackTrace ? `\n### Stack Trace\n\`\`\`\n${bug.stackTrace.slice(0, 3000)}\n\`\`\`` : '',
        bug.rootCause ? `\n### Root Cause (AI Analysis)\n${bug.rootCause}` : '',
        bug.suggestedFix ? `\n### Suggested Fix (AI Analysis)\n${bug.suggestedFix}` : '',
        ``,
        `---`,
        `*Auto-filed by BaleyUI platform bug tracking*`,
      ].join('\n');

      // Call gh CLI to create issue
      const { exec } = await import('child_process');
      const { promisify } = await import('util');
      const execAsync = promisify(exec);

      try {
        const { stdout } = await execAsync(
          `gh issue create --title ${JSON.stringify(issueTitle.slice(0, 256))} --body ${JSON.stringify(issueBody)} --label "platform-bug,${bug.severity}"`,
          { timeout: 15000 }
        );

        // Parse the URL from gh output
        const urlMatch = stdout.trim().match(/https:\/\/github\.com\/[^\s]+/);
        const issueUrl = urlMatch?.[0] ?? stdout.trim();
        const numberMatch = issueUrl.match(/\/issues\/(\d+)/);
        const issueNumber = numberMatch?.[1] ? parseInt(numberMatch[1], 10) : null;

        await updateWithLock(platformBugs, input.id, input.version, {
          githubIssueUrl: issueUrl,
          githubIssueNumber: issueNumber,
          status: 'filed',
          updatedAt: new Date(),
        });

        return { success: true, issueUrl, issueNumber };
      } catch (err) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `Failed to create GitHub issue: ${err instanceof Error ? err.message : String(err)}`,
        });
      }
    }),

  // ============================================================================
  // MODEL LIBRARY
  // ============================================================================

  listModels: systemAdminProcedure
    .input(
      z.object({
        provider: z.string().optional(),
        tier: z.string().optional(),
        limit: z.number().int().min(1).max(200).default(100),
        offset: z.number().int().min(0).default(0),
      }).optional()
    )
    .query(async ({ input }) => {
      const { provider, tier, limit = 100, offset = 0 } = input ?? {};

      const conditions = [];
      if (provider) conditions.push(eq(aiModels.provider, provider));
      if (tier) conditions.push(eq(aiModels.tier, tier));

      const where = conditions.length > 0 ? and(...conditions) : undefined;

      const [models, countResult] = await Promise.all([
        db
          .select()
          .from(aiModels)
          .where(where)
          .orderBy(asc(aiModels.provider), asc(aiModels.tier), asc(aiModels.displayName))
          .limit(limit)
          .offset(offset),
        db
          .select({ count: sql<number>`count(*)::int` })
          .from(aiModels)
          .where(where),
      ]);

      return {
        models,
        total: countResult[0]?.count ?? 0,
      };
    }),

  getModelStats: systemAdminProcedure.query(async () => {
    const [totalResult, providerCounts, tierCounts, deprecatedResult] = await Promise.all([
      db.select({ count: sql<number>`count(*)::int` }).from(aiModels),
      db
        .select({
          provider: aiModels.provider,
          count: sql<number>`count(*)::int`,
        })
        .from(aiModels)
        .groupBy(aiModels.provider)
        .orderBy(asc(aiModels.provider)),
      db
        .select({
          tier: aiModels.tier,
          count: sql<number>`count(*)::int`,
        })
        .from(aiModels)
        .groupBy(aiModels.tier)
        .orderBy(asc(aiModels.tier)),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(aiModels)
        .where(sql`${aiModels.deprecatedAt} IS NOT NULL`),
    ]);

    return {
      total: totalResult[0]?.count ?? 0,
      byProvider: providerCounts,
      byTier: tierCounts,
      deprecated: deprecatedResult[0]?.count ?? 0,
    };
  }),

  getPlatformBugStats: systemAdminProcedure.query(async () => {
    const base = notDeleted(platformBugs);

    const [
      totalResult,
      newResult,
      criticalResult,
      highResult,
      todayResult,
    ] = await Promise.all([
      db.select({ count: sql<number>`count(*)::int` }).from(platformBugs).where(base),
      db.select({ count: sql<number>`count(*)::int` }).from(platformBugs).where(and(base, eq(platformBugs.status, 'new'))),
      db.select({ count: sql<number>`count(*)::int` }).from(platformBugs).where(and(base, eq(platformBugs.severity, 'critical'), ne(platformBugs.status, 'resolved'), ne(platformBugs.status, 'wontfix'))),
      db.select({ count: sql<number>`count(*)::int` }).from(platformBugs).where(and(base, eq(platformBugs.severity, 'high'), ne(platformBugs.status, 'resolved'), ne(platformBugs.status, 'wontfix'))),
      db.select({ count: sql<number>`count(*)::int` }).from(platformBugs).where(
        and(base, gt(platformBugs.firstSeenAt, new Date(Date.now() - 24 * 60 * 60 * 1000)))
      ),
    ]);

    return {
      total: totalResult[0]?.count ?? 0,
      new: newResult[0]?.count ?? 0,
      critical: criticalResult[0]?.count ?? 0,
      high: highResult[0]?.count ?? 0,
      last24h: todayResult[0]?.count ?? 0,
    };
  }),
});
