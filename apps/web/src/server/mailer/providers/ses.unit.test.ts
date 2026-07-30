import { describe, expect, it, vi } from "vitest";
import { SendEmailCommand } from "@aws-sdk/client-sesv2";
import { SesMailerTransport } from "~/server/mailer/providers/ses";

function fakeMessage(...chunks: Buffer[]) {
  return {
    async *[Symbol.asyncIterator]() {
      for (const c of chunks) yield c;
    },
  };
}

describe("SesMailerTransport", () => {
  it("sends raw email via SES client with resolved from", async () => {
    const send = vi.fn().mockResolvedValue({});
    const getSesClient = vi.fn(() => ({ send }));
    const sendMail = vi
      .fn()
      .mockResolvedValue({ message: fakeMessage(Buffer.from("RAW")) });
    const createTransport = vi.fn(() => ({ sendMail }));

    const transport = new SesMailerTransport({
      getSesClient,
      createTransport,
      region: "us-east-1",
      fromDefault: "hello@example.com",
    });

    await transport.send({
      to: "to@x.com",
      subject: "s",
      text: "t",
      html: "<b>h</b>",
    });

    expect(createTransport).toHaveBeenCalledWith({ streamTransport: true });
    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({ from: "hello@example.com", to: "to@x.com" }),
    );
    expect(getSesClient).toHaveBeenCalledWith("us-east-1");
    expect(send).toHaveBeenCalledTimes(1);
    const command = send.mock.calls[0]?.[0];
    expect(command).toBeInstanceOf(SendEmailCommand);
    expect((command as SendEmailCommand).input.Content?.Raw?.Data).toBeInstanceOf(
      Buffer,
    );
  });

  it("uses fromOverride when provided", async () => {
    const sendMail = vi
      .fn()
      .mockResolvedValue({ message: fakeMessage(Buffer.from("R")) });
    const transport = new SesMailerTransport({
      getSesClient: () => ({ send: vi.fn().mockResolvedValue({}) }),
      createTransport: () => ({ sendMail }),
      region: "us-east-1",
      fromDefault: "hello@example.com",
    });

    await transport.send({
      to: "to@x.com",
      subject: "s",
      text: "t",
      html: "h",
      fromOverride: "other@example.com",
    });

    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({ from: "other@example.com" }),
    );
  });

  it("throws when no from address is available", async () => {
    const transport = new SesMailerTransport({
      getSesClient: () => ({ send: vi.fn() }),
      createTransport: () => ({ sendMail: vi.fn() }),
      region: "us-east-1",
    });

    await expect(
      transport.send({ to: "to@x.com", subject: "s", text: "t", html: "h" }),
    ).rejects.toThrow("FROM_EMAIL is required for mailer");
  });
});
