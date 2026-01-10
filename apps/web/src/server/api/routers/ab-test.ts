import { ABTestStatus, ABTestWinnerCriteria } from "@prisma/client";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  createTRPCRouter,
  teamProcedure,
  teamAdminProcedure,
} from "~/server/api/trpc";

export const abTestRouter = createTRPCRouter({
  // List all A/B tests for the team
  list: teamProcedure
    .input(
      z.object({
        status: z.nativeEnum(ABTestStatus).optional(),
        page: z.number().default(1),
      })
    )
    .query(async ({ ctx: { db, team }, input }) => {
      const limit = 20;
      const offset = (input.page - 1) * limit;

      const where = {
        teamId: team.id,
        ...(input.status ? { status: input.status } : {}),
      };

      const [tests, total] = await Promise.all([
        db.aBTest.findMany({
          where,
          include: {
            campaign: {
              select: {
                id: true,
                name: true,
                status: true,
              },
            },
            variants: {
              select: {
                id: true,
                name: true,
                subject: true,
                sent: true,
                delivered: true,
                opened: true,
                clicked: true,
                isWinner: true,
              },
            },
          },
          orderBy: { createdAt: "desc" },
          skip: offset,
          take: limit,
        }),
        db.aBTest.count({ where }),
      ]);

      return {
        tests,
        totalPages: Math.ceil(total / limit),
      };
    }),

  // Get a single A/B test with details
  get: teamProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx: { db, team }, input }) => {
      const test = await db.aBTest.findUnique({
        where: { id: input.id },
        include: {
          campaign: {
            select: {
              id: true,
              name: true,
              status: true,
              contactBookId: true,
              from: true,
            },
          },
          variants: true,
        },
      });

      if (!test || test.teamId !== team.id) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "A/B test not found",
        });
      }

      // Calculate metrics for each variant
      const variantsWithMetrics = test.variants.map((variant) => {
        const delivered = variant.delivered || 0;
        const opened = variant.opened || 0;
        const clicked = variant.clicked || 0;

        return {
          ...variant,
          openRate: delivered > 0 ? (opened / delivered) * 100 : 0,
          clickRate: delivered > 0 ? (clicked / delivered) * 100 : 0,
        };
      });

      return {
        ...test,
        variants: variantsWithMetrics,
      };
    }),

  // Create a new A/B test for a campaign
  create: teamAdminProcedure
    .input(
      z.object({
        campaignId: z.string(),
        name: z.string().min(1),
        winnerCriteria: z.nativeEnum(ABTestWinnerCriteria).default("OPEN_RATE"),
        testPercentage: z.number().min(5).max(50).default(20),
        testDurationHours: z.number().min(1).max(72).default(4),
        variants: z
          .array(
            z.object({
              name: z.string(),
              subject: z.string(),
              previewText: z.string().optional(),
              content: z.string().optional(),
              html: z.string().optional(),
            })
          )
          .min(2)
          .max(5),
      })
    )
    .mutation(async ({ ctx: { db, team }, input }) => {
      // Verify campaign belongs to team and is in draft status
      const campaign = await db.campaign.findUnique({
        where: { id: input.campaignId },
        include: { abTest: true },
      });

      if (!campaign || campaign.teamId !== team.id) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Campaign not found",
        });
      }

      if (campaign.status !== "DRAFT") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "A/B tests can only be created for draft campaigns",
        });
      }

      if (campaign.abTest) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "This campaign already has an A/B test",
        });
      }

      // Create the A/B test with variants
      const abTest = await db.aBTest.create({
        data: {
          name: input.name,
          teamId: team.id,
          campaignId: input.campaignId,
          winnerCriteria: input.winnerCriteria,
          testPercentage: input.testPercentage,
          testDurationHours: input.testDurationHours,
          variants: {
            create: input.variants.map((v, index) => ({
              name: v.name || String.fromCharCode(65 + index), // A, B, C...
              subject: v.subject,
              previewText: v.previewText,
              content: v.content,
              html: v.html,
            })),
          },
        },
        include: {
          variants: true,
        },
      });

      return abTest;
    }),

  // Update A/B test settings (only when in draft)
  update: teamAdminProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().min(1).optional(),
        winnerCriteria: z.nativeEnum(ABTestWinnerCriteria).optional(),
        testPercentage: z.number().min(5).max(50).optional(),
        testDurationHours: z.number().min(1).max(72).optional(),
      })
    )
    .mutation(async ({ ctx: { db, team }, input }) => {
      const existing = await db.aBTest.findUnique({
        where: { id: input.id },
      });

      if (!existing || existing.teamId !== team.id) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "A/B test not found",
        });
      }

      if (existing.status !== "DRAFT") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Can only update A/B tests in draft status",
        });
      }

      const { id, ...data } = input;

      const abTest = await db.aBTest.update({
        where: { id },
        data,
      });

      return abTest;
    }),

  // Update a variant
  updateVariant: teamAdminProcedure
    .input(
      z.object({
        variantId: z.string(),
        subject: z.string().optional(),
        previewText: z.string().optional(),
        content: z.string().optional(),
        html: z.string().optional(),
      })
    )
    .mutation(async ({ ctx: { db, team }, input }) => {
      const variant = await db.aBTestVariant.findUnique({
        where: { id: input.variantId },
        include: { abTest: true },
      });

      if (!variant || variant.abTest.teamId !== team.id) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Variant not found",
        });
      }

      if (variant.abTest.status !== "DRAFT") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Can only update variants in draft A/B tests",
        });
      }

      const { variantId, ...data } = input;

      const updated = await db.aBTestVariant.update({
        where: { id: variantId },
        data,
      });

      return updated;
    }),

  // Add a new variant to an existing test
  addVariant: teamAdminProcedure
    .input(
      z.object({
        abTestId: z.string(),
        name: z.string(),
        subject: z.string(),
        previewText: z.string().optional(),
        content: z.string().optional(),
        html: z.string().optional(),
      })
    )
    .mutation(async ({ ctx: { db, team }, input }) => {
      const abTest = await db.aBTest.findUnique({
        where: { id: input.abTestId },
        include: { variants: true },
      });

      if (!abTest || abTest.teamId !== team.id) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "A/B test not found",
        });
      }

      if (abTest.status !== "DRAFT") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Can only add variants to draft A/B tests",
        });
      }

      if (abTest.variants.length >= 5) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Maximum 5 variants allowed",
        });
      }

      const variant = await db.aBTestVariant.create({
        data: {
          abTestId: input.abTestId,
          name: input.name,
          subject: input.subject,
          previewText: input.previewText,
          content: input.content,
          html: input.html,
        },
      });

      return variant;
    }),

  // Delete a variant
  deleteVariant: teamAdminProcedure
    .input(z.object({ variantId: z.string() }))
    .mutation(async ({ ctx: { db, team }, input }) => {
      const variant = await db.aBTestVariant.findUnique({
        where: { id: input.variantId },
        include: { abTest: { include: { variants: true } } },
      });

      if (!variant || variant.abTest.teamId !== team.id) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Variant not found",
        });
      }

      if (variant.abTest.status !== "DRAFT") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Can only delete variants from draft A/B tests",
        });
      }

      if (variant.abTest.variants.length <= 2) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "A/B test must have at least 2 variants",
        });
      }

      await db.aBTestVariant.delete({
        where: { id: input.variantId },
      });

      return { success: true };
    }),

  // Manually select a winner
  selectWinner: teamAdminProcedure
    .input(
      z.object({
        abTestId: z.string(),
        variantId: z.string(),
      })
    )
    .mutation(async ({ ctx: { db, team }, input }) => {
      const abTest = await db.aBTest.findUnique({
        where: { id: input.abTestId },
        include: { variants: true },
      });

      if (!abTest || abTest.teamId !== team.id) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "A/B test not found",
        });
      }

      if (abTest.status !== "RUNNING") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Can only select winner for running A/B tests",
        });
      }

      const variant = abTest.variants.find((v) => v.id === input.variantId);
      if (!variant) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Variant not found in this A/B test",
        });
      }

      // Update the test and mark the winner
      await db.$transaction([
        db.aBTest.update({
          where: { id: input.abTestId },
          data: {
            status: "COMPLETED",
            winnerVariantId: input.variantId,
            completedAt: new Date(),
          },
        }),
        db.aBTestVariant.update({
          where: { id: input.variantId },
          data: { isWinner: true },
        }),
      ]);

      return { success: true };
    }),

  // Delete an A/B test
  delete: teamAdminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx: { db, team }, input }) => {
      const abTest = await db.aBTest.findUnique({
        where: { id: input.id },
      });

      if (!abTest || abTest.teamId !== team.id) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "A/B test not found",
        });
      }

      if (abTest.status === "RUNNING") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Cannot delete a running A/B test",
        });
      }

      await db.aBTest.delete({ where: { id: input.id } });

      return { success: true };
    }),

  // Get A/B test for a specific campaign
  getForCampaign: teamProcedure
    .input(z.object({ campaignId: z.string() }))
    .query(async ({ ctx: { db, team }, input }) => {
      const abTest = await db.aBTest.findUnique({
        where: { campaignId: input.campaignId },
        include: {
          variants: {
            orderBy: { name: "asc" },
          },
        },
      });

      if (abTest && abTest.teamId !== team.id) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "A/B test not found",
        });
      }

      if (!abTest) {
        return null;
      }

      // Calculate metrics
      const variantsWithMetrics = abTest.variants.map((variant) => {
        const delivered = variant.delivered || 0;
        const opened = variant.opened || 0;
        const clicked = variant.clicked || 0;

        return {
          ...variant,
          openRate: delivered > 0 ? (opened / delivered) * 100 : 0,
          clickRate: delivered > 0 ? (clicked / delivered) * 100 : 0,
        };
      });

      return {
        ...abTest,
        variants: variantsWithMetrics,
      };
    }),
});
