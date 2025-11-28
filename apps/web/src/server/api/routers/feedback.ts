import { z } from "zod";
import { TRPCError } from "@trpc/server";

import { createTRPCRouter, teamProcedure } from "~/server/api/trpc";
import { env } from "~/env";
import { isCloud } from "~/utils/common";
import { sendMail } from "~/server/mailer";
import { toPlainHtml } from "~/server/utils/email-content";

export const feedbackRouter = createTRPCRouter({
  send: teamProcedure
    .input(
      z.object({
        message: z.string().trim().min(1, "Feedback cannot be empty").max(2000),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (!isCloud()) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Feedback is only available on the cloud version.",
        });
      }

      if (!env.FOUNDER_EMAIL) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Feedback email is not configured.",
        });
      }

      const senderEmail = ctx.session.user.email ?? "Unknown";
      const senderName = ctx.session.user.name ?? "Unknown";

      const text = `New feedback received\n\nFrom: ${senderName} (${senderEmail})\nUser ID: ${ctx.session.user.id}\nTeam: ${ctx.team.name} (ID: ${ctx.team.id})\n\nMessage:\n${
        input.message
      }`;

      await sendMail(
        env.FOUNDER_EMAIL,
        `Product feedback from ${ctx.team.name}`,
        text,
        toPlainHtml(text),
        ctx.session.user.email ?? undefined,
      );

      return { success: true };
    }),
});
