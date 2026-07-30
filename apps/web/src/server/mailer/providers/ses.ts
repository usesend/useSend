import { SendEmailCommand } from "@aws-sdk/client-sesv2";
import type { MailerSendOptions, MailerTransport } from "./types";

interface SesSender {
  send(command: SendEmailCommand): Promise<unknown>;
}

interface SesMailerConfig {
  getSesClient: (region: string) => SesSender;
  createTransport: (opts: { streamTransport: boolean }) => {
    sendMail: (mail: {
      from: string;
      to: string;
      subject: string;
      text: string;
      html: string;
      replyTo?: string;
    }) => Promise<{ message: AsyncIterable<Buffer | string> }>;
  };
  region: string;
  fromDefault?: string;
}

export class SesMailerTransport implements MailerTransport {
  constructor(private readonly cfg: SesMailerConfig) {}

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

    const { message } = await this.cfg
      .createTransport({ streamTransport: true })
      .sendMail({ from, to, subject, text, html, replyTo });

    const chunks: Buffer[] = [];
    for await (const chunk of message) {
      chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
    }
    const data = Buffer.concat(chunks);

    await this.cfg
      .getSesClient(this.cfg.region)
      .send(new SendEmailCommand({ Content: { Raw: { Data: data } } }));
  }
}
