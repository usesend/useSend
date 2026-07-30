import type { MailerSendOptions, MailerTransport } from "./types";

interface UseSendSendResponse {
  data?: unknown;
  error?: { code?: string; message?: string };
}

interface UseSendMailerConfig {
  client: {
    emails: {
      send: (args: {
        to: string;
        from: string;
        subject: string;
        text: string;
        html: string;
        replyTo?: string;
      }) => Promise<UseSendSendResponse>;
    };
  };
  fromDefault?: string;
}

export class UseSendMailerTransport implements MailerTransport {
  constructor(private readonly cfg: UseSendMailerConfig) {}

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

    const resp = await this.cfg.client.emails.send({
      to,
      from,
      subject,
      text,
      html,
      replyTo,
    });

    if (!resp.data) {
      throw new Error(
        `useSend mailer failed: ${resp.error?.code ?? ""} ${resp.error?.message ?? ""}`.trim(),
      );
    }
  }
}
