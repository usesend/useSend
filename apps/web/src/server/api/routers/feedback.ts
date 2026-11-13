import { TRPCError } from "@trpc/server";

import { createTRPCRouter, teamProcedure } from "~/server/api/trpc";
import {
  submitFeedback,
  submitFeedbackInput,
} from "~/server/service/feedback-service";
import { isCloud } from "~/utils/common";

export const feedbackRouter = createTRPCRouter({
  send: teamProcedure
    .input(submitFeedbackInput)
    .mutation(async ({ ctx, input }) => {
      if (!isCloud()) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Feedback is only available on the cloud version.",
        });
      }

      const { id } = await submitFeedback(
        {
          userId: ctx.session.user.id,
          team: { id: ctx.team.id, name: ctx.team.name },
        },
        input,
      );
      return { success: true, id };
    }),
});
