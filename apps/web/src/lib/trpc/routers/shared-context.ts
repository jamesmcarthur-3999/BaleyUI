/**
 * Shared Context Router — workspace-scoped knowledge for BB execution
 *
 * Admins define shared knowledge (domain rules, coding standards, brand voice,
 * safety rules) that gets injected into every BB execution's input.
 */
import { z } from 'zod';
import { router, protectedProcedure } from '../trpc';
import { TRPCError } from '@trpc/server';
import { sharedContext, eq, and, desc, inArray } from '@baleyui/db';
import { uuidSchema } from '../helpers';
import { runContextProcessor } from '@/lib/baleybot/internal-bb/runner';

const categoryEnum = z.enum([
  'general',
  'domain_knowledge',
  'coding_standards',
  'safety_rules',
  'brand_voice',
]);

const contentTypeEnum = z.enum(['text', 'file']);

const fileMetadataSchema = z.object({
  fileName: z.string().min(1).max(500),
  fileType: z.string().min(1).max(100),
  fileSizeBytes: z.number().int().min(1).max(10 * 1024 * 1024),
  uploadedAt: z.string().datetime(),
});

export const sharedContextRouter = router({
  /**
   * List all shared context entries for the workspace.
   */
  list: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db.query.sharedContext.findMany({
      where: eq(sharedContext.workspaceId, ctx.workspace.id),
      orderBy: [desc(sharedContext.category), desc(sharedContext.key)],
    });
  }),

  /**
   * Create a new shared context entry.
   */
  create: protectedProcedure
    .input(
      z.object({
        key: z.string().min(1).max(255).trim(),
        value: z.string().min(1).max(500000).trim(),
        description: z.string().max(1000).trim().optional(),
        category: categoryEnum.optional().default('general'),
        contentType: contentTypeEnum.optional().default('text'),
        fileMetadata: fileMetadataSchema.optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Check for duplicate key in workspace
      const existing = await ctx.db.query.sharedContext.findFirst({
        where: and(
          eq(sharedContext.workspaceId, ctx.workspace.id),
          eq(sharedContext.key, input.key)
        ),
      });

      if (existing) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: `A shared context entry with key "${input.key}" already exists`,
        });
      }

      const [entry] = await ctx.db
        .insert(sharedContext)
        .values({
          workspaceId: ctx.workspace.id,
          key: input.key,
          value: input.value,
          description: input.description ?? null,
          category: input.category,
          contentType: input.contentType ?? 'text',
          fileMetadata: input.fileMetadata ?? null,
          isActive: true,
          createdBy: ctx.userId,
          updatedBy: ctx.userId,
        })
        .returning();

      return entry;
    }),

  /**
   * Update an existing shared context entry.
   */
  update: protectedProcedure
    .input(
      z.object({
        id: uuidSchema,
        value: z.string().min(1).max(500000).trim().optional(),
        description: z.string().max(1000).trim().optional(),
        category: categoryEnum.optional(),
        isActive: z.boolean().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.query.sharedContext.findFirst({
        where: and(
          eq(sharedContext.id, input.id),
          eq(sharedContext.workspaceId, ctx.workspace.id)
        ),
      });

      if (!existing) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Shared context entry not found' });
      }

      const updates: Record<string, unknown> = {
        updatedBy: ctx.userId,
        updatedAt: new Date(),
      };
      if (input.value !== undefined) updates.value = input.value;
      if (input.description !== undefined) updates.description = input.description;
      if (input.category !== undefined) updates.category = input.category;
      if (input.isActive !== undefined) updates.isActive = input.isActive;

      const [updated] = await ctx.db
        .update(sharedContext)
        .set(updates)
        .where(eq(sharedContext.id, input.id))
        .returning();

      return updated;
    }),

  /**
   * Delete a shared context entry (hard delete — config data, not user content).
   */
  delete: protectedProcedure
    .input(z.object({ id: uuidSchema }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.query.sharedContext.findFirst({
        where: and(
          eq(sharedContext.id, input.id),
          eq(sharedContext.workspaceId, ctx.workspace.id)
        ),
      });

      if (!existing) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Shared context entry not found' });
      }

      await ctx.db
        .delete(sharedContext)
        .where(eq(sharedContext.id, input.id));

      return { success: true };
    }),

  /**
   * Get all active shared context entries formatted for BB execution input enrichment.
   * Returns a formatted string or empty string if no active entries.
   */
  getForExecution: protectedProcedure.query(async ({ ctx }) => {
    const entries = await ctx.db.query.sharedContext.findMany({
      where: and(
        eq(sharedContext.workspaceId, ctx.workspace.id),
        eq(sharedContext.isActive, true)
      ),
      orderBy: [desc(sharedContext.category), desc(sharedContext.key)],
    });

    if (entries.length === 0) return '';

    return entries.map((e) => `- ${e.key}: ${e.value}`).join('\n');
  }),

  /**
   * Process raw content with AI to extract structured context entries.
   * Uses the context_processor internal BaleyBot to analyze and suggest entries.
   */
  processContent: protectedProcedure
    .input(z.object({
      content: z.string().min(1).max(500000),
      source: z.string().max(500).optional(),
      fileData: z.string().max(10_000_000).optional(),
      fileMimeType: z.string().max(200).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      // Fetch existing entries for deduplication context
      const existing = await ctx.db.query.sharedContext.findMany({
        where: eq(sharedContext.workspaceId, ctx.workspace.id),
        columns: { key: true, category: true },
      });

      const existingKeys = existing.map(e => `${e.category}/${e.key}`).join(', ');

      const prompt = [
        `Content source: ${input.source ?? 'pasted text'}`,
        existingKeys ? `Existing context keys (avoid duplicates): ${existingKeys}` : '',
        '',
        'Content to process:',
        input.content,
      ].filter(Boolean).join('\n');

      // Build attachments array for multi-modal content
      const attachments = input.fileData && input.fileMimeType
        ? [{ data: input.fileData, mimeType: input.fileMimeType }]
        : undefined;

      return runContextProcessor(prompt, {
        userWorkspaceId: ctx.workspace.id,
        triggeredBy: 'internal',
        fallbackMode: 'value',
        fallbackValue: { entries: [], summary: 'Processing failed', skippedReasons: ['Internal error'] },
        attachments,
      });
    }),

  /**
   * Bulk create entries from AI-suggested or manually batched entries.
   * Silently skips duplicates by key.
   */
  createBatch: protectedProcedure
    .input(z.object({
      entries: z.array(z.object({
        key: z.string().min(1).max(255).trim(),
        value: z.string().min(1).max(500000).trim(),
        description: z.string().max(1000).trim().optional(),
        category: categoryEnum.optional().default('general'),
        contentType: contentTypeEnum.optional().default('text'),
        fileMetadata: fileMetadataSchema.optional(),
      })).min(1).max(20),
    }))
    .mutation(async ({ ctx, input }) => {
      const results = [];
      for (const entry of input.entries) {
        // Skip duplicates silently
        const existing = await ctx.db.query.sharedContext.findFirst({
          where: and(
            eq(sharedContext.workspaceId, ctx.workspace.id),
            eq(sharedContext.key, entry.key)
          ),
        });
        if (existing) continue;

        const [created] = await ctx.db.insert(sharedContext).values({
          workspaceId: ctx.workspace.id,
          key: entry.key,
          value: entry.value,
          description: entry.description ?? null,
          category: entry.category,
          contentType: entry.contentType ?? 'text',
          fileMetadata: entry.fileMetadata ?? null,
          isActive: true,
          createdBy: ctx.userId,
          updatedBy: ctx.userId,
        }).returning();
        results.push(created);
      }
      return { created: results.length, entries: results };
    }),

  /**
   * Bulk delete shared context entries by IDs (hard delete).
   */
  bulkDelete: protectedProcedure
    .input(z.object({ ids: z.array(uuidSchema).min(1).max(50) }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .delete(sharedContext)
        .where(
          and(
            inArray(sharedContext.id, input.ids),
            eq(sharedContext.workspaceId, ctx.workspace.id)
          )
        );

      return { deleted: input.ids.length };
    }),

  /**
   * Bulk update shared context entries (activate/deactivate).
   */
  bulkUpdate: protectedProcedure
    .input(z.object({
      ids: z.array(uuidSchema).min(1).max(50),
      isActive: z.boolean(),
    }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .update(sharedContext)
        .set({
          isActive: input.isActive,
          updatedBy: ctx.userId,
          updatedAt: new Date(),
        })
        .where(
          and(
            inArray(sharedContext.id, input.ids),
            eq(sharedContext.workspaceId, ctx.workspace.id)
          )
        );

      return { updated: input.ids.length };
    }),
});
