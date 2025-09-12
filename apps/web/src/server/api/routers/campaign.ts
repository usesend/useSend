import { CampaignStatus, Prisma } from "@prisma/client";
import { TRPCError } from "@trpc/server";
import { EmailRenderer } from "@usesend/email-editor/src/renderer";
import { z } from "zod";
import { env } from "~/env";
import {
  teamProcedure,
  createTRPCRouter,
  campaignProcedure,
  publicProcedure,
} from "~/server/api/trpc";
import { logger } from "~/server/logger/log";
import { nanoid } from "~/server/nanoid";
import {
  sendCampaign,
  subscribeContact,
} from "~/server/service/campaign-service";
import { validateDomainFromEmail } from "~/server/service/domain-service";
import {
  getDocumentUploadUrl,
  isStorageConfigured,
} from "~/server/service/storage-service";

const statuses = Object.values(CampaignStatus) as [CampaignStatus];

export const campaignRouter = createTRPCRouter({
  getCampaigns: teamProcedure
    .input(
      z.object({
        page: z.number().optional(),
        status: z.enum(statuses).optional().nullable(),
      }),
    )
    .query(async ({ ctx: { db, team }, input }) => {
      let completeTime = performance.now();
      const page = input.page || 1;
      const limit = 30;
      const offset = (page - 1) * limit;

      const whereConditions: Prisma.CampaignFindManyArgs["where"] = {
        teamId: team.id,
      };

      if (input.status) {
        whereConditions.status = input.status;
      }

      const countP = db.campaign.count({ where: whereConditions });

      const campaignsP = db.campaign.findMany({
        where: whereConditions,
        select: {
          id: true,
          name: true,
          from: true,
          subject: true,
          createdAt: true,
          updatedAt: true,
          status: true,
        },
        orderBy: {
          createdAt: "desc",
        },
        skip: offset,
        take: limit,
      });
      let time = performance.now();

      campaignsP.then((campaigns) => {
        logger.info(
          `Time taken to get campaigns: ${performance.now() - time} milliseconds`,
        );
      });

      const [campaigns, count] = await Promise.all([campaignsP, countP]);
      logger.info(
        { duration: performance.now() - completeTime },
        `Time taken to complete request`,
      );

      return { campaigns, totalPage: Math.ceil(count / limit) };
    }),

  createCampaign: teamProcedure
    .input(
      z.object({
        name: z.string(),
        from: z.string(),
        subject: z.string(),
      }),
    )
    .mutation(async ({ ctx: { db, team }, input }) => {
      const domain = await validateDomainFromEmail(input.from, team.id);

      const campaign = await db.campaign.create({
        data: {
          ...input,
          teamId: team.id,
          domainId: domain.id,
        },
      });

      return campaign;
    }),

  updateCampaign: campaignProcedure
    .input(
      z.object({
        name: z.string().optional(),
        from: z.string().optional(),
        subject: z.string().optional(),
        previewText: z.string().optional(),
        content: z.string().optional(),
        contactBookId: z.string().optional(),
        replyTo: z.string().array().optional(),
      }),
    )
    .mutation(async ({ ctx: { db, team, campaign: campaignOld }, input }) => {
      const { campaignId, ...data } = input;
      if (data.contactBookId) {
        const contactBook = await db.contactBook.findUnique({
          where: { id: data.contactBookId },
        });

        if (!contactBook) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Contact book not found",
          });
        }
      }
      let domainId = campaignOld.domainId;
      if (data.from) {
        const domain = await validateDomainFromEmail(data.from, team.id);
        domainId = domain.id;
      }

      let html: string | null = null;

      if (data.content) {
        const jsonContent = data.content ? JSON.parse(data.content) : null;

        const renderer = new EmailRenderer(jsonContent);
        html = await renderer.render();
      }

      const campaign = await db.campaign.update({
        where: { id: campaignId },
        data: {
          ...data,
          html,
          domainId,
        },
      });
      return campaign;
    }),

  deleteCampaign: campaignProcedure.mutation(
    async ({ ctx: { db, team }, input }) => {
      const campaign = await db.campaign.delete({
        where: { id: input.campaignId, teamId: team.id },
      });
      return campaign;
    },
  ),

  getCampaign: campaignProcedure.query(async ({ ctx: { db, team }, input }) => {
    const campaign = await db.campaign.findUnique({
      where: { id: input.campaignId, teamId: team.id },
    });

    if (!campaign) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Campaign not found",
      });
    }

    const imageUploadSupported = isStorageConfigured();

    const processed = await db.email.count({
      where: { campaignId: input.campaignId },
    });

    if (campaign?.contactBookId) {
      const contactBook = await db.contactBook.findUnique({
        where: { id: campaign.contactBookId },
      });
      return { ...campaign, contactBook, imageUploadSupported, processed };
    }
    return {
      ...campaign,
      contactBook: null,
      imageUploadSupported,
      processed,
    };
  }),

  sendCampaign: campaignProcedure.mutation(
    async ({ ctx: { db, team }, input }) => {
      await sendCampaign(input.campaignId);
    },
  ),

  reSubscribeContact: publicProcedure
    .input(
      z.object({
        id: z.string(),
        hash: z.string(),
      }),
    )
    .mutation(async ({ ctx: { db }, input }) => {
      await subscribeContact(input.id, input.hash);
    }),

  duplicateCampaign: campaignProcedure.mutation(
    async ({ ctx: { db, team, campaign }, input }) => {
      const newCampaign = await db.campaign.create({
        data: {
          name: `${campaign.name} (Copy)`,
          from: campaign.from,
          subject: campaign.subject,
          content: campaign.content,
          teamId: team.id,
          domainId: campaign.domainId,
          contactBookId: campaign.contactBookId,
        },
      });

      return newCampaign;
    },
  ),

  scheduleCampaign: teamProcedure
    .input(
      z.object({
        campaignId: z.string(),
        scheduledAt: z.union([z.string().datetime(), z.date()]).optional(),
        batchSize: z.number().min(1).max(100_000).optional(),
      })
    )
    .mutation(async ({ ctx: { db, team }, input }) => {
      const campaign = await db.campaign.findUnique({
        where: { id: input.campaignId, teamId: team.id },
      });
      if (!campaign) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Campaign not found" });
      }

      if (!campaign.content) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "No content added for campaign" });
      }

      // Pre-render HTML from content for consistency with sendCampaign
      try {
        const jsonContent = JSON.parse(campaign.content);
        const renderer = new EmailRenderer(jsonContent);
        const html = await renderer.render();
        await db.campaign.update({ where: { id: campaign.id }, data: { html } });
      } catch (err) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid content" });
      }

      if (!campaign.contactBookId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "No contact book found for campaign" });
      }

      // Recalculate total subscribed contacts (cheap COUNT)
      const total = await db.contact.count({
        where: { contactBookId: campaign.contactBookId, subscribed: true },
      });

      const scheduledAt = input.scheduledAt
        ? input.scheduledAt instanceof Date
          ? input.scheduledAt
          : new Date(input.scheduledAt)
        : new Date();

      // If coming from DRAFT or SENT, reset cursor
      const shouldResetCursor = campaign.status === "DRAFT" || campaign.status === "SENT";

      await db.campaign.update({
        where: { id: campaign.id },
        data: {
          status: "SCHEDULED",
          scheduledAt,
          total,
          ...(input.batchSize ? { batchSize: input.batchSize } : {}),
          ...(shouldResetCursor ? { lastCursor: null } : {}),
        },
      });

      return { ok: true };
    }),

  pauseCampaign: campaignProcedure.mutation(async ({ ctx: { db, campaign } }) => {
    await db.campaign.update({ where: { id: campaign.id }, data: { status: "PAUSED" } });
    return { ok: true };
  }),

  resumeCampaign: campaignProcedure.mutation(async ({ ctx: { db, campaign } }) => {
    await db.campaign.update({ where: { id: campaign.id }, data: { status: "SCHEDULED" } });
    return { ok: true };
  }),

  generateImagePresignedUrl: campaignProcedure
    .input(
      z.object({
        name: z.string(),
        type: z.string(),
      }),
    )
    .mutation(async ({ ctx: { team }, input }) => {
      const extension = input.name.split(".").pop();
      const randomName = `${nanoid()}.${extension}`;

      const url = await getDocumentUploadUrl(
        `${team.id}/${randomName}`,
        input.type,
      );

      const imageUrl = `${env.S3_COMPATIBLE_PUBLIC_URL}/${team.id}/${randomName}`;

      return { uploadUrl: url, imageUrl };
    }),
});
