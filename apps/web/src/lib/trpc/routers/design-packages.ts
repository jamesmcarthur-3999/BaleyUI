/**
 * Design Packages Router — workspace-scoped design system configurations
 *
 * Manages design packages (color palettes, typography, border radius, mood)
 * that can be applied to retheme all shadcn/ui components via CSS custom properties.
 */
import { z } from 'zod';
import { router, protectedProcedure } from '../trpc';
import { TRPCError } from '@trpc/server';
import { designPackages, eq, and, desc, isNull } from '@baleyui/db';
import { uuidSchema, nameSchema, descriptionSchema } from '../helpers';
import {
  runDesignAnalyzer,
  runDesignGenerator,
  runDesignRefiner,
} from '@/lib/baleybot/internal-bb/runner';
import type { DesignPackageData } from '@/lib/design-packages/types';

const colorPaletteInput = z.object({
  background: z.string(),
  foreground: z.string(),
  card: z.string(),
  cardForeground: z.string(),
  primary: z.string(),
  primaryForeground: z.string(),
  secondary: z.string(),
  secondaryForeground: z.string(),
  muted: z.string(),
  mutedForeground: z.string(),
  accent: z.string(),
  accentForeground: z.string(),
  destructive: z.string(),
  destructiveForeground: z.string(),
  border: z.string(),
  input: z.string(),
  ring: z.string(),
  success: z.string(),
  warning: z.string(),
  error: z.string(),
  info: z.string(),
});

const packageDataInput = z.object({
  colors: z.object({
    light: colorPaletteInput,
    dark: colorPaletteInput,
  }),
  typography: z.object({
    fontFamily: z.string(),
    fontFamilyHeading: z.string().optional(),
    googleFontsUrl: z.string().optional(),
  }),
  borderRadius: z.string(),
  mood: z.enum(['playful', 'professional', 'minimal', 'elegant', 'bold']),
  animationStyle: z.enum(['playful', 'professional', 'minimal']),
});

const sourceResourceSchema = z.object({
  name: z.string(),
  type: z.string(),
  uploadedAt: z.string(),
});

