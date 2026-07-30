export interface MailerSendOptions {
  to: string;
  subject: string;
  text: string;
  html: string;
  replyTo?: string;
  fromOverride?: string;
}

export interface MailerTransport {
  send(opts: MailerSendOptions): Promise<void>;
}
