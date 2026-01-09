import { createTRPCRouter, teamProcedure } from "~/server/api/trpc";
import { env } from "~/env";

export const settingsRouter = createTRPCRouter({
  getSmtpSettings: teamProcedure.query(async () => {
    return {
      host: env.SMTP_HOST,
      user: env.SMTP_USER,
    };
  }),
});
