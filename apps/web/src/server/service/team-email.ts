import { logger } from "~/server/logger/log";
import { sendMail } from "~/server/mailer";
import { toPlainHtml } from "~/server/utils/email-content";
import { TeamService } from "~/server/service/team-service";

/**
 * Emails every member of a team from useSend, with replies going to
 * hey@usesend.com. Failures are logged, never thrown.
 */
export async function emailTeam(teamId: number, subject: string, text: string) {
  let teamUsers: Awaited<ReturnType<typeof TeamService.getTeamUsers>>;
  try {
    teamUsers = await TeamService.getTeamUsers(teamId);
  } catch (error) {
    logger.error(
      { err: error, teamId },
      "[TeamEmail]: Couldn't find the team's members",
    );
    return;
  }
  const recipients = teamUsers
    .map((teamUser) => teamUser.user?.email)
    .filter((email): email is string => Boolean(email));

  const results = await Promise.allSettled(
    recipients.map((to) =>
      sendMail(to, subject, text, toPlainHtml(text), "hey@usesend.com"),
    ),
  );
  results.forEach((result) => {
    if (result.status === "rejected") {
      logger.error(
        { err: result.reason, teamId },
        "[TeamEmail]: Team email failed",
      );
    }
  });
}
