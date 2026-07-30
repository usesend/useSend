import { env } from "~/env";
import { db } from "~/server/db";
import { getDomains } from "~/server/service/domain-service";
import { sendEmail } from "~/server/service/email-service";
import { logger } from "~/server/logger/log";
import type { MailerSendOptions, MailerTransport } from "./types";

export class LegacySesTransport implements MailerTransport {
  async send({
    to,
    subject,
    text,
    html,
    replyTo,
    fromOverride,
  }: MailerSendOptions): Promise<void> {
    logger.info("Sending email using self hosted");
    /*
      Self hosted so checking if we can send using one of the available domain
      Assuming self hosted will have only one team
    */
    const team = await db.team.findFirst({});
    if (!team) {
      logger.error("No team found");
      return;
    }

    const domains = await getDomains(team.id);

    if (domains.length === 0 || !domains[0]) {
      logger.error("No domains found");
      return;
    }

    const availableDomains = domains.map((d) => d.name);
    const domain = domains[0];

    const candidateFroms = [
      fromOverride,
      env.FROM_EMAIL,
      `hello@${domain.name}`,
    ].filter((value): value is string => Boolean(value));

    const selectedFrom =
      candidateFroms.find((address) => {
        const domainPart = address.split("@")[1];
        return domainPart ? availableDomains.includes(domainPart) : false;
      }) ?? `hello@${domain.name}`;

    await sendEmail({
      teamId: team.id,
      to,
      from: selectedFrom,
      subject,
      text,
      html,
      replyTo,
    });
  }
}
