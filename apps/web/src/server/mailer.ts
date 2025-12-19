import { env } from "~/env";
import { UseSend } from "usesend-js";
import { isSelfHosted } from "~/utils/common";
import { db } from "./db";
import { getDomains } from "./service/domain-service";
import { sendEmail } from "./service/email-service";
import { logger } from "./logger/log";
import {
  renderOtpEmail,
  renderTeamInviteEmail,
  renderPasswordResetEmail,
} from "./email-templates";

let usesend: UseSend | undefined;

const getClient = () => {
  if (!usesend) {
    usesend = new UseSend(env.USESEND_API_KEY ?? env.UNSEND_API_KEY);
  }
  return usesend;
};

export async function sendSignUpEmail(
  email: string,
  token: string,
  url: string
) {
  const { host } = new URL(url);

  if (env.NODE_ENV === "development") {
    logger.info({ email, url, token }, "Sending sign in email");
    return;
  }

  const subject = "Sign in to useSend";

  // Use jsx-email template for beautiful HTML
  const html = await renderOtpEmail({
    otpCode: token.toUpperCase(),
    loginUrl: url,
    hostName: host,
  });

  // Fallback text version
  const text = `Hey,\n\nYou can sign in to useSend by clicking the below URL:\n${url}\n\nYou can also use this OTP: ${token}\n\nThanks,\nuseSend Team`;

  await sendMail(email, subject, text, html);
}

export async function sendTeamInviteEmail(
  email: string,
  url: string,
  teamName: string
) {
  const { host } = new URL(url);

  if (env.NODE_ENV === "development") {
    logger.info({ email, url, teamName }, "Sending team invite email");
    return;
  }

  const subject = "You have been invited to join useSend";

  // Use jsx-email template for beautiful HTML
  const html = await renderTeamInviteEmail({
    teamName,
    inviteUrl: url,
  });

  // Fallback text version
  const text = `Hey,\n\nYou have been invited to join the team ${teamName} on useSend.\n\nYou can accept the invitation by clicking the below URL:\n${url}\n\nThanks,\nuseSend Team`;

  await sendMail(email, subject, text, html);
}

export async function sendPasswordResetEmail(email: string, token: string) {
  const resetUrl = `${env.NEXTAUTH_URL}/reset-password?token=${token}`;

  if (env.NODE_ENV === "development") {
    logger.info({ email, resetUrl, token }, "Sending password reset email");
    return;
  }

  const subject = "Reset your password";

  // Use jsx-email template for beautiful HTML
  const html = await renderPasswordResetEmail({
    resetUrl,
  });

  // Fallback text version
  const text = `Hey,\n\nWe received a request to reset your password for your useSend account.\n\nYou can reset your password by clicking the link below:\n${resetUrl}\n\nThis link will expire in 1 hour.\n\nIf you didn't request this, you can safely ignore this email.\n\nThanks,\nuseSend Team`;

  await sendMail(email, subject, text, html);
}

export async function sendSubscriptionConfirmationEmail(email: string) {
  if (!env.FOUNDER_EMAIL) {
    logger.error("FOUNDER_EMAIL not configured");
    return;
  }

  const subject = "Thanks for subscribing to useSend";
  const text = `Hey,\n\nThanks for subscribing to useSend, just wanted to let you know you can join the discord server to have a dedicated support channel for your team. So that we can address your queries / bugs asap.\n\nYou can join over using the link: https://discord.com/invite/BU8n8pJv8S\n\nIf you prefer slack, please let me know\n\ncheers,\nkoushik - useSend`;
  const html = text.replace(/\n/g, "<br />");

  await sendMail(email, subject, text, html, undefined, env.FOUNDER_EMAIL);
}

export async function sendMail(
  email: string,
  subject: string,
  text: string,
  html: string,
  replyTo?: string,
  fromOverride?: string
) {
  if (isSelfHosted()) {
    logger.info("Sending email using self hosted");
    /*
      Self hosted so checking if we can send using one of the available domain
      Assuming self hosted will have only one team
      TODO: fix this
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

    const candidateFroms = [fromOverride, env.FROM_EMAIL, `hello@${domain.name}`].filter(
      (value): value is string => Boolean(value)
    );

    const selectedFrom =
      candidateFroms.find((address) => {
        const domainPart = address.split("@")[1];
        return domainPart ? availableDomains.includes(domainPart) : false;
      }) ?? `hello@${domain.name}`;

    await sendEmail({
      teamId: team.id,
      to: email,
      from: selectedFrom,
      subject,
      text,
      html,
      replyTo,
    });
  } else if (env.UNSEND_API_KEY && (env.FROM_EMAIL || fromOverride)) {
    const fromAddress = fromOverride ?? env.FROM_EMAIL!;
    const resp = await getClient().emails.send({
      to: email,
      from: fromAddress,
      subject,
      text,
      html,
      replyTo,
    });

    if (resp.data) {
      logger.info("Email sent using usesend");
      return;
    } else {
      logger.error(
        { code: resp.error?.code, message: resp.error?.message },
        "Error sending email using usesend"
      );
    }
  } else {
    throw new Error("USESEND_API_KEY/UNSEND_API_KEY not found");
  }
}
