import nodemailer from "nodemailer";
import { UseSend } from "usesend-js";
import { env } from "~/env";
import { getSesClient } from "~/server/aws/ses";
import { SesMailerTransport } from "./ses";
import { SmtpMailerTransport } from "./smtp";
import { UseSendMailerTransport } from "./usesend";
import { LegacySesTransport } from "./legacy-ses";
import type { MailerTransport } from "./types";

export function resolveMailerTransport(
  provider: string | undefined,
  isCloud: boolean,
): MailerTransport {
  if (provider === "ses") {
    return new SesMailerTransport({
      getSesClient,
      createTransport: nodemailer.createTransport,
      region: env.AWS_DEFAULT_REGION,
      fromDefault: env.FROM_EMAIL,
    });
  }

  if (provider === "smtp") {
    if (!env.MAILER_SMTP_HOST || !env.MAILER_SMTP_USER || !env.MAILER_SMTP_PASS) {
      throw new Error(
        "MAILER_PROVIDER=smtp requires MAILER_SMTP_HOST, MAILER_SMTP_USER, MAILER_SMTP_PASS",
      );
    }
    const port = env.MAILER_SMTP_PORT ? Number(env.MAILER_SMTP_PORT) : 587;
    const secure = env.MAILER_SMTP_SECURE === "true" || port === 465;
    return new SmtpMailerTransport({
      createTransport: nodemailer.createTransport,
      host: env.MAILER_SMTP_HOST,
      port,
      secure,
      user: env.MAILER_SMTP_USER,
      pass: env.MAILER_SMTP_PASS,
      fromDefault: env.FROM_EMAIL,
    });
  }

  if (provider === "usesend") {
    const apiKey = env.USESEND_API_KEY ?? env.UNSEND_API_KEY;
    if (!apiKey) {
      throw new Error(
        "MAILER_PROVIDER=usesend requires USESEND_API_KEY or UNSEND_API_KEY",
      );
    }
    return new UseSendMailerTransport({
      client: new UseSend(apiKey),
      fromDefault: env.FROM_EMAIL,
    });
  }

  // MAILER_PROVIDER unset -> backward-compatible default
  if (!isCloud) {
    return new LegacySesTransport();
  }

  const apiKey = env.USESEND_API_KEY ?? env.UNSEND_API_KEY;
  if (!apiKey) {
    throw new Error(
      "MAILER_PROVIDER=usesend requires USESEND_API_KEY or UNSEND_API_KEY",
    );
  }
  return new UseSendMailerTransport({
    client: new UseSend(apiKey),
    fromDefault: env.FROM_EMAIL,
  });
}

let cached: MailerTransport | undefined;

export function getMailerTransport(): MailerTransport {
  if (!cached) {
    cached = resolveMailerTransport(env.MAILER_PROVIDER, env.NEXT_PUBLIC_IS_CLOUD);
  }
  return cached;
}

export function __resetMailerTransportForTests(): void {
  cached = undefined;
}
