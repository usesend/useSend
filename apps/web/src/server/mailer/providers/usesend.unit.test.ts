import { describe, expect, it, vi } from "vitest";
import { UseSendMailerTransport } from "~/server/mailer/providers/usesend";

describe("UseSendMailerTransport", () => {
  it("sends via useSend client with resolved from", async () => {
    const send = vi.fn().mockResolvedValue({ data: { id: "1" } });

    const transport = new UseSendMailerTransport({
      client: { emails: { send } },
      fromDefault: "hello@example.com",
    });

    await transport.send({ to: "to@x.com", subject: "s", text: "t", html: "h" });

    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({ to: "to@x.com", from: "hello@example.com" }),
    );
  });

  it("throws on useSend failure with error details", async () => {
    const send = vi.fn().mockResolvedValue({
      error: { code: "ERR", message: "boom" },
    });

    const transport = new UseSendMailerTransport({
      client: { emails: { send } },
      fromDefault: "hello@example.com",
    });

    await expect(
      transport.send({ to: "to@x.com", subject: "s", text: "t", html: "h" }),
    ).rejects.toThrow(/boom/);
  });

  it("throws when no from address is available", async () => {
    const transport = new UseSendMailerTransport({
      client: { emails: { send: vi.fn() } },
    });

    await expect(
      transport.send({ to: "to@x.com", subject: "s", text: "t", html: "h" }),
    ).rejects.toThrow("FROM_EMAIL is required for mailer");
  });
});
