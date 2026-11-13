import { env } from "~/env";
import { UseSend } from "usesend-js";
import { isSelfHosted } from "~/utils/common";
import { db } from "./db";
import { getDomains } from "./service/domain-service";
import { sendEmail } from "./service/email-service";
import { logger } from "./logger/log";
import { renderOtpEmail, renderTeamInviteEmail } from "./email-templates";
import { toPlainHtml } from "~/server/utils/email-content";

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
  url: string,
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
  teamName: string,
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
  fromOverride?: string,
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
        "Error sending email using usesend",
      );
    }
  } else {
    throw new Error("USESEND_API_KEY/UNSEND_API_KEY not found");
  }
}

/** Emails the founder about new feedback. Errors are the caller's to log. */
export async function sendFeedbackNotification(feedback: {
  id: string;
  email: string;
  name: string | null;
  userId: number | null;
  teamId: number | null;
  teamName: string | null;
  message: string;
}) {
  if (!env.FOUNDER_EMAIL) {
    logger.warn(
      "[Feedback]: FOUNDER_EMAIL not configured, not emailing feedback",
    );
    return;
  }

  const team = feedback.teamName ?? "Unknown team";
  const text = `New feedback received\n\nFrom: ${feedback.name ?? "Unknown"} (${feedback.email})\nUser ID: ${feedback.userId ?? "Unknown"}\nTeam: ${team} (ID: ${feedback.teamId ?? "Unknown"})\nFeedback ID: ${feedback.id}\n\nMessage:\n${feedback.message}`;

  await sendMail(
    env.FOUNDER_EMAIL,
    `Product feedback from ${team}`,
    text,
    toPlainHtml(text),
    feedback.email,
  );
}

/** The reply email was certainly not sent. Safe to send again. */
export class MailNotSentError extends Error {}

/** It's unknown whether the reply email went out, e.g. the connection dropped. */
export class MailUncertainError extends Error {}

/** API errors returned before anything is sent. */
const NOT_SENT_CODES = new Set([
  "BAD_REQUEST",
  "UNAUTHORIZED",
  "FORBIDDEN",
  "NOT_FOUND",
  "METHOD_NOT_ALLOWED",
  "RATE_LIMITED",
]);

/**
 * The API's error code. The SDK returns API errors either as `{ code }` or
 * still wrapped as `{ error: { code } }`, so read both.
 */
function errorCode(error: unknown): string | undefined {
  const outer = error as { code?: unknown; error?: { code?: unknown } } | null;
  const code = outer?.code ?? outer?.error?.code;
  return typeof code === "string" ? code : undefined;
}

/**
 * Emails a reply to someone's feedback through useSend's own API, with an
 * idempotency key as extra protection against a second send. Throws
 * `MailNotSentError` when it certainly wasn't sent and `MailUncertainError`
 * when it may have been.
 */
export async function sendFeedbackReply(params: {
  to: string;
  subject: string;
  text: string;
  idempotencyKey: string;
}) {
  const from = env.FOUNDER_EMAIL ?? env.FROM_EMAIL;
  if (!(env.USESEND_API_KEY ?? env.UNSEND_API_KEY) || !from) {
    throw new MailNotSentError("Replies need UNSEND_API_KEY and FOUNDER_EMAIL");
  }

  let response: Awaited<ReturnType<UseSend["emails"]["send"]>>;
  try {
    response = await getClient().emails.send(
      {
        to: params.to,
        from,
        replyTo: from,
        subject: params.subject,
        text: params.text,
        html: toPlainHtml(params.text),
      },
      { idempotencyKey: params.idempotencyKey },
    );
  } catch (error) {
    // The request may have reached the API before the connection failed.
    throw new MailUncertainError(
      error instanceof Error ? error.name : "Unknown",
    );
  }

  if (response.data) return { emailId: response.data.emailId };
  const code = errorCode(response.error) ?? "UNKNOWN";
  throw NOT_SENT_CODES.has(code)
    ? new MailNotSentError(code)
    : new MailUncertainError(code);
}
