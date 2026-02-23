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
import * as campaignService from "~/server/service/campaign-service";
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
        search: z.string().optional().nullable(),
      }),
    )
    .query(async ({ ctx: { db, team }, input }) => {
      const page = input.page || 1;
      const limit = 30;
      const offset = (page - 1) * limit;

      const whereConditions: Prisma.CampaignFindManyArgs["where"] = {
        teamId: team.id,
      };

      if (input.status) {
        whereConditions.status = input.status;
      }

      if (input.search) {
        whereConditions.OR = [
          {
            name: {
              contains: input.search,
              mode: "insensitive",
            },
          },
          {
            subject: {
              contains: input.search,
              mode: "insensitive",
            },
          },
        ];
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
          scheduledAt: true,
          total: true,
          sent: true,
          delivered: true,
          unsubscribed: true,
        },
        orderBy: {
          createdAt: "desc",
        },
        skip: offset,
        take: limit,
      });

      const [campaigns, count] = await Promise.all([campaignsP, countP]);

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
        html: z.string().optional(),
        contactBookId: z.string().optional(),
        replyTo: z.string().array().optional(),
      }),
    )
    .mutation(async ({ ctx: { db, team, campaign: campaignOld }, input }) => {
      const { html: htmlInput, campaignId, ...data } = input;
      if (data.contactBookId) {
        const contactBook = await db.contactBook.findUnique({
          where: { id: data.contactBookId, teamId: team.id },
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

      let htmlToSave: string | undefined;

      if (data.content) {
        const jsonContent = data.content ? JSON.parse(data.content) : null;

        const renderer = new EmailRenderer(jsonContent);
        htmlToSave = await renderer.render();
      } else if (typeof htmlInput === "string") {
        htmlToSave = htmlInput;
      }

      const campaignUpdateData: Prisma.CampaignUpdateInput = {
        ...data,
        domainId,
      };

      if (htmlToSave !== undefined) {
        campaignUpdateData.html = htmlToSave;
      }

      const campaign = await db.campaign.update({
        where: { id: campaignId },
        data: campaignUpdateData,
      });
      return campaign;
    }),

  deleteCampaign: campaignProcedure.mutation(async ({ input }) => {
    return await campaignService.deleteCampaign(input.campaignId);
  }),

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

    if (campaign?.contactBookId) {
      const contactBook = await db.contactBook.findUnique({
        where: { id: campaign.contactBookId, teamId: team.id },
      });
      return { ...campaign, contactBook, imageUploadSupported };
    }
    return {
      ...campaign,
      contactBook: null,
      imageUploadSupported,
    };
  }),

  latestEmails: campaignProcedure.query(
    async ({ ctx: { db, team, campaign } }) => {
      const emails = await db.email.findMany({
        where: {
          teamId: team.id,
          campaignId: campaign.id,
        },
        orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
        take: 10,
        select: {
          id: true,
          subject: true,
          to: true,
          latestStatus: true,
          createdAt: true,
          updatedAt: true,
          scheduledAt: true,
        },
      });

      return emails;
    },
  ),

  reSubscribeContact: publicProcedure
    .input(
      z.object({
        id: z.string(),
        hash: z.string(),
      }),
    )
    .mutation(async ({ input }) => {
      await campaignService.subscribeContact(input.id, input.hash);
    }),

  duplicateCampaign: campaignProcedure.mutation(
    async ({ ctx: { db, team, campaign } }) => {
      const newCampaign = await db.campaign.create({
        data: {
          name: `${campaign.name} (Copy)`,
          from: campaign.from,
          replyTo: campaign.replyTo,
          cc: campaign.cc,
          bcc: campaign.bcc,
          subject: campaign.subject,
          previewText: campaign.previewText,
          content: campaign.content,
          html: campaign.html,
          teamId: team.id,
          domainId: campaign.domainId,
          contactBookId: campaign.contactBookId,
        },
      });

      return newCampaign;
    },
  ),

  scheduleCampaign: campaignProcedure
    .input(
      z.object({
        campaignId: z.string(),
        scheduledAt: z.union([z.string().datetime(), z.date()]).optional(),
        batchSize: z.number().min(1).max(100_000).optional(),
      }),
    )
    .mutation(async ({ ctx: { team }, input }) => {
      await campaignService.scheduleCampaign({
        campaignId: input.campaignId,
        teamId: team.id,
        scheduledAt: input.scheduledAt,
        batchSize: input.batchSize,
      });
      return { ok: true };
    }),

  pauseCampaign: campaignProcedure.mutation(async ({ ctx: { campaign } }) => {
    await campaignService.pauseCampaign({
      campaignId: campaign.id,
      teamId: campaign.teamId,
    });
    return { ok: true };
  }),

  resumeCampaign: campaignProcedure.mutation(async ({ ctx: { campaign } }) => {
    await campaignService.resumeCampaign({
      campaignId: campaign.id,
      teamId: campaign.teamId,
    });
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