export const designPackagesRouter = router({
  /**
   * List all design packages for the workspace.
   */
  list: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db.query.designPackages.findMany({
      where: and(
        eq(designPackages.workspaceId, ctx.workspace.id),
        isNull(designPackages.deletedAt)
      ),
      orderBy: [desc(designPackages.createdAt)],
    });
  }),

  /**
   * Get a single design package by ID.
   */
  get: protectedProcedure
    .input(z.object({ id: uuidSchema }))
    .query(async ({ ctx, input }) => {
      const pkg = await ctx.db.query.designPackages.findFirst({
        where: and(
          eq(designPackages.id, input.id),
          eq(designPackages.workspaceId, ctx.workspace.id),
          isNull(designPackages.deletedAt)
        ),
      });

      if (!pkg) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Design package not found',
        });
      }

      return pkg;
    }),

  /**
   * Analyze uploaded brand resources using the design_analyzer internal BB.
   * Returns extracted design attributes (colors, typography, mood, etc.).
   */
  analyze: protectedProcedure
    .input(
      z.object({
        resources: z.array(
          z.object({
            type: z.enum(['image', 'pdf', 'url', 'text']),
            content: z.string().max(500000),
            name: z.string().max(500),
          })
        ).min(1).max(10),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Separate resources by type with clear instructions per type
      const sections: string[] = [];

      const urls = input.resources.filter((r) => r.type === 'url');
      const images = input.resources.filter((r) => r.type === 'image');
      const texts = input.resources.filter((r) => r.type === 'text');
      const pdfs = input.resources.filter((r) => r.type === 'pdf');

      if (urls.length > 0) {
        sections.push(
          '## Website URLs (fetch with format:"html" to preserve CSS)\n' +
          urls.map((r) => `- ${r.content}`).join('\n')
        );
      }
      if (images.length > 0) {
        // For images, include only metadata — the content is base64 and too large for the prompt
        sections.push(
          '## Images (analyze for colors, typography, mood)\n' +
          images.map((r) => `- ${r.name} (${r.type})`).join('\n')
        );
      }
      if (pdfs.length > 0) {
        sections.push(
          '## PDF Documents\n' +
          pdfs.map((r) => `- ${r.name}: ${r.content.slice(0, 2000)}`).join('\n')
        );
      }
      if (texts.length > 0) {
        sections.push(
          '## Brand Descriptions\n' +
          texts.map((r) => r.content).join('\n\n')
        );
      }

      const prompt = [
        'Analyze the following brand resources and extract design attributes.',
        'For URLs, use fetch_url with format:"html" to get CSS data.',
        'Express all colors in HSL format (e.g., "262 83% 58%").',
        '',
        ...sections,
      ].join('\n');

      const result = await runDesignAnalyzer(prompt, {
        userWorkspaceId: ctx.workspace.id,
      });

      return result;
    }),

  /**
   * Generate a complete design package from analyzer output.
   */
  generate: protectedProcedure
    .input(
      z.object({
        analyzerOutput: z.record(z.string(), z.unknown()),
        preferences: z.string().max(2000).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const prompt = [
        'Generate a complete design package from these extracted design attributes.',
        '',
        'Extracted attributes:',
        JSON.stringify(input.analyzerOutput, null, 2),
        ...(input.preferences
          ? ['', 'User preferences:', input.preferences]
          : []),
      ].join('\n');

      const result = await runDesignGenerator(prompt, {
        userWorkspaceId: ctx.workspace.id,
      });

      return result;
    }),

  /**
   * Refine an existing design package using natural language feedback.
   */
  refine: protectedProcedure
    .input(
      z.object({
        currentPackageData: packageDataInput,
        prompt: z.string().min(1).max(2000),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const prompt = [
        'Refine the following design package based on user feedback.',
        '',
        'Current design package:',
        JSON.stringify(input.currentPackageData, null, 2),
        '',
        'User feedback:',
        input.prompt,
      ].join('\n');

      const result = await runDesignRefiner(prompt, {
        userWorkspaceId: ctx.workspace.id,
      });

      return result;
    }),

  /**
   * Save a design package to the database.
   */
  save: protectedProcedure
    .input(
      z.object({
        name: nameSchema,
        description: descriptionSchema,
        packageData: packageDataInput,
        sourceType: z.enum(['ai_generated', 'manual', 'preset']).optional().default('ai_generated'),
        sourceResources: z.array(sourceResourceSchema).optional(),
        isDefault: z.boolean().optional().default(false),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // If setting as default, unset any existing default
      if (input.isDefault) {
        await ctx.db
          .update(designPackages)
          .set({ isDefault: false, updatedBy: ctx.userId })
          .where(
            and(
              eq(designPackages.workspaceId, ctx.workspace.id),
              eq(designPackages.isDefault, true),
              isNull(designPackages.deletedAt)
            )
          );
      }

      const [pkg] = await ctx.db
        .insert(designPackages)
        .values({
          workspaceId: ctx.workspace.id,
          name: input.name,
          description: input.description ?? null,
          packageData: input.packageData as DesignPackageData,
          sourceType: input.sourceType,
          sourceResources: input.sourceResources ?? null,
          isDefault: input.isDefault,
          createdBy: ctx.userId,
          updatedBy: ctx.userId,
        })
        .returning();

      return pkg;
    }),

  /**
   * Update a design package. Supports both manual edits and AI refinement.
   */
  update: protectedProcedure
    .input(
      z.object({
        id: uuidSchema,
        name: nameSchema.optional(),
        description: descriptionSchema,
        packageData: packageDataInput.optional(),
        refinementPrompt: z.string().max(2000).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.query.designPackages.findFirst({
        where: and(
          eq(designPackages.id, input.id),
          eq(designPackages.workspaceId, ctx.workspace.id),
          isNull(designPackages.deletedAt)
        ),
      });

      if (!existing) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Design package not found',
        });
      }

      let newPackageData = input.packageData;

      // If refinement prompt is provided, use design_refiner
      if (input.refinementPrompt && !newPackageData) {
        const prompt = [
          'Refine the following design package based on user feedback.',
          '',
          'Current design package:',
          JSON.stringify(existing.packageData, null, 2),
          '',
          'User feedback:',
          input.refinementPrompt,
        ].join('\n');

        const refined = await runDesignRefiner(prompt, {
          userWorkspaceId: ctx.workspace.id,
        });

        newPackageData = refined as DesignPackageData;
      }

      const updates: Record<string, unknown> = {
        updatedBy: ctx.userId,
        updatedAt: new Date(),
        version: existing.version + 1,
      };

      if (input.name) updates.name = input.name;
      if (input.description !== undefined) updates.description = input.description ?? null;
      if (newPackageData) updates.packageData = newPackageData;

      const [updated] = await ctx.db
        .update(designPackages)
        .set(updates)
        .where(eq(designPackages.id, input.id))
        .returning();

      return updated;
    }),

  /**
   * Soft-delete a design package.
   */
  delete: protectedProcedure
    .input(z.object({ id: uuidSchema }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.query.designPackages.findFirst({
        where: and(
          eq(designPackages.id, input.id),
          eq(designPackages.workspaceId, ctx.workspace.id),
          isNull(designPackages.deletedAt)
        ),
      });

      if (!existing) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Design package not found',
        });
      }

      const [deleted] = await ctx.db
        .update(designPackages)
        .set({
          deletedAt: new Date(),
          deletedBy: ctx.userId,
          updatedBy: ctx.userId,
        })
        .where(eq(designPackages.id, input.id))
        .returning();

      return deleted;
    }),

  /**
   * Set a design package as the workspace default.
   */
  setDefault: protectedProcedure
    .input(z.object({ id: uuidSchema }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.query.designPackages.findFirst({
        where: and(
          eq(designPackages.id, input.id),
          eq(designPackages.workspaceId, ctx.workspace.id),
          isNull(designPackages.deletedAt)
        ),
      });

      if (!existing) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Design package not found',
        });
      }

      // Unset current default
      await ctx.db
        .update(designPackages)
        .set({ isDefault: false, updatedBy: ctx.userId })
        .where(
          and(
            eq(designPackages.workspaceId, ctx.workspace.id),
            eq(designPackages.isDefault, true),
            isNull(designPackages.deletedAt)
          )
        );

      // Set new default
      const [updated] = await ctx.db
        .update(designPackages)
        .set({
          isDefault: true,
          updatedBy: ctx.userId,
          updatedAt: new Date(),
        })
        .where(eq(designPackages.id, input.id))
        .returning();

      return updated;
    }),
});
