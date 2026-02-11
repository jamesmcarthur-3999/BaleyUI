import { z } from 'zod';
import { router, protectedProcedure, roleProcedure, adminProcedure } from '../trpc';
import {
  db,
  workspaceMembers,
  workspaceInvitations,
  users,
  eq,
  and,
  isNull,
} from '@baleyui/db';
import { TRPCError } from '@trpc/server';
import { randomBytes } from 'crypto';

const VALID_ROLES = ['admin', 'editor', 'operator', 'viewer'] as const;
type WorkspaceRole = (typeof VALID_ROLES)[number];

export const teamRouter = router({
  /**
   * List workspace members with user details.
   */
  listMembers: roleProcedure.query(async ({ ctx }) => {
    const members = await db.query.workspaceMembers.findMany({
      where: and(
        eq(workspaceMembers.workspaceId, ctx.workspace.id),
        isNull(workspaceMembers.deletedAt)
      ),
      with: {
        user: {
          columns: {
            id: true,
            email: true,
            name: true,
            avatarUrl: true,
          },
        },
      },
    });

    return members.map((m) => ({
      id: m.id,
      userId: m.userId,
      role: m.role as WorkspaceRole,
      joinedAt: m.joinedAt,
      user: m.user
        ? {
            email: m.user.email,
            name: m.user.name,
            avatarUrl: m.user.avatarUrl,
          }
        : null,
    }));
  }),

  /**
   * Invite a member to the workspace.
   * Creates an invitation with a unique token and 7-day expiry.
   */
  inviteMember: adminProcedure
    .input(
      z.object({
        email: z.string().email(),
        role: z.enum(VALID_ROLES).default('editor'),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Check if user with this email is already a member
      const userWithEmail = await db.query.users.findFirst({
        where: eq(users.email, input.email),
      });

      if (userWithEmail) {
        const existingMember = await db.query.workspaceMembers.findFirst({
          where: and(
            eq(workspaceMembers.workspaceId, ctx.workspace.id),
            eq(workspaceMembers.userId, userWithEmail.id),
            isNull(workspaceMembers.deletedAt)
          ),
        });

        if (existingMember) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'This user is already a member of the workspace',
          });
        }
      }

      // Check for existing pending invitation
      const existingInvite = await db.query.workspaceInvitations.findFirst({
        where: and(
          eq(workspaceInvitations.workspaceId, ctx.workspace.id),
          eq(workspaceInvitations.email, input.email),
          eq(workspaceInvitations.status, 'pending')
        ),
      });

      if (existingInvite) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'An invitation has already been sent to this email',
        });
      }

      const token = randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

      const [invitation] = await db
        .insert(workspaceInvitations)
        .values({
          workspaceId: ctx.workspace.id,
          email: input.email,
          role: input.role,
          token,
          invitedBy: ctx.userId!,
          expiresAt,
        })
        .returning();

      return {
        id: invitation!.id,
        email: input.email,
        role: input.role,
        token,
        expiresAt,
      };
    }),

  /**
   * Update a member's role.
   */
  updateRole: adminProcedure
    .input(
      z.object({
        userId: z.string(),
        role: z.enum(VALID_ROLES),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Cannot change own role
      if (ctx.userId === input.userId) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'You cannot change your own role',
        });
      }

      const member = await db.query.workspaceMembers.findFirst({
        where: and(
          eq(workspaceMembers.workspaceId, ctx.workspace.id),
          eq(workspaceMembers.userId, input.userId),
          isNull(workspaceMembers.deletedAt)
        ),
      });

      if (!member) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Member not found',
        });
      }

      await db
        .update(workspaceMembers)
        .set({
          role: input.role,
          updatedAt: new Date(),
        })
        .where(eq(workspaceMembers.id, member.id));

      return { success: true };
    }),

  /**
   * Remove a member from the workspace (soft delete).
   */
  removeMember: adminProcedure
    .input(
      z.object({
        userId: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Cannot remove workspace owner
      if (input.userId === ctx.workspace.ownerId) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Cannot remove the workspace owner',
        });
      }

      // Cannot remove yourself
      if (ctx.userId === input.userId) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'You cannot remove yourself',
        });
      }

      const member = await db.query.workspaceMembers.findFirst({
        where: and(
          eq(workspaceMembers.workspaceId, ctx.workspace.id),
          eq(workspaceMembers.userId, input.userId),
          isNull(workspaceMembers.deletedAt)
        ),
      });

      if (!member) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Member not found',
        });
      }

      await db
        .update(workspaceMembers)
        .set({ deletedAt: new Date() })
        .where(eq(workspaceMembers.id, member.id));

      return { success: true };
    }),

  /**
   * List pending invitations.
   */
  listInvitations: roleProcedure.query(async ({ ctx }) => {
    const invitations = await db.query.workspaceInvitations.findMany({
      where: and(
        eq(workspaceInvitations.workspaceId, ctx.workspace.id),
        eq(workspaceInvitations.status, 'pending')
      ),
    });

    return invitations.map((inv) => ({
      id: inv.id,
      email: inv.email,
      role: inv.role as WorkspaceRole,
      expiresAt: inv.expiresAt,
      createdAt: inv.createdAt,
    }));
  }),

  /**
   * Revoke a pending invitation.
   */
  revokeInvitation: adminProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const invitation = await db.query.workspaceInvitations.findFirst({
        where: and(
          eq(workspaceInvitations.id, input.id),
          eq(workspaceInvitations.workspaceId, ctx.workspace.id),
          eq(workspaceInvitations.status, 'pending')
        ),
      });

      if (!invitation) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Invitation not found or already handled',
        });
      }

      await db
        .update(workspaceInvitations)
        .set({ status: 'revoked' })
        .where(eq(workspaceInvitations.id, input.id));

      return { success: true };
    }),

  /**
   * Accept an invitation (by token).
   */
  acceptInvitation: protectedProcedure
    .input(z.object({ token: z.string() }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.userId) {
        throw new TRPCError({ code: 'UNAUTHORIZED' });
      }

      const invitation = await db.query.workspaceInvitations.findFirst({
        where: and(
          eq(workspaceInvitations.token, input.token),
          eq(workspaceInvitations.status, 'pending')
        ),
      });

      if (!invitation) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Invitation not found or already used',
        });
      }

      if (new Date() > invitation.expiresAt) {
        await db
          .update(workspaceInvitations)
          .set({ status: 'expired' })
          .where(eq(workspaceInvitations.id, invitation.id));
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'This invitation has expired',
        });
      }

      // Check if already a member
      const existingMember = await db.query.workspaceMembers.findFirst({
        where: and(
          eq(workspaceMembers.workspaceId, invitation.workspaceId),
          eq(workspaceMembers.userId, ctx.userId),
          isNull(workspaceMembers.deletedAt)
        ),
      });

      if (existingMember) {
        // Mark invitation as accepted even if already a member
        await db
          .update(workspaceInvitations)
          .set({ status: 'accepted', acceptedAt: new Date() })
          .where(eq(workspaceInvitations.id, invitation.id));

        return { workspaceId: invitation.workspaceId, alreadyMember: true };
      }

      // Create membership
      await db.insert(workspaceMembers).values({
        workspaceId: invitation.workspaceId,
        userId: ctx.userId,
        role: invitation.role,
        addedBy: invitation.invitedBy,
      });

      // Mark invitation as accepted
      await db
        .update(workspaceInvitations)
        .set({ status: 'accepted', acceptedAt: new Date() })
        .where(eq(workspaceInvitations.id, invitation.id));

      return { workspaceId: invitation.workspaceId, alreadyMember: false };
    }),

  /**
   * Get the current user's role in the workspace.
   */
  getMyRole: roleProcedure.query(async ({ ctx }) => {
    if (!ctx.userId) {
      return { role: null as WorkspaceRole | null };
    }

    // Workspace owner is always admin
    if (ctx.userId === ctx.workspace.ownerId) {
      return { role: 'admin' as WorkspaceRole };
    }

    const member = await db.query.workspaceMembers.findFirst({
      where: and(
        eq(workspaceMembers.workspaceId, ctx.workspace.id),
        eq(workspaceMembers.userId, ctx.userId),
        isNull(workspaceMembers.deletedAt)
      ),
    });

    return { role: (member?.role as WorkspaceRole) ?? null };
  }),
});
