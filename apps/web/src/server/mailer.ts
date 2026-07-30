import { env } from "~/env";
import { logger } from "./logger/log";
import { renderOtpEmail, renderTeamInviteEmail } from "./email-templates";
import { getMailerTransport } from "./mailer/providers/resolve";

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
  await getMailerTransport().send({
    to: email,
    subject,
    text,
    html,
    replyTo,
    fromOverride,
  });
}
