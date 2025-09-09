import { z } from "zod";

import {
  createTRPCRouter,
  teamProcedure,
  protectedProcedure,
  domainProcedure,
} from "~/server/api/trpc";
import { db } from "~/server/db";
import {
  createDomain,
  deleteDomain,
  getDomain,
  updateDomain,
} from "~/server/service/domain-service";
import { sendEmail } from "~/server/service/email-service";
import { SesSettingsService } from "~/server/service/ses-settings-service";

export const domainRouter = createTRPCRouter({
  getAvailableRegions: protectedProcedure.query(async () => {
    const settings = await SesSettingsService.getAllSettings();
    return settings.map((setting) => setting.region);
  }),

  createDomain: teamProcedure
    .input(z.object({ name: z.string(), region: z.string() }))
    .mutation(async ({ ctx, input }) => {
      return createDomain(
        ctx.team.id,
        input.name,
        input.region,
        ctx.team.sesTenantId ?? undefined,
      );
    }),

  startVerification: domainProcedure.mutation(async ({ ctx, input }) => {
    await ctx.db.domain.update({
      where: { id: input.id },
      data: { isVerifying: true },
    });
  }),

  domains: teamProcedure.query(async ({ ctx }) => {
    const domains = await db.domain.findMany({
      where: {
        teamId: ctx.team.id,
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    return domains;
  }),

  getDomain: domainProcedure.query(async ({ input }) => {
    return getDomain(input.id);
  }),

  updateDomain: domainProcedure
    .input(
      z.object({
        clickTracking: z.boolean().optional(),
        openTracking: z.boolean().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      return updateDomain(input.id, {
        clickTracking: input.clickTracking,
        openTracking: input.openTracking,
      });
    }),

  deleteDomain: domainProcedure.mutation(async ({ input }) => {
    await deleteDomain(input.id);
    return { success: true };
  }),

  sendTestEmailFromDomain: domainProcedure.mutation(
    async ({
      ctx: {
        session: { user },
        team,
      },
      input,
    }) => {
      const domain = await db.domain.findFirst({
        where: { id: input.id, teamId: team.id },
      });

      if (!domain) {
        throw new Error("Domain not found");
      }

      if (!user.email) {
        throw new Error("User email not found");
      }

      return sendEmail({
        teamId: team.id,
        to: user.email,
        from: `hello@${domain.name}`,
        subject: "useSend test email",
        text: "hello,\n\nuseSend is the best open source sending platform\n\ncheck out https://usesend.com",
        html: "<p>hello,</p><p>useSend is the best open source sending platform<p><p>check out <a href='https://usesend.com'>usesend.com</a>",
      });
    },
  ),
});
