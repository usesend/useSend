import type { MailerSendOptions, MailerTransport } from "./types";

interface SmtpTransporter {
  sendMail(mail: {
    from: string;
    to: string;
    subject: string;
    text: string;
    html: string;
    replyTo?: string;
  }): Promise<unknown>;
}

interface SmtpMailerConfig {
  createTransport: (opts: {
    host: string;
    port: number;
    secure: boolean;
    auth?: { user: string; pass: string };
  }) => SmtpTransporter;
  host: string;
  port: number;
  secure: boolean;
  user?: string;
  pass?: string;
  fromDefault?: string;
}

export class SmtpMailerTransport implements MailerTransport {
  private readonly transporter: SmtpTransporter;

  constructor(private readonly cfg: SmtpMailerConfig) {
    this.transporter = cfg.createTransport({
      host: cfg.host,
      port: cfg.port,
      secure: cfg.secure,
      auth: cfg.user ? { user: cfg.user, pass: cfg.pass ?? "" } : undefined,
    });
  }

  async send({
    to,
    subject,
    text,
    html,
    replyTo,
    fromOverride,
  }: MailerSendOptions): Promise<void> {
    const from = fromOverride ?? this.cfg.fromDefault;
    if (!from) {
      throw new Error("FROM_EMAIL is required for mailer");
    }
    await this.transporter.sendMail({ from, to, subject, text, html, replyTo });
  }
}
